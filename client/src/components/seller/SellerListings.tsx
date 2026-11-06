import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Heart, MessageSquare, Phone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatPrice } from '@/lib/format';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { errorMessageOf } from '@/lib/apiError';
import { qk } from '@/queries/keys';
import {
  archiveMyListing,
  fetchMyListings,
  fetchMyStats,
  publishMyListing,
  REMOVAL_REASONS,
  removeMyListing,
  type ListingStats,
  type RemovalReason,
  type SellerListing,
} from '@/services/seller';

const EMPTY_STATS: Omit<ListingStats, 'listingId'> = {
  views: 0,
  phoneReveals: 0,
  saves: 0,
  enquiries: 0,
};

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
      <Icon className="h-4 w-4 text-slate-500" aria-hidden />
      <span className="text-lg font-bold text-slate-900">{value}</span>
      <span className="text-center text-[0.7rem] leading-tight text-slate-500">{label}</span>
    </div>
  );
}

/**
 * A private seller's listings: edit, take off the market, or remove.
 *
 * Removing asks why and hides the row. It does not delete it.
 */
export function SellerListings() {
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<SellerListing | null>(null);
  const [reason, setReason] = useState<RemovalReason | null>(null);

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
    mutationFn: ({ id, reason: why }: { id: string; reason: RemovalReason }) => removeMyListing(id, why),
    onSuccess: () => {
      setRemoving(null);
      setReason(null);
      void queryClient.invalidateQueries({ queryKey: qk.mySale.all });
      toast.success('הנכס הוסר ולא יוצג יותר.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'ההסרה נכשלה.')),
  });

  const address = (listing: SellerListing) =>
    [[listing.street, listing.houseNumber].filter(Boolean).join(' '), listing.city]
      .filter(Boolean)
      .join(', ');

  const close = () => {
    setRemoving(null);
    setReason(null);
  };

  return (
    <>
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
                    <span className="flex h-full items-center justify-center text-xs text-slate-500">
                      ללא תמונה
                    </span>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <p className="text-lg font-bold text-slate-900">{formatPrice(listing.price)}</p>
                    {!published && (
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
                    <button
                      type="button"
                      onClick={() => {
                        setReason(null);
                        setRemoving(listing);
                      }}
                      aria-label={`הסרת ${address(listing) || 'הנכס'}`}
                      className="ms-auto flex items-center gap-1 text-slate-500 transition hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      הסרה
                    </button>
                  </div>
                </div>
              </div>

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

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && close()}
        title="להסיר את הנכס?"
        description={
          removing
            ? `${address(removing) || 'הנכס'} לא יוצג יותר ברשימות. הוא נשמר אצלנו, ואנחנו רוצים לדעת למה הוא יורד. כדי להסתיר אותו זמנית, השתמשו ב"הסרה מהפרסום".`
            : undefined
        }
        confirmLabel="הסרה"
        confirmDisabled={reason === null}
        busy={remove.isPending}
        onConfirm={() => removing && reason && remove.mutate({ id: removing.id, reason })}
      >
        <fieldset className="mt-4 flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-800">למה הנכס יורד?</legend>
          {REMOVAL_REASONS.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="removal-reason"
                value={option.value}
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      </ConfirmDialog>
    </>
  );
}
