import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Heart, MessageSquare, Phone, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { formatPrice } from '@/lib/format';
import { errorMessageOf } from '@/lib/apiError';
import { qk } from '@/queries/keys';
import {
  archiveMyListing,
  fetchMyListings,
  fetchMyStats,
  publishMyListing,
  type ListingStats,
  type SellerListing,
} from '@/services/seller';

const EMPTY_STATS: Omit<ListingStats, 'listingId'> = {
  views: 0,
  phoneReveals: 0,
  saves: 0,
  enquiries: 0,
};

/** One figure, with what it counts spelled out underneath. */
function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Eye;
  value: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-slate-50 p-3">
      <Icon className="h-4 w-4 text-slate-400" aria-hidden />
      <span className="text-lg font-bold text-slate-900">{value}</span>
      <span className="text-center text-[0.7rem] leading-tight text-slate-500">{label}</span>
    </div>
  );
}

/**
 * What a private seller has published, and how each one is doing.
 *
 * The figures are counts of people, not of page loads — the labels say so, because
 * "47 views" means something quite different depending on which it is, and a seller
 * deciding whether to drop the price deserves the one that is true.
 */
export function MySalePage() {
  const queryClient = useQueryClient();

  const { data: listings, isPending } = useQuery({
    queryKey: qk.mySale.list,
    queryFn: fetchMyListings,
  });

  const { data: stats } = useQuery({
    queryKey: qk.mySale.stats,
    queryFn: fetchMyStats,
  });

  const byListing = new Map((stats ?? []).map((row) => [row.listingId, row]));

  const setPublished = useMutation({
    mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
      publish ? publishMyListing(id) : archiveMyListing(id),
    onSuccess: (_r, { publish }) => {
      void queryClient.invalidateQueries({ queryKey: qk.mySale.all });
      toast.success(publish ? 'הנכס חזר לפרסום.' : 'הנכס הוסר מהפרסום.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'הפעולה נכשלה.')),
  });

  const address = (listing: SellerListing) =>
    [[listing.street, listing.houseNumber].filter(Boolean).join(' '), listing.city]
      .filter(Boolean)
      .join(', ');

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-8">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">הנכסים שלי למכירה</h1>
            <p className="text-sm text-slate-500">
              {isPending ? 'טוען…' : `${listings?.length ?? 0} נכסים`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-slate-600 hover:text-slate-900">
              לחיפוש
            </Link>
            <Link
              to="/sell/new"
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" aria-hidden />
              פרסום נכס
            </Link>
          </div>
        </header>

        {!isPending && (listings?.length ?? 0) === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-12 text-center">
            <p className="font-medium text-slate-800">עדיין לא פרסמתם נכס</p>
            <p className="max-w-sm text-sm text-slate-500">
              פרסום ישיר, בלי סוכנות ובלי עמלה. אחרי הפרסום תראו כאן כמה אנשים צפו בנכס,
              שמרו אותו וביקשו את מספר הטלפון.
            </p>
            <Link to="/sell/new" className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              פרסום נכס
            </Link>
          </div>
        )}

        <ul className="flex flex-col gap-4">
          {(listings ?? []).map((listing) => {
            const figures = byListing.get(listing.id) ?? EMPTY_STATS;
            const published = listing.status === 'published';

            return (
              <li key={listing.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex gap-4 p-4">
                  <div className="h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    {listing.coverImageUrl ? (
                      <img src={listing.coverImageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs text-slate-400">
                        ללא תמונה
                      </span>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-lg font-bold text-slate-900">{formatPrice(listing.price)}</p>
                      {!published && (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          לא מפורסם
                        </span>
                      )}
                    </div>

                    <p className="truncate text-sm text-slate-600">{address(listing)}</p>
                    <p className="truncate text-sm text-slate-500">
                      {[listing.propertyType, listing.rooms && `${listing.rooms} חדרים`,
                        listing.squareMeter && `${listing.squareMeter} מ״ר`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>

                    <div className="mt-1 flex items-center gap-3 text-sm">
                      <Link to={`/sell/${listing.id}`} className="text-blue-700 hover:underline">
                        עריכה
                      </Link>
                      <button
                        type="button"
                        onClick={() => setPublished.mutate({ id: listing.id, publish: !published })}
                        disabled={setPublished.isPending}
                        className="text-slate-500 hover:text-slate-900 disabled:opacity-50"
                      >
                        {published ? 'הסרה מהפרסום' : 'פרסום מחדש'}
                      </button>
                    </div>
                  </div>
                </div>

                {/*
                  Counts of people, said plainly. "47 צפיות" would be read as page loads
                  and would be the wrong number to price a flat against.
                */}
                <div className="grid grid-cols-4 gap-2 border-t border-slate-100 bg-white p-3">
                  <Stat icon={Eye} value={figures.views} label="אנשים שצפו" />
                  <Stat icon={Heart} value={figures.saves} label="אנשים ששמרו" />
                  <Stat icon={Phone} value={figures.phoneReveals} label="ביקשו טלפון" />
                  <Stat icon={MessageSquare} value={figures.enquiries} label="פניות" />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
