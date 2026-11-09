import { X } from 'lucide-react';
import {
  DEFAULT_YEARS,
  MIX_PRESETS,
  mix,
  rebalance,
  type MixPart,
  type TrackKey,
} from '@/lib/mortgage';
import {
  MAX_SAVED_MIXES,
  dropMix,
  keepMix,
  sameMix,
  type SavedMix,
} from '@/lib/mortgage-mixes';
import { formatShekel } from '@/lib/format';

const SHORT: Record<TrackKey, string> = {
  fixed: 'קל״צ',
  fixedLinked: 'קבועה צמודה',
  prime: 'פריים',
  variable5: 'משתנה',
  variable5Linked: 'משתנה צמודה',
};

/** The term the suggestions should be built on: whatever the largest track runs for. */
function horizon(parts: MixPart[]): number {
  const carrying = parts.filter((part) => part.amount > 0);
  const source = carrying.length > 0 ? carrying : parts;
  if (source.length === 0) return DEFAULT_YEARS;
  return source.reduce((best, part) => (part.amount >= best.amount ? part : best)).years || DEFAULT_YEARS;
}

function tracksOf(parts: MixPart[]): string {
  return parts.map((part) => SHORT[part.key]).join(' · ');
}

/**
 * The current mix set beside the common ones and any the reader has kept.
 *
 * One number per row, the monthly payment, because that is the comparison. The
 * split is a line under the name so a row can be told apart without opening it.
 * Choosing a row replaces the mix being edited; the way back is a single undo,
 * not a second editor.
 */
export function MixCompare({
  loan,
  parts,
  onApply,
  onUndo,
  canUndo,
  saved,
  onSaved,
}: {
  loan: number;
  parts: MixPart[];
  onApply: (next: MixPart[]) => void;
  onUndo: () => void;
  canUndo: boolean;
  saved: SavedMix[];
  onSaved: (next: SavedMix[]) => void;
}) {
  if (loan <= 0) return null;

  const years = horizon(parts);
  const current = mix(parts);
  const comparable = Math.abs(current.amount - loan) <= 1 && current.amount > 0;
  const kept = keepMix(saved, parts);

  const options: { id: string; name: string; blurb: string; parts: MixPart[]; savedId?: string }[] = [
    ...MIX_PRESETS.map((preset) => ({
      id: preset.id,
      name: preset.name,
      blurb: preset.blurb,
      parts: preset.build(loan, years),
    })),
    ...saved.map((item) => {
      const sized = rebalance(item.parts, loan);
      return {
        id: item.id,
        name: tracksOf(item.parts),
        blurb: 'תמהיל ששמרתם',
        parts: sized,
        savedId: item.id,
      };
    }),
  ];

  return (
    <section className="mt-5 border-t border-slate-200 pt-4" aria-labelledby="mix-compare-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="mix-compare-heading" className="text-sm font-semibold text-slate-900">
          השוואה
        </h2>
        {canUndo && (
          <button type="button" onClick={onUndo} className="text-xs text-blue-700 hover:underline">
            חזרה לתמהיל הקודם
          </button>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        אותה משכנתא, חלוקה אחרת. לחיצה מחליפה את התמהיל שבניתם.
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {options.map((option) => {
          const summary = mix(option.parts);
          const showing = sameMix(option.parts, parts) && Math.abs(current.amount - loan) <= 1;
          const delta = summary.monthly - current.monthly;
          const payment = (
            <span className="text-end">
              <span className="block text-sm font-semibold tabular-nums">{formatShekel(summary.monthly)}</span>
              {showing ? (
                <span className="block text-xs font-normal text-slate-500">מוצג עכשיו</span>
              ) : (
                comparable && (
                  <span className="block text-xs font-normal text-slate-500">
                    {delta === 0
                      ? 'אותו החזר'
                      : delta > 0
                        ? `יותר ${formatShekel(delta)} לחודש`
                        : `פחות ${formatShekel(-delta)} לחודש`}
                  </span>
                )
              )}
            </span>
          );

          const body = (
            <>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900">{option.name}</span>
                <span className="block text-xs text-slate-500">{option.blurb}</span>
              </span>
              {payment}
            </>
          );

          return (
            <li key={option.id} className="flex items-stretch gap-1">
              {showing ? (
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  {body}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onApply(option.parts)}
                  aria-label={`הצגת ${option.name}, ${formatShekel(summary.monthly)} לחודש`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-3 py-2 text-start transition hover:bg-slate-50"
                >
                  {body}
                </button>
              )}
              {option.savedId && (
                <button
                  type="button"
                  onClick={() => onSaved(dropMix(saved, option.savedId!))}
                  aria-label={`מחיקת ${option.name}`}
                  className="rounded-lg px-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => {
          if (kept.status === 'saved') onSaved(kept.mixes);
        }}
        disabled={kept.status !== 'saved'}
        className="mt-3 text-sm font-medium text-blue-700 hover:underline disabled:text-slate-400 disabled:no-underline"
      >
        {kept.status === 'duplicate'
          ? 'התמהיל הזה כבר שמור'
          : kept.status === 'full'
            ? `אפשר לשמור עד ${MAX_SAVED_MIXES}`
            : 'שמירת התמהיל להשוואה'}
      </button>
    </section>
  );
}
