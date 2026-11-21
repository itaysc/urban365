import { formatShekel } from '@/lib/format';
import { useCounted } from '@/components/ui/meter';

/**
 * A shekel amount that counts into place.
 *
 * The visible digits are hidden from the accessibility tree. A live region around
 * this would otherwise announce every frame of the count; the settled amount is the
 * one that gets read.
 */
export function ShekelFigure({ value }: { value: number }) {
  const shown = useCounted(value);
  return (
    <>
      <span aria-hidden>{formatShekel(shown)}</span>
      <span className="sr-only">{formatShekel(value)}</span>
    </>
  );
}
