import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Heart, MessageSquare, Phone, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatPrice } from '@/lib/format';
import { SiteHeader } from '@/components/SiteHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { errorMessageOf } from '@/lib/apiError';
import { qk } from '@/queries/keys';
import {
  archiveMyListing,
  deleteMyListing,
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
  /** The listing a seller has asked to delete, held until they confirm it. */
  const [deleting, setDeleting] = useState<SellerListing | null>(null);

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
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) => {
      if (!publish) {
        await archiveMyListing(id);
        return { published: false, archived: true };
      }
      // Publishing runs the spam check again, so a listing held back once can be fixed
      // and sent again — and one that still does not pass stays where it is.
      return { ...(await publishMyListing(id)), archived: false };
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: qk.mySale.all });
      if (result.archived) toast.success('הנכס הוסר מהפרסום.');
      else if (result.published) toast.success('הנכס חזר לפרסום.');
      else toast('הנכס נשלח לבדיקה. נעדכן אתכם לאחר שתאושר.', { duration: 8000 });
    },
    onError: (e) => toast.error(errorMessageOf(e, 'הפעולה נכשלה.')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteMyListing(id),
    onSuccess: () => {
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: qk.mySale.all });
      toast.success('הנכס נמחק.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'המחיקה נכשלה.')),
  });

  const address = (listing: SellerListing) =>
    [[listing.street, listing.houseNumber].filter(Boolean).join(' '), listing.city]
      .filter(Boolean)
      .join(', ');

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

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
                        // "Waiting" and "taken down" are different states and a seller
                        // chose only one of them. Saying "not published" for both reads
                        // as something they did, when one of them is something we did.
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${
                            listing.reviewStatus === 'flagged'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {listing.reviewStatus === 'flagged' ? 'ממתין לבדיקה' : 'לא מפורסם'}
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

                    {/* Wraps: three actions and a narrow card on a phone is how a row
                        like this ends up with its last item off the edge. */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
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

                      {/*
                        Last, apart, and the only one that is not blue: taking a listing
                        off the market and deleting it are one word apart in Hebrew and
                        a world apart in effect, so they do not sit together looking
                        alike.
                      */}
                      <button
                        type="button"
                        onClick={() => setDeleting(listing)}
                        aria-label={`מחיקת ${address(listing) || 'הנכס'}`}
                        className="ms-auto flex items-center gap-1 text-slate-400 transition hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        מחיקה
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

      {/*
        Says what goes, rather than asking "are you sure?" about an unnamed thing. The
        photographs are the part people do not expect to lose, and the enquiries are
        the part they would be upset to lose — so both are named, including the one
        that survives.
      */}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="למחוק את הנכס?"
        description={
          deleting
            ? `${address(deleting) || 'הנכס'} יימחק לתמיד, יחד עם התמונות שהעליתם ועם מספר הצפיות והשמירות. פניות שכבר התקבלו יישמרו אצלכם, בלי הקישור לנכס. כדי להסתיר את הנכס מבלי למחוק אותו, השתמשו ב"הסרה מהפרסום".`
            : undefined
        }
        confirmLabel="מחיקה לתמיד"
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}
