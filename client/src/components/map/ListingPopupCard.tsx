import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { formatPrice } from '@/lib/format';
import { qk } from '@/queries/keys';
import { fetchSavedAmong, saveListing, unsaveListing } from '@/services/saved';
import type { MapPoint } from '@/services/search';

interface Props {
  point: MapPoint;
  /** Opens the full listing — the card is a preview, not the whole thing. */
  onOpen: (id: string) => void;
}

/** "3 חדרים • קומה 2 • 86 מ״ר", leaving out whatever the listing does not say. */
function specLine(point: MapPoint): string {
  return [
    point.rooms !== null && `${point.rooms} חדרים`,
    point.floor !== null && `קומה ${point.floor}`,
    point.squareMeter !== null && `${point.squareMeter} מ״ר`,
  ]
    .filter(Boolean)
    .join(' • ');
}

/** "דירה, ניצנה, בת ים" */
function placeLine(point: MapPoint): string {
  return [point.propertyType, point.neighborhood, point.city].filter(Boolean).join(', ');
}

export function ListingPopupCard({ point, onOpen }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ids = [point.id];

  const { data: saved } = useQuery({
    queryKey: qk.saved.among(ids),
    queryFn: () => fetchSavedAmong(ids),
    // Only a signed-in person has anything saved, and asking while logged out is a
    // guaranteed 401.
    enabled: Boolean(user),
  });

  const isSaved = saved?.has(point.id) ?? false;

  const toggle = useMutation({
    mutationFn: () => (isSaved ? unsaveListing(point.id) : saveListing(point.id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.saved.all }),
  });

  return (
    <div className="w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white shadow-xl">
      <div className="flex items-stretch">
        {/*
          Image first in the DOM, which in an RTL column puts it on the right — where
          the design this follows has it. Everything here is laid out in logical
          properties, so an LTR locale mirrors it without a second stylesheet.
        */}
        <button
          type="button"
          onClick={() => onOpen(point.id)}
          className="relative h-32 w-36 shrink-0 bg-slate-100 text-start"
          aria-label="פתיחת הנכס"
        >
          {point.coverImageUrl ? (
            <img
              src={point.coverImageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs text-slate-400">
              ללא תמונה
            </span>
          )}

          {point.isExclusive && (
            <span className="absolute end-2 top-2 rounded-md bg-white/95 px-2 py-0.5 text-xs font-semibold text-slate-900 shadow-sm">
              בלעדי
            </span>
          )}

          {point.agencyName && (
            // A gradient rather than a solid strip: the agency name has to stay legible
            // over whatever the photo happens to be behind it.
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4 text-start text-xs font-medium text-white">
              {point.agencyName}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onOpen(point.id)}
          className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-3 text-start"
        >
          <p className="text-lg font-bold text-slate-900">{formatPrice(point.price)}</p>
          {point.street && <p className="truncate text-sm text-slate-700">{point.street}</p>}
          <p className="truncate text-sm text-slate-500">{placeLine(point)}</p>
          <p className="truncate text-sm text-slate-500">{specLine(point)}</p>
        </button>

        <div className="flex items-start p-2">
          {user ? (
            <button
              type="button"
              onClick={() => toggle.mutate()}
              disabled={toggle.isPending}
              aria-pressed={isSaved}
              aria-label={isSaved ? 'הסרה מהשמורים' : 'שמירת הנכס'}
              className="rounded-full p-1.5 transition hover:bg-slate-100 disabled:opacity-50"
            >
              <Heart
                className={`h-5 w-5 ${isSaved ? 'fill-orange-600 text-orange-600' : 'text-slate-400'}`}
              />
            </button>
          ) : (
            <Link
              to="/login"
              aria-label="התחברות כדי לשמור נכסים"
              className="rounded-full p-1.5 transition hover:bg-slate-100"
            >
              <Heart className="h-5 w-5 text-slate-400" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
