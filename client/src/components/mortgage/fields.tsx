import { digits, grouped } from '@/lib/format';

/**
 * The small inputs the mortgage pages are built from.
 *
 * Shared rather than duplicated: the household planner asks for a dozen amounts in
 * exactly the shape the calculator does, and two implementations of "a field that
 * holds shekels" is two places for the thousands separator, the ₪ and the RTL
 * alignment to drift apart.
 */

export function Money({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>

      {/*
        The ₪ is a sibling rather than a suffix inside the field, so it cannot be
        deleted, typed over or sent as part of the value. First in the markup puts it
        at the right of an RTL row, and `text-end` under `dir="ltr"` brings the digits
        up against it — the number and its unit read as one thing.
      */}
      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 transition focus-within:border-slate-900 focus-within:ring-4 focus-within:ring-slate-900/5">
        <span className="text-sm text-slate-500" aria-hidden>
          ₪
        </span>
        <input
          id={id}
          dir="ltr"
          inputMode="numeric"
          autoComplete="off"
          className="w-full bg-transparent text-end text-base font-medium tabular-nums text-slate-900 outline-none"
          value={value === 0 ? '' : grouped.format(value)}
          placeholder="0"
          onChange={(e) => onChange(digits(e.target.value))}
        />
      </div>

      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * A slider rather than a box for the two values nobody knows exactly.
 *
 * A rate and a term are chosen by feel — "about five per cent", "twenty-five years" —
 * and a slider both says what the sensible range is and lets the answer move while you
 * watch, which is most of what somebody comes here to do.
 */
export function Slide({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        <span className="text-sm font-semibold tabular-nums text-slate-900">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600"
      />
    </div>
  );
}

/** One line of the figures beside the headline. */
export function Row({ label, value, tone }: { label: string; value: string; tone?: 'muted' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span
        className={`text-sm font-semibold tabular-nums ${
          tone === 'muted' ? 'text-slate-500' : 'text-slate-900'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** A small number typed rather than dragged — a rate from a bank, or a term in years. */
export function Num({
  label,
  value,
  onChange,
  step,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  min: number;
  max: number;
  suffix: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 focus-within:border-slate-900">
        <input
          type="number"
          dir="ltr"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full min-w-0 bg-transparent text-end text-sm tabular-nums text-slate-900 outline-none"
        />
        <span className="text-xs text-slate-500">{suffix}</span>
      </div>
    </label>
  );
}
