import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Phone } from 'lucide-react';
import { OUTCOME_CLASS, OUTCOME_LABEL } from '@/lib/viewingOutcome';
import { qk } from '@/queries/keys';
import { fetchListingViewings } from '@/services/calendar';

const when = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Who has been to see this property.
 *
 * The agency's, not one agent's: an owner ringing to ask how the viewings are going
 * should get an answer from whoever picks up, not only from whoever held the keys.
 *
 * Newest first, and the summary of each one beside it — "four viewings, three said the
 * kitchen" is the sentence this panel exists to make possible, and it is also the
 * evidence behind telling a seller their price is wrong.
 */
export function ViewingHistory({ listingId }: { listingId: string }) {
  const { data, isPending } = useQuery({
    queryKey: qk.meetings.forListing(listingId),
    queryFn: () => fetchListingViewings(listingId),
  });

  const viewings = data ?? [];
  // Read once on mount. Whether a viewing is past or still to come does not change
  // while somebody reads the panel, and a clock called per row can disagree with itself.
  const [now] = useState(() => Date.now());
  const past = viewings.filter((m) => new Date(m.endsAt).getTime() < now);
  const upcoming = viewings.filter((m) => new Date(m.endsAt).getTime() >= now);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">ביקורים בנכס</h2>
        {!isPending && viewings.length > 0 && (
          <span className="text-xs text-slate-500">
            {past.length} התקיימו{upcoming.length > 0 ? `, ${upcoming.length} קבועים` : ''}
          </span>
        )}
      </div>

      {isPending && <p className="text-sm text-slate-500">טוען…</p>}

      {!isPending && viewings.length === 0 && (
        <p className="text-sm text-slate-500">
          עדיין לא נקבעו ביקורים בנכס הזה. פגישה שתשויך אליו ביומן תופיע כאן.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {viewings.map((viewing) => {
          const isPast = new Date(viewing.endsAt).getTime() < now;

          return (
            <li
              key={viewing.id}
              className={`rounded-lg border p-3 text-sm ${
                isPast ? 'border-slate-200' : 'border-blue-200 bg-blue-50/40'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">
                  {viewing.customer?.name ?? 'ללא לקוח משויך'}
                </span>

                {viewing.customer?.phone && (
                  <a
                    href={`tel:${viewing.customer.phone}`}
                    dir="ltr"
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
                  >
                    <Phone className="h-3 w-3" aria-hidden />
                    {viewing.customer.phone}
                  </a>
                )}

                {viewing.outcome && (
                  <span className={`rounded px-2 py-0.5 text-xs ${OUTCOME_CLASS[viewing.outcome]}`}>
                    {OUTCOME_LABEL[viewing.outcome]}
                  </span>
                )}

                {/* A viewing still to come, or one that happened and nobody wrote up —
                    which is the one worth chasing. */}
                {!isPast && (
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">קבוע</span>
                )}
                {isPast && !viewing.outcome && (
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                    ממתין לסיכום
                  </span>
                )}
              </div>

              <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <CalendarCheck className="h-3 w-3" aria-hidden />
                {when(viewing.startsAt)}
                {viewing.owner && ` · ${viewing.owner.firstName} ${viewing.owner.lastName}`}
              </p>

              {viewing.feedbackNotes && (
                <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
                  {viewing.feedbackNotes}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
