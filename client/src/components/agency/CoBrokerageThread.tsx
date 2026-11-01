import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { inputClass, selectClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { STAGE_LABEL } from '@/lib/cobrokerage';
import { qk } from '@/queries/keys';
import {
  CO_BROKERAGE_STAGES,
  postCoBrokerageMessage,
  setCoBrokerageStage,
  type CoBrokerageMessage,
  type CoBrokerageStage,
} from '@/services/cobrokerage';

interface Props {
  requestId: string;
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
 * The conversation between the two agencies, and where the deal has got to.
 *
 * Both live on the request rather than in somebody's WhatsApp, which is the point: six
 * weeks later "what did we agree about the commission" has an answer, and it is the
 * same answer for both agencies because neither can edit it.
 */
export function CoBrokerageThread({ requestId, messages, stage, myAgencyId, settled }: Props) {
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
    <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3">
      {/* Only once there is a deal. Before that the status says everything there is. */}
      {stage !== null && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
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
          {/* Said once: an agent who thinks only they can move it will not move it. */}
          <span className="text-xs text-slate-400">שתי הסוכנויות רואות ומעדכנות.</span>
        </label>
      )}

      {messages.length > 0 && (
        <ul className="flex flex-col gap-2">
          {messages.map((m) => {
            const mine = m.agencyId === myAgencyId;
            return (
              <li
                key={m.id}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  mine ? 'self-start bg-blue-50 text-blue-900' : 'self-end bg-slate-100 text-slate-800'
                }`}
              >
                <p className="whitespace-pre-line">{m.body}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {m.author ? `${m.author.firstName} ${m.author.lastName}` : 'סוכן'} · {at(m.createdAt)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {settled ? (
        // The thread stays readable. Writing into a deal that is finished is how a
        // record becomes an argument.
        <p className="text-xs text-slate-400">הבקשה נסגרה. השיחה נשמרת לתיעוד.</p>
      ) : (
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            className={inputClass}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="הודעה לסוכנות השנייה"
            aria-label="הודעה לסוכנות השנייה"
          />
          <button
            type="button"
            onClick={() => send.mutate()}
            disabled={send.isPending || draft.trim() === ''}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            <Send className="h-4 w-4" aria-hidden />
            שליחה
          </button>
        </div>
      )}
    </div>
  );
}
