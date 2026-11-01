import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Handshake, Plus } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { formatPrice } from '@/lib/format';
import { qk } from '@/queries/keys';
import { createDeal, fetchCustomerDeals, type Customer, type DealStage } from '@/services/crm';

/**
 * One deal's state, which is not the same words as the board's column headings.
 *
 * This is a badge on a single deal, so it agrees with העסקה — `נסגרה`, not
 * `נסגר בהצלחה`. Reaching for `DEAL_STAGES` here would be grammatical nonsense in two
 * of the five.
 */
const STAGE_LABEL: Record<DealStage, string> = {
  qualified: 'הזדמנות',
  negotiation: 'במשא ומתן',
  under_contract: 'בחוזה',
  closed_won: 'נסגרה',
  closed_lost: 'לא יצאה',
};

const STAGE_CLASS: Record<DealStage, string> = {
  qualified: 'bg-slate-100 text-slate-700',
  negotiation: 'bg-indigo-50 text-indigo-800',
  under_contract: 'bg-blue-50 text-blue-800',
  closed_won: 'bg-green-50 text-green-800',
  closed_lost: 'bg-slate-100 text-slate-500',
};

/**
 * What is open with this person.
 *
 * A lead is an event and a customer is the relationship that follows it, so the deal
 * belongs here rather than only on a board somewhere else: an agent looking at a
 * customer wants to know what is in flight with them before they ring.
 *
 * Opening one from here is the point. A deal typed in on another screen, with the
 * person's name retyped into a title, is a deal that never gets linked to anybody —
 * which is how the pipeline and the CRM drifted apart in the first place.
 */
export function CustomerDeals({ customer }: { customer: Customer }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: qk.deals.forCustomer(customer.id),
    queryFn: () => fetchCustomerDeals(customer.id),
  });

  const open = useMutation({
    mutationFn: () =>
      createDeal({
        // Enough of a title to recognise on a board. The agent can rename it; what
        // matters is that it arrives attached to somebody.
        title: `עסקה — ${customer.name}`,
        customerId: customer.id,
        ...(customer.maxPrice ? { price: customer.maxPrice } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.deals.all });
      toast.success('נפתחה עסקה. אפשר להשלים פרטים בעמוד העסקאות.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לפתוח עסקה.')),
  });

  const deals = data ?? [];

  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1 text-sm font-semibold text-slate-900">
          <Handshake className="h-4 w-4 text-slate-400" aria-hidden />
          עסקאות ({deals.length})
        </h4>

        <button
          type="button"
          onClick={() => open.mutate()}
          disabled={open.isPending}
          className="flex items-center gap-1 py-1.5 text-sm text-blue-700 hover:underline disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {open.isPending ? 'פותח…' : 'פתיחת עסקה'}
        </button>
      </div>

      {isPending && <p className="mt-2 text-sm text-slate-500">טוען…</p>}

      {!isPending && deals.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">עוד אין עסקאות עם הלקוח הזה.</p>
      )}

      <ul className="mt-2 flex flex-col gap-2">
        {deals.map((deal) => (
          <li key={deal.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className={`rounded px-2 py-0.5 text-xs ${STAGE_CLASS[deal.stage]}`}>
              {STAGE_LABEL[deal.stage]}
            </span>
            <span className="text-slate-800">{deal.title}</span>
            {deal.price !== null && (
              <span className="text-slate-500">{formatPrice(deal.price)}</span>
            )}
            {/* The property, when the deal is about one. A deal opened from a brief is
                not yet, and saying "נכס: —" would be noise. */}
            {deal.listing && (
              <span className="text-slate-500">
                {[deal.listing.street, deal.listing.city].filter(Boolean).join(', ')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
