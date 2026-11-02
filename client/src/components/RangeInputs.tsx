interface Props {
  title: string;
  suffix?: string;
  min: number | undefined;
  max: number | undefined;
  onChange: (next: { min?: number; max?: number }) => void;
  step?: number;
}

const parse = (v: string): number | undefined => {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function RangeInputs({ title, suffix, min, max, onChange, step = 1 }: Props) {
  const field =
    'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-900';

  return (
    <fieldset className="border-t border-slate-100 pt-3">
      <legend className="mb-2 text-sm font-semibold text-slate-900">
        {title} {suffix && <span className="font-normal text-slate-500">({suffix})</span>}
      </legend>

      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          step={step}
          min={0}
          placeholder="מ־"
          value={min ?? ''}
          onChange={(e) => onChange({ min: parse(e.target.value), max })}
          className={field}
        />
        <span className="text-slate-500">–</span>
        <input
          type="number"
          inputMode="numeric"
          step={step}
          min={0}
          placeholder="עד"
          value={max ?? ''}
          onChange={(e) => onChange({ min, max: parse(e.target.value) })}
          className={field}
        />
      </div>
    </fieldset>
  );
}
