import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import type { PriceCheck } from '@/lib/price-check';

/**
 * One line, across the foot of the photograph.
 *
 * It sits on the picture rather than under the price, so a card with a comparison
 * is the same height as a card without one.
 */
export function PriceGapLine({ check, className = '' }: { check: PriceCheck; className?: string }) {
  const tone =
    check.stance === 'above' ? 'bg-amber-950/90' : check.stance === 'below' ? 'bg-emerald-950/90' : 'bg-slate-950/85';

  return (
    <p className={`absolute inset-x-0 bottom-0 z-[1] truncate px-3 py-1.5 text-xs font-semibold text-white ${tone} ${className}`}>
      {check.headline}
    </p>
  );
}

/** The opened listing: the sentence is already on the photograph. This is what it rests on. */
export function usePriceBrief(listingId: string | null): PriceCheck | null {
  const [check, setCheck] = useState<PriceCheck | null>(null);

  useEffect(() => {
    if (!listingId) {
      setCheck(null);
      return;
    }
    let cancelled = false;
    api
      .get<{ item: PriceCheck | null }>(`/listings/${listingId}/price-check`, { params: { brief: '1' } })
      .then((response) => {
        if (!cancelled) setCheck(response.data.item);
      })
      .catch(() => {
        if (!cancelled) setCheck(null);
      });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  return check;
}

/**
 * The source of the number, and what is worth asking before a visit.
 *
 * The headline is the strip on the photograph. Repeating it here would be the space
 * the strip was meant to save.
 */
export function PriceGapBrief({ check }: { check: PriceCheck }) {
  if (!check.detail && check.questions.length === 0) return null;

  return (
    <section className="rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
      <p>{check.detail}</p>
      {check.questions.length > 0 && (
        <div className="mt-3">
          <p className="font-semibold text-slate-900">לפני ביקור</p>
          <ul className="mt-1 list-disc space-y-1 pe-4">
            {check.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
