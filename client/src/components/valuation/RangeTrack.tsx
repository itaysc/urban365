import { useEffect, useState } from 'react';
import { placeOnRange } from '@/components/ui/meter';

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * The band, drawn.
 *
 * The tube is the whole range. The pin is where a sale is expected, and the tick is
 * the price to advertise at — the same two numbers as the boxes under it, so the
 * picture and the words say one thing. The pin slides in from the low end once.
 */
export function RangeTrack({
  low,
  high,
  expected,
  asking,
}: {
  low: number;
  high: number;
  expected: number;
  asking: number;
}) {
  const [settled, setSettled] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion()) return;
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const pin = settled ? placeOnRange(low, high, expected) : 0;
  const tick = settled ? placeOnRange(low, high, asking) : 0;

  return (
    <div className="mt-4">
      <div className="u365-meter" aria-hidden>
        <div className="u365-meter-lit" />
        <div className="u365-meter-tick" style={{ insetInlineStart: `${tick}%` }} />
        <div className="u365-meter-pin" style={{ insetInlineStart: `${pin}%` }} />
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-blue-600 bg-white" aria-hidden />
          צפוי להימכר
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 rounded-full bg-blue-900" aria-hidden />
          מחיר פרסום
        </span>
      </p>
    </div>
  );
}
