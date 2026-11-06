import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { formatDate, formatPrice } from '@/lib/format';
import { qk } from '@/queries/keys';
import {
  LISTING_REJECTION_PRESETS,
  approveListing,
  fetchPendingListings,
  rejectListing,
  type PendingListing,
} from '@/services/admin';

const SECTION: Record<string, string> = {
  forsale: 'למכירה',
  rent: 'להשכרה',
  commercial: 'מסחרי',
};

function address(listing: PendingListing) {
  return [[listing.street, listing.houseNumber].filter(Boolean).join(' '), listing.city]
    .filter(Boolean)
    .join(', ');
}

/**
 * Private listings waiting for a person, shown on ניהול פלטפורמה while review mode is on.
 *
 * Approving publishes the listing and emails the owner a link. Declining emails them
 * the note, which starts from one of the suggested reasons and can be rewritten.
 */
export function ListingReviewQueue() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: listings = null } = useQuery({
    queryKey: qk.admin.listings,
    queryFn: fetchPendingListings,
  });

  const [rejecting, setRejecting] = useState<PendingListing | null>(null);
  const [note, setNote] = useState('');

  const reload = () => queryClient.invalidateQueries({ queryKey: qk.admin.listings });

  const approve = useMutation({
    mutationFn: (id: string) => approveListing(id),
    onSuccess: async () => {
      toast.success('הנכס אושר ונשלח אימייל לבעלים.');
      await reload();
    },
    onError: (e) => toast.error(errorMessageOf(e, 'האישור נכשל.')),
  });

  const reject = useMutation({
    mutationFn: ({ id, note: why }: { id: string; note: string }) => rejectListing(id, why),
    onSuccess: async () => {
      setRejecting(null);
      setNote('');
      toast.success('הנכס לא אושר, ונשלח אימייל לבעלים.');
      await reload();
    },
    onError: (e) => toast.error(errorMessageOf(e, 'הדחייה נכשלה.')),
  });

  const close = () => {
    setRejecting(null);
    setNote('');
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold text-slate-900">נכסים לבדיקה</h2>

      {listings === null && <p className="text-sm text-slate-500">טוען…</p>}

      {listings?.length === 0 && (
        <p className="text-sm text-slate-500">אין נכסים שממתינים לבדיקה.</p>
      )}

      <ul className="flex flex-col gap-3">
        {(listings ?? []).map((listing) => {
          const where = address(listing) || 'ללא כתובת';
          const owner = `${listing.owner.firstName} ${listing.owner.lastName}`.trim();

          return (
            <li key={listing.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex gap-4">
                <div className="h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {listing.coverImageUrl ? (
                    <img src={listing.coverImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-xs text-slate-500">
                      ללא תמונה
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="text-lg font-bold text-slate-900">{formatPrice(listing.price)}</p>
                    <span className="text-xs text-slate-500">{SECTION[listing.section] ?? listing.section}</span>
                  </div>
                  <p className="truncate text-sm text-slate-700">{where}</p>
                  <p className="truncate text-sm text-slate-500">
                    {[listing.propertyType, listing.rooms && `${listing.rooms} חדרים`,
                      listing.squareMeter && `${listing.squareMeter} מ״ר`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {owner || 'משתמש'} · {listing.owner.email} · {formatDate(listing.createdAt)}
                  </p>
                  {listing.reviewStatus === 'flagged' && listing.reviewReason && (
                    <p className="mt-2 text-xs text-amber-800">
                      הבדיקה האוטומטית סימנה: {listing.reviewReason}
                    </p>
                  )}
                  {listing.description && (
                    <p className="mt-2 line-clamp-3 text-sm text-slate-600">{listing.description}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <Button
                  disabled={approve.isPending || reject.isPending}
                  onClick={() => approve.mutate(listing.id)}
                >
                  {approve.isPending ? 'מאשר…' : 'אשר'}
                </Button>
                <Button
                  variant="ghost"
                  disabled={approve.isPending || reject.isPending}
                  onClick={() => {
                    setNote('');
                    setRejecting(listing);
                  }}
                >
                  לא לאשר
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && close()}
        title="לא לאשר את הנכס?"
        description={
          rejecting
            ? `${address(rejecting) || 'הנכס'} לא יפורסם, והטקסט כאן יישלח באימייל לבעלים.`
            : undefined
        }
        confirmLabel="שליחה לבעלים"
        confirmDisabled={note.trim() === ''}
        busy={reject.isPending}
        onConfirm={() => rejecting && reject.mutate({ id: rejecting.id, note: note.trim() })}
      >
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {LISTING_REJECTION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setNote(preset)}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:border-slate-400"
              >
                {preset}
              </button>
            ))}
          </div>
          <Field label="מה נשלח למשתמש" htmlFor="listing-reject-note">
            <textarea
              id="listing-reject-note"
              rows={3}
              maxLength={500}
              className={inputClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
      </ConfirmDialog>
    </section>
  );
}
