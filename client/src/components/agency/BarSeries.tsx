interface Bar {
  /** What the axis says under the bar. Kept short — a phone has about four characters. */
  label: string;
  value: number;
  /** A second value, stacked under the first in a muted colour. */
  secondary?: number;
  /** The full sentence, for the pointer and for a screen reader. */
  title: string;
}

interface Props {
  bars: Bar[];
  /** Tailwind background classes for the two series. */
  tone?: string;
  secondaryTone?: string;
}

/**
 * A bar chart, drawn with divs.
 *
 * No charting library: this is a dozen bars with no axes, no zoom and no legend, and
 * the smallest library that could draw it is larger than this file. Divs also stay
 * sharp at any size and inherit the page's own colours, which an SVG with baked-in
 * fills does not.
 *
 * Three rows — numbers, bars, labels — each a flex row of `flex-1` columns, so the
 * three line up by construction. The obvious alternative, one column per bar holding
 * all three, does not work: a percentage height needs a parent with a definite one,
 * and a column sized by its own content has none, so every bar silently collapses to
 * nothing. Only the middle row here has a fixed height, and it is the only row that
 * needs one.
 *
 * Heights are a share of the tallest bar rather than of an absolute scale, so a quiet
 * month still shows its shape.
 */
export function BarSeries({ bars, tone = 'bg-blue-500', secondaryTone = 'bg-slate-300' }: Props) {
  const totals = bars.map((b) => b.value + (b.secondary ?? 0));
  const peak = Math.max(1, ...totals);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-1">
        {bars.map((bar, i) => (
          <span
            key={`n-${bar.label}-${i}`}
            className="min-w-0 flex-1 text-center text-[0.65rem] text-slate-500"
          >
            {totals[i] > 0 ? totals[i] : ''}
          </span>
        ))}
      </div>

      {/* The one row with a height, which is what the percentages below resolve against. */}
      <div className="flex h-24 items-end gap-1" role="img">
        {bars.map((bar, i) => (
          <div
            key={`b-${bar.label}-${i}`}
            className="flex h-full min-w-0 flex-1 flex-col justify-end"
            title={bar.title}
          >
            {(bar.secondary ?? 0) > 0 && (
              <div
                className={`w-full ${secondaryTone} ${bar.value > 0 ? '' : 'rounded-t'}`}
                style={{ height: `${((bar.secondary ?? 0) / peak) * 100}%` }}
              />
            )}
            {bar.value > 0 && (
              <div
                className={`order-first w-full rounded-t ${tone}`}
                style={{ height: `${(bar.value / peak) * 100}%` }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-1">
        {bars.map((bar, i) => (
          <span
            key={`l-${bar.label}-${i}`}
            className="min-w-0 flex-1 truncate text-center text-[0.6rem] text-slate-500"
          >
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}
