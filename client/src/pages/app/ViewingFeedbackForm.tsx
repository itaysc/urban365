import { useState } from 'react';
import { Frown, Meh, ThumbsUp, UserX } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/Field';
import { OUTCOME_LABEL, OUTCOME_SELECTED } from '@/lib/viewingOutcome';
import { VIEWING_OUTCOMES, type ViewingOutcome } from '@/services/calendar';

/** A face per outcome. The wording and the colours live beside the type. */
const ICONS: Record<ViewingOutcome, typeof ThumbsUp> = {
  interested: ThumbsUp,
  thinking: Meh,
  not_interested: Frown,
  no_show: UserX,
};

interface Props {
  /** Shown when a summary already exists, so it can be corrected rather than retyped. */
  outcome?: ViewingOutcome | null;
  notes?: string | null;
  onSubmit: (outcome: ViewingOutcome, notes: string) => void;
  onCancel?: () => void;
  busy?: boolean;
}

/**
 * How the viewing went, in one click and an optional sentence.
 *
 * One question, not two. "Did they turn up" and "how interested are they" look like
 * separate facts until you try to answer the second for somebody who did not come —
 * so not turning up is one of the four answers, and an agent is never asked to rate
 * the enthusiasm of an empty flat.
 *
 * The notes are where the actual value is: "loved it, worried about the third floor"
 * is what makes the next listing the right one to send. They are optional anyway,
 * because a summary that demands an essay is a summary nobody writes.
 */
export function ViewingFeedbackForm({ outcome, notes, onSubmit, onCancel, busy = false }: Props) {
  const [chosen, setChosen] = useState<ViewingOutcome | null>(outcome ?? null);
  const [text, setText] = useState(notes ?? '');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (chosen) onSubmit(chosen, text.trim());
      }}
      className="flex flex-col gap-3"
    >
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-900">איך היה?</legend>
        <div className="flex flex-wrap gap-2">
          {VIEWING_OUTCOMES.map((value) => {
            const Icon = ICONS[value];
            const selected = chosen === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => setChosen(value)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition ${
                  selected
                    ? OUTCOME_SELECTED[value]
                    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {OUTCOME_LABEL[value]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <textarea
        rows={2}
        className={inputClass}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="מה אמרו, מה הפריע, מה הצעד הבא"
      />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || chosen === null}>
          {busy ? 'שומר…' : 'שמירת הסיכום'}
        </Button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-slate-500 transition hover:text-slate-900"
          >
            ביטול
          </button>
        )}
      </div>
    </form>
  );
}
