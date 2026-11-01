import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Handshake, MessageCircle, X } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { useToast } from '@/components/ui/Toast';
import { CoBrokerageThreadDialog } from '@/components/agency/CoBrokerageThreadDialog';
import { errorMessageOf } from '@/lib/apiError';
import { isSettled, STAGE_CLASS, STAGE_LABEL, STATUS_CLASS, STATUS_LABEL } from '@/lib/cobrokerage';
import { formatPrice } from '@/lib/format';
import { qk } from '@/queries/keys';
import {
  acceptCoBrokerage,
  declineCoBrokerage,
  fetchReceivedRequests,
  fetchSentRequests,
  markCoBrokerageRead,
  withdrawCoBrokerage,
  type CoBrokerageStage,
  type CoBrokerageStatus,
  type ReceivedRequest,
  type SentRequest,
} from '@/services/cobrokerage';

const addressOf = (listing: {
  street: string | null;
  houseNumber: number | null;
  city: string | null;
}) =>
  [[listing.street, listing.houseNumber].filter(Boolean).join(' '), listing.city]
    .filter(Boolean)
    .join(', ') || 'נכס';

/** Something in the thread we have not seen. `null` means we have never opened it. */
const unreadCount = (
  messages: { createdAt: string; agencyId: string }[],
  readAt: string | null,
  myAgencyId: string,
) =>
  messages.filter(
    (m) => m.agencyId !== myAgencyId && (readAt === null || m.createdAt > readAt),
  ).length;

function Badges({
  status,
  stage,
  unread,
}: {
  status: CoBrokerageStatus;
  stage: CoBrokerageStage | null;
  unread: number;
}) {
  return (
    <>
      {/* Once there is a stage it is the more useful of the two, so the status gives
          way to it rather than sitting beside it saying "אושר" forever. */}
      {stage ? (
        <span className={`rounded px-2 py-0.5 text-xs ${STAGE_CLASS[stage]}`}>
          {STAGE_LABEL[stage]}
        </span>
      ) : (
        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      )}

      {unread > 0 && (
        <span className="flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-xs text-white">
          <MessageCircle className="h-3 w-3" aria-hidden />
          {unread}
        </span>
      )}
    </>
  );
}

/**
 * Two agencies working one deal: the asking, the answer, and everything after.
 *
 * Three things this page is careful about. The two lists look alike and are not — what
 * we sent carries our own customer and what we received never does. A request that is
 * answered does not vanish: it moves to a list of its own, because "what happened with
 * that agency in March" is a question agents ask and a product that cannot answer it
 * has thrown away the only record either side has. And an accepted request is the
 * beginning of the work rather than the end of it, so it carries a stage and a thread.
 */
