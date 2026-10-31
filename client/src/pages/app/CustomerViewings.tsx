import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarCheck } from 'lucide-react';
import { OUTCOME_CLASS, OUTCOME_LABEL } from '@/lib/viewingOutcome';
import { qk } from '@/queries/keys';
import { fetchCustomerViewings } from '@/services/calendar';

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Everywhere this customer has been taken.
 *
 * The mirror of the listing's history, and the more useful of the two on the phone:
 * before offering somebody a flat, the thing worth knowing is what they have already
 * seen and what they said about it — not least so nobody offers them the one they
 * turned down last week.
 *
 * Loaded when the row is opened rather than with the list. Most rows are never opened,
 * and a query per customer on every page of the list is a lot of work for a panel
 * nobody looked at.
 */
export function CustomerViewings({ customerId }: { customerId: string }) {
  const { data, isPending } = useQuery({
    queryKey: qk.meetings.forCustomerAll(customerId),
    queryFn: () => fetchCustomerViewings(customerId),
  });

  if (isPending) return <p className="text-sm text-slate-500">טוען…</p>;

  const viewings = data ?? [];
  if (viewings.length === 0) {
    return <p className="text-sm text-slate-500">עדיין לא נקבעו פגישות עם הלקוח הזה.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {viewings.map((viewing) => {
        const address = viewing.listing
          ? [
              [viewing.listing.street, viewing.listing.houseNumber].filter(Boolean).join(' '),
              viewing.listing.city,
            ]
              .filter(Boolean)
              .join(', ')
          : null;

        return (
          <li key={viewing.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 font-medium text-slate-900">
                <Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                {/* A meeting with no property is a coffee at the office, which is still
                    worth seeing in the history — so it says so rather than being hidden. */}
                {address ?? viewing.title}
              </span>

              {viewing.outcome && (
                <span className={`rounded px-2 py-0.5 text-xs ${OUTCOME_CLASS[viewing.outcome]}`}>
                  {OUTCOME_LABEL[viewing.outcome]}
                </span>
              )}
            </div>

            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <CalendarCheck className="h-3 w-3" aria-hidden />
              {when(viewing.startsAt)}
            </p>

            {viewing.feedbackNotes && (
              <p className="mt-2 whitespace-pre-line text-slate-600">{viewing.feedbackNotes}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
