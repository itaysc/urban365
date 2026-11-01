import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Handshake, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { formatPrice } from '@/lib/format';
import { qk } from '@/queries/keys';
import {
  acceptCoBrokerage,
  declineCoBrokerage,
  fetchReceivedRequests,
  fetchSentRequests,
  withdrawCoBrokerage,
  type CoBrokerageStatus,
} from '@/services/cobrokerage';

const STATUS_LABEL: Record<CoBrokerageStatus, string> = {
  pending: 'ממתין לתשובה',
  accepted: 'אושר',
  declined: 'נדחה',
  withdrawn: 'בוטל',
};

const STATUS_CLASS: Record<CoBrokerageStatus, string> = {
  pending: 'bg-amber-50 text-amber-800',
  accepted: 'bg-green-50 text-green-800',
  declined: 'bg-slate-100 text-slate-600',
  withdrawn: 'bg-slate-100 text-slate-500',
};

const addressOf = (listing: {
  street: string | null;
  houseNumber: number | null;
  city: string | null;
}) =>
  [[listing.street, listing.houseNumber].filter(Boolean).join(' '), listing.city]
    .filter(Boolean)
    .join(', ') || 'נכס';

function Status({ status }: { status: CoBrokerageStatus }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Two agencies working one deal.
 *
 * Two lists that look alike and are not: what we asked for carries our own customer,
 * and what we were asked carries a brief and an agency and no person at all. The
 * difference is the product — an agency will not put its customer list near a network
 * that hands it to a competitor — so the inbox says plainly what it is not showing
 * rather than leaving an agent to wonder who they are being asked about.
 */
export function CoBrokeragePage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: received } = useQuery({
    queryKey: qk.cobrokerage.received,
    queryFn: fetchReceivedRequests,
  });
  const { data: sent } = useQuery({
    queryKey: qk.cobrokerage.sent,
    queryFn: fetchSentRequests,
  });

  const after = () => {
    void queryClient.invalidateQueries({ queryKey: qk.cobrokerage.all });
  };

  const answer = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      accept ? acceptCoBrokerage(id) : declineCoBrokerage(id),
    onSuccess: (_r, vars) => {
      after();
      toast.success(vars.accept ? 'אישרתם את שיתוף הפעולה.' : 'דחיתם את הבקשה.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לעדכן.')),
  });

  const withdraw = useMutation({
    mutationFn: (id: string) => withdrawCoBrokerage(id),
    onSuccess: () => {
      after();
      toast.show('הבקשה בוטלה.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לבטל.')),
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Handshake className="h-5 w-5 text-blue-600" aria-hidden />
          שיתופי פעולה
        </h1>
        <p className="text-sm text-slate-500">
          סוכנויות אחרות שיש להן קונה לנכס שלכם, ונכסים שלהן שמתאימים ללקוחות שלכם.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            בקשות שהתקבלו ({received?.length ?? 0})
          </h2>
          <p className="text-xs text-slate-500">
            לסוכנות שפנתה יש קונה לנכס שלכם. פרטי הקונה נשארים אצלה עד שתאשרו.
          </p>
        </div>

        {received?.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            אין בקשות כרגע.
          </p>
        )}

        {received?.map((request) => (
          <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                  {request.seekingAgency.name}
                  <Status status={request.status} />
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {addressOf(request.listing)}
                  {request.listing.price !== null && (
                    <span className="text-slate-500"> · {formatPrice(request.listing.price)}</span>
                  )}
                </p>
                {request.briefSummary && (
                  <p className="mt-1 text-sm text-slate-500">{request.briefSummary}</p>
                )}
                {request.message && (
                  <p className="mt-2 border-s-2 border-slate-200 ps-3 text-sm text-slate-600">
                    {request.message}
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  מציעים חלוקת עמלה: {100 - request.commissionSplit}% לכם,{' '}
                  {request.commissionSplit}% להם.
                </p>

                {/* Once it is agreed, the next step is a phone call — so the number is
                    here rather than one page further on. */}
                {request.status === 'accepted' && request.seekingAgency.phone && (
                  <p className="mt-2 text-sm text-slate-700">
                    ליצירת קשר:{' '}
                    <a
                      href={`tel:${request.seekingAgency.phone}`}
                      dir="ltr"
                      className="text-blue-700 hover:underline"
                    >
                      {request.seekingAgency.phone}
                    </a>
                  </p>
                )}
              </div>

              {request.status === 'pending' && (
                <div className="flex shrink-0 items-center gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => answer.mutate({ id: request.id, accept: true })}
                    disabled={answer.isPending}
                    className="flex items-center gap-1 text-blue-700 hover:underline disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    אישור
                  </button>
                  <button
                    type="button"
                    onClick={() => answer.mutate({ id: request.id, accept: false })}
                    disabled={answer.isPending}
                    className="flex items-center gap-1 text-slate-400 hover:text-slate-700 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" aria-hidden />
                    דחייה
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            בקשות ששלחנו ({sent?.length ?? 0})
          </h2>
          <p className="text-xs text-slate-500">
            נשלחות מעמוד ההזדמנויות, כשנכס של סוכנות אחרת מתאים ללקוח שלכם.
          </p>
        </div>

        {sent?.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            עוד לא שלחתם בקשות.
          </p>
        )}

        {sent?.map((request) => (
          <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                  {request.holdingAgency.name}
                  <Status status={request.status} />
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {addressOf(request.listing)}
                  {request.listing.price !== null && (
                    <span className="text-slate-500"> · {formatPrice(request.listing.price)}</span>
                  )}
                </p>
                {request.customer && (
                  <p className="mt-1 text-sm text-slate-500">עבור {request.customer.name}</p>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  חלוקת עמלה שהוצעה: {request.commissionSplit}% לנו.
                </p>

                {request.status === 'accepted' && request.holdingAgency.phone && (
                  <p className="mt-2 text-sm text-slate-700">
                    ליצירת קשר:{' '}
                    <a
                      href={`tel:${request.holdingAgency.phone}`}
                      dir="ltr"
                      className="text-blue-700 hover:underline"
                    >
                      {request.holdingAgency.phone}
                    </a>
                  </p>
                )}
              </div>

              {request.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => withdraw.mutate(request.id)}
                  disabled={withdraw.isPending}
                  className="shrink-0 text-sm text-slate-400 hover:text-slate-700 disabled:opacity-50"
                >
                  ביטול הבקשה
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