export function CoBrokeragePage() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const myAgencyId = user?.agency?.id ?? '';
  const [open, setOpen] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const { data: received, isPending: loadingReceived } = useQuery({
    queryKey: qk.cobrokerage.received,
    queryFn: fetchReceivedRequests,
  });
  const { data: sent, isPending: loadingSent } = useQuery({
    queryKey: qk.cobrokerage.sent,
    queryFn: fetchSentRequests,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.cobrokerage.all });

  const answer = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      accept ? acceptCoBrokerage(id) : declineCoBrokerage(id),
    onSuccess: (_r, vars) => {
      void refresh();
      toast.success(vars.accept ? 'אישרתם את שיתוף הפעולה.' : 'דחיתם את הבקשה.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לעדכן.')),
  });

  const withdraw = useMutation({
    mutationFn: (id: string) => withdrawCoBrokerage(id),
    onSuccess: () => {
      void refresh();
      toast.show('הבקשה בוטלה.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לבטל.')),
  });

  const read = useMutation({
    mutationFn: (id: string) => markCoBrokerageRead(id),
    onSuccess: () => void refresh(),
  });

  /** Opening a card is what marks it read — there is no other moment that means it. */
  const toggle = (id: string, unread: number) => {
    const next = open === id ? null : id;
    setOpen(next);
    if (next && unread > 0) read.mutate(id);
  };

  const card = (request: SentRequest | ReceivedRequest, incoming: boolean) => {
    const other = incoming
      ? (request as ReceivedRequest).seekingAgency
      : (request as SentRequest).holdingAgency;
    const readAt = incoming
      ? (request as ReceivedRequest).holderReadAt
      : (request as SentRequest).seekerReadAt;
    const unread = unreadCount(request.messages, readAt, myAgencyId);
    const settled = isSettled(request.status, request.stage);
    const expanded = open === request.id;

    return (
      <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
              {other.name}
              <Badges status={request.status} stage={request.stage} unread={unread} />
            </p>

            <p className="mt-1 text-sm text-slate-700">
              {addressOf(request.listing)}
              {request.listing.price !== null && (
                <span className="text-slate-500"> · {formatPrice(request.listing.price)}</span>
              )}
            </p>

            {/* Theirs: what the buyer wants. Ours: who the buyer is. */}
            {incoming
              ? request.briefSummary && (
                  <p className="mt-1 text-sm text-slate-500">{request.briefSummary}</p>
                )
              : (request as SentRequest).customer && (
                  <p className="mt-1 text-sm text-slate-500">
                    עבור {(request as SentRequest).customer!.name}
                  </p>
                )}

            {request.message && (
              <p className="mt-2 border-s-2 border-slate-200 ps-3 text-sm text-slate-600">
                {request.message}
              </p>
            )}

            <p className="mt-2 text-xs text-slate-500">
              {incoming
                ? `מציעים חלוקת עמלה: ${100 - request.commissionSplit}% לכם, ${request.commissionSplit}% להם.`
                : `חלוקת עמלה שהוצעה: ${request.commissionSplit}% לנו.`}
            </p>

            {request.status === 'accepted' && other.phone && (
              <p className="mt-2 text-sm text-slate-700">
                ליצירת קשר:{' '}
                <a href={`tel:${other.phone}`} dir="ltr" className="text-blue-700 hover:underline">
                  {other.phone}
                </a>
              </p>
            )}

            {/* The thread exists from the moment the request does, so a question can be
                asked before anybody commits to anything. It opens in a window of its
                own: a conversation squeezed into a summary card is a column of clipped
                lines with nowhere to type. */}
            <button
              type="button"
              onClick={() => toggle(request.id, unread)}
              className="mt-2 flex items-center gap-1 text-sm text-blue-700 hover:underline"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              {request.messages.length > 0 ? `שיחה (${request.messages.length})` : 'פתיחת שיחה'}
            </button>

            <CoBrokerageThreadDialog
              open={expanded}
              onOpenChange={(next) => setOpen(next ? request.id : null)}
              requestId={request.id}
              otherAgency={other.name}
              property={addressOf(request.listing)}
              price={request.listing.price}
              messages={request.messages}
              stage={request.stage}
              myAgencyId={myAgencyId}
              settled={settled}
            />
          </div>

          {request.status === 'pending' && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm [&_a]:py-1.5 [&_button]:py-1.5">
              {incoming ? (
                <>
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
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => withdraw.mutate(request.id)}
                  disabled={withdraw.isPending}
                  className="text-sm text-slate-400 hover:text-slate-700 disabled:opacity-50"
                >
                  ביטול הבקשה
                </button>
              )}
            </div>
          )}
        </div>
      </article>
    );
  };

  const live = <T extends SentRequest | ReceivedRequest>(rows: T[] | undefined) =>
    (rows ?? []).filter((r) => !isSettled(r.status, r.stage));
  const past = <T extends SentRequest | ReceivedRequest>(rows: T[] | undefined) =>
    (rows ?? []).filter((r) => isSettled(r.status, r.stage));

  const settledCount = past(received).length + past(sent).length;

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
            בקשות שהתקבלו ({live(received).length})
          </h2>
          <p className="text-xs text-slate-500">
            לסוכנות שפנתה יש קונה לנכס שלכם. פרטי הקונה נשארים אצלה עד שתאשרו.
          </p>
        </div>

        {/* "Nothing here" and "not loaded yet" look identical and are not: an empty
            page while the request is still in flight reads as a broken feature. */}
        {live(received).length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            {loadingReceived ? 'טוען…' : 'אין בקשות פתוחות.'}
          </p>
        )}

        {live(received).map((r) => card(r, true))}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            בקשות ששלחנו ({live(sent).length})
          </h2>
          <p className="text-xs text-slate-500">
            נשלחות מעמוד ההזדמנויות, כשנכס של סוכנות אחרת מתאים ללקוח שלכם.
          </p>
        </div>

        {live(sent).length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            {loadingSent ? 'טוען…' : 'אין בקשות פתוחות.'}
          </p>
        )}

        {live(sent).map((r) => card(r, false))}
      </section>

      {/* Nothing is deleted. A deal that fell through and a request somebody declined
          are both part of the history with that agency, and the thread stays readable. */}
      {settledCount > 0 && (
        <section className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowPast(!showPast)}
            className="flex items-center gap-1 self-start text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            <ChevronDown
              className={`h-4 w-4 transition ${showPast ? 'rotate-180' : ''}`}
              aria-hidden
            />
            היסטוריה ({settledCount})
          </button>

          {showPast && (
            <>
              {past(received).map((r) => card(r, true))}
              {past(sent).map((r) => card(r, false))}
            </>
          )}
        </section>
      )}
    </div>
  );
}
