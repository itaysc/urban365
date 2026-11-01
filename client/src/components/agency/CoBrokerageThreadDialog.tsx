import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, X } from 'lucide-react';
import { inputClass, selectClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { STAGE_LABEL } from '@/lib/cobrokerage';
import { formatPrice } from '@/lib/format';
import { qk } from '@/queries/keys';
import {
  CO_BROKERAGE_STAGES,
  postCoBrokerageMessage,
  setCoBrokerageStage,
  type CoBrokerageMessage,
  type CoBrokerageStage,
} from '@/services/cobrokerage';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  /** The other agency's name — the person on the other end of the conversation. */
  otherAgency: string;
  property: string;
  price: number | null;
  messages: CoBrokerageMessage[];
  stage: CoBrokerageStage | null;
  /** Ours, so a message can be told from theirs. */
  myAgencyId: string;
  /** A closed request keeps its thread and stops taking new messages. */
  settled: boolean;
}

const at = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * The conversation between the two agencies, at the size a conversation needs.
 *
 * It began as a panel inside the request card and was wrong there: a card is sized for
 * a summary, so the thread came out a column of clipped lines with a two-line box
 * underneath to reply in. A conversation about a deal wants the width of the window and
 * nothing else competing for it.
 *
 * The stage sits in here too, because moving it is a thing you do *while* talking about
 * the deal — "we've agreed, I'll book the viewing" and the dropdown are the same
 * thought.
 */
export function CoBrokerageThreadDialog({
  open,
  onOpenChange,
  requestId,
  otherAgency,
  property,
  price,
  messages,
  stage,
  myAgencyId,
  settled,
}: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.cobrokerage.all });

  const send = useMutation({
    mutationFn: () => postCoBrokerageMessage(requestId, draft),
    onSuccess: () => {
      setDraft('');
      void refresh();
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לשלוח את ההודעה.')),
  });

  const move = useMutation({
    mutationFn: (next: CoBrokerageStage) => setCoBrokerageStage(requestId, next),
    onSuccess: () => {
      void refresh();
      toast.success('השלב עודכן.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לעדכן את השלב.')),
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" />

        <Dialog.Content
          // Tall and wide: a thread read in a narrow column is the problem this exists
          // to fix. Centred with a translate rather than flex so the panel scrolls on a
          // short window without taking the overlay with it.
          className="fixed start-1/2 top-1/2 z-50 flex h-[min(44rem,calc(100vh-2rem))] w-[min(48rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-xl rtl:translate-x-1/2"
        >
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-bold text-slate-900">
                {otherAgency}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-slate-500">
                {property}
                {price !== null && <span> · {formatPrice(price)}</span>}
              </Dialog.Description>

              {stage !== null && (
                <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                  <span>שלב:</span>
                  <select
                    className={selectClass}
                    value={stage}
                    disabled={move.isPending}
                    onChange={(e) => move.mutate(e.target.value as CoBrokerageStage)}
                    aria-label="שלב העסקה"
                  >
                    {CO_BROKERAGE_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  {/* Said once: an agent who thinks only they can move it will not. */}
                  <span className="text-xs text-slate-400">שתי הסוכנויות רואות ומעדכנות.</span>
                </label>
              )}
            </div>

            <Dialog.Close
              aria-label="סגירה"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </header>

          {/* The thread takes whatever height is left, and scrolls on its own so the
              composer never moves off the bottom of the window. */}
          <div className="flex-1 overflow-y-auto p-5">
            {messages.length === 0 ? (
              <p className="text-sm text-slate-500">
                עוד לא נכתב כאן כלום. אפשר לשאול כל דבר לפני שמחליטים.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {messages.map((m) => {
                  const mine = m.agencyId === myAgencyId;
                  return (
                    <li
                      key={m.id}
                      // Logical alignment, so the pair mirrors with the page: ours on
                      // the end, theirs on the start. In Hebrew that puts our own
                      // messages on the left, which is where every messaging app the
                      // agent already uses puts them.
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                        mine
                          ? 'self-end bg-blue-50 text-blue-900'
                          : 'self-start bg-slate-100 text-slate-800'
                      }`}
                    >
                      <p className="whitespace-pre-line text-sm">{m.body}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {m.author ? `${m.author.firstName} ${m.author.lastName}` : 'סוכן'} ·{' '}
                        {at(m.createdAt)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="border-t border-slate-200 p-5">
            {settled ? (
              // The thread stays readable. Writing into a finished deal is how a record
              // becomes an argument.
              <p className="text-sm text-slate-400">הבקשה נסגרה. השיחה נשמרת לתיעוד.</p>
            ) : (
              <div className="flex items-end gap-3">
                <textarea
                  rows={3}
                  className={`${inputClass} flex-1`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends, Shift+Enter breaks the line — what every messaging
                    // box does, and what a thread this shape is expected to do.
                    if (e.key === 'Enter' && !e.shiftKey && draft.trim() !== '') {
                      e.preventDefault();
                      send.mutate();
                    }
                  }}
                  placeholder="הודעה לסוכנות השנייה"
                  aria-label="הודעה לסוכנות השנייה"
                />
                <button
                  type="button"
                  onClick={() => send.mutate()}
                  disabled={send.isPending || draft.trim() === ''}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white disabled:opacity-40"
                >
                  <Send className="h-4 w-4" aria-hidden />
                  שליחה
                </button>
              </div>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
