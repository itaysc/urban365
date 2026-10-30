interface Props {
  legend: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  /** The counts offered. The last one is open-ended — "4 or more" — and stores itself. */
  steps?: number[];
  /** What nothing-chosen means here, said under the row. */
  hint?: string;
}

/**
 * A small whole number — parking spaces, storerooms — as a row of chips.
 *
 * The same shape as the rooms picker, because it is the same kind of question: a short
 * fixed list where every answer is one click, rather than a number field that will
 * accept 7.5 parking spaces and asks you to reach for the keyboard to say "one".
 *
 * Nothing chosen is not zero. Zero is a claim — this flat has no parking — and leaving
 * it unanswered is not, so clicking the chosen chip clears it rather than falling back
 * to 0.
 */
export function CountPicker({
  legend,
  value,
  onChange,
  steps = [0, 1, 2, 3, 4],
  hint = 'אפשר להשאיר ריק אם לא רוצים לציין.',
}: Props) {
  const openEnded = steps[steps.length - 1];

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-slate-900">{legend}</legend>

      <div className="flex items-center gap-1.5">
        {steps.map((step) => {
          const on = value === step;
          return (
            <button
              key={step}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? undefined : step)}
              className={`h-9 w-9 shrink-0 rounded-full text-sm transition ${
                on
                  ? 'border border-blue-500 bg-blue-50 font-semibold text-blue-600'
                  : 'border border-slate-300 text-slate-700 hover:border-slate-400'
              }`}
            >
              {step === openEnded ? `+${step}` : step}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-slate-400">{hint}</p>
    </fieldset>
  );
}
