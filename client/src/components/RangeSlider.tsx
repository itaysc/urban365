import { useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

interface Props {
  title: string;
  suffix?: string;
  /** The right-hand end of the track. A thumb left here means no minimum. */
  floor: number;
  /** The left-hand end of the track. A thumb left here means no maximum, so a listing above it is not cut off. */
  ceiling: number;
  step: number;
  min?: number;
  max?: number;
  onChange: (next: { min?: number; max?: number }) => void;
}

const format = (n: number) => n.toLocaleString('he-IL');

/**
 * A range with a thumb at each end.
 *
 * The minimum sits on the right. The page is RTL, and a price that grows towards the
 * left is the direction the rest of the bar is read in. The track is measured in
 * physical pixels so that does not depend on how a browser draws `<input type="range">`.
 */
export function RangeSlider({ title, suffix, floor, ceiling, step, min, max, onChange }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const lo = clamp(min ?? floor, floor, ceiling);
  const hi = clamp(max ?? ceiling, lo, ceiling);

  const loRef = useRef(lo);
  const hiRef = useRef(hi);
  loRef.current = lo;
  hiRef.current = hi;

  const ratio = (value: number) => (value - floor) / (ceiling - floor || 1);

  const valueAt = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return floor;
    // The bar is inset by the same 0.5rem the thumbs travel, so a thumb can sit on
    // either end without hanging off the control.
    const inset = 8;
    const span = Math.max(rect.width - inset * 2, 1);
    const fromRight = (rect.right - inset - clientX) / span;
    const raw = floor + clamp(fromRight, 0, 1) * (ceiling - floor);
    return clamp(Math.round(raw / step) * step, floor, ceiling);
  };

  const commit = (nextLo: number, nextHi: number) => {
    onChange({
      min: nextLo <= floor ? undefined : nextLo,
      max: nextHi >= ceiling ? undefined : nextHi,
    });
  };

  const drag = (which: 'min' | 'max', event: ReactPointerEvent<HTMLDivElement>) => {
    const surface = event.currentTarget;
    surface.setPointerCapture(event.pointerId);

    const move = (e: PointerEvent) => {
      const value = valueAt(e.clientX);
      if (which === 'min') commit(Math.min(value, hiRef.current), hiRef.current);
      else commit(loRef.current, Math.max(value, loRef.current));
    };
    const end = () => {
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerup', end);
      surface.removeEventListener('pointercancel', end);
    };
    surface.addEventListener('pointermove', move);
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
    move(event.nativeEvent);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const rect = track.current?.getBoundingClientRect();
    if (!rect) return;

    const inset = 8;
    const span = Math.max(rect.width - inset * 2, 1);
    const thumbX = (value: number) => rect.right - inset - ratio(value) * span;
    const loX = thumbX(loRef.current);
    const hiX = thumbX(hiRef.current);
    const distLo = Math.abs(event.clientX - loX);
    const distHi = Math.abs(event.clientX - hiX);
    // On the shared point, the right-hand half moves the minimum.
    const which = distLo < distHi || (distLo === distHi && event.clientX >= (loX + hiX) / 2) ? 'min' : 'max';
    drag(which, event);
  };

  const nudge = (which: 'min' | 'max', direction: 1 | -1) => {
    if (which === 'min') commit(clamp(lo + direction * step, floor, hi), hi);
    else commit(lo, clamp(hi + direction * step, lo, ceiling));
  };

  const onKey = (which: 'min' | 'max') => (event: KeyboardEvent) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') nudge(which, 1);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') nudge(which, -1);
    else if (event.key === 'Home') commit(which === 'min' ? floor : lo, which === 'min' ? hi : lo);
    else if (event.key === 'End') commit(which === 'min' ? hi : lo, which === 'min' ? hi : ceiling);
    else return;
    event.preventDefault();
  };

  return (
    <fieldset className="border-t border-slate-100 pt-3">
      <legend className="mb-2 text-sm font-semibold text-slate-900">
        {title} {suffix && <span className="font-normal text-slate-500">({suffix})</span>}
      </legend>

      {/*
        Each side is as wide as the largest number the track can show. A shorter
        value must not shrink the row, or the panel around the slider changes size
        while it is being dragged.
      */}
      <div className="mb-1 grid grid-cols-2 gap-3 text-sm tabular-nums text-slate-700">
        <Bound label={`מ־${format(lo)}`} widest={`מ־${format(ceiling)}`} align="start" />
        <Bound label={`עד ${format(hi)}`} widest={`עד ${format(ceiling)}`} align="end" />
      </div>

      <div
        ref={track}
        onPointerDown={onPointerDown}
        className="relative h-8 cursor-pointer touch-none select-none"
      >
        <div className="absolute inset-x-2 top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-200" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-blue-600"
          style={{
            right: `calc(${ratio(lo)} * (100% - 1rem) + 0.5rem)`,
            left: `calc(${1 - ratio(hi)} * (100% - 1rem) + 0.5rem)`,
          }}
        />
        <Thumb
          label={`${title}, מינימום`}
          value={lo}
          floor={floor}
          ceiling={ceiling}
          text={`מ־${format(lo)}`}
          at={ratio(lo)}
          onKeyDown={onKey('min')}
        />
        <Thumb
          label={`${title}, מקסימום`}
          value={hi}
          floor={floor}
          ceiling={ceiling}
          text={`עד ${format(hi)}`}
          at={ratio(hi)}
          onKeyDown={onKey('max')}
        />
      </div>
    </fieldset>
  );
}

function Thumb({
  label,
  value,
  floor,
  ceiling,
  text,
  at,
  onKeyDown,
}: {
  label: string;
  value: number;
  floor: number;
  ceiling: number;
  text: string;
  at: number;
  onKeyDown: (event: KeyboardEvent) => void;
}) {
  return (
    <button
      type="button"
      role="slider"
      aria-label={label}
      aria-valuemin={floor}
      aria-valuemax={ceiling}
      aria-valuenow={value}
      aria-valuetext={text}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      // The track underneath handles the pointer, so the two thumbs can be told apart
      // when they sit on the same point. The button stays for the keyboard.
      className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-blue-600 bg-white shadow"
      style={{ right: `calc(${at} * (100% - 1rem) + 0.5rem - 8px)` }}
    />
  );
}

function Bound({ label, widest, align }: { label: string; widest: string; align: 'start' | 'end' }) {
  return (
    <span className={`relative block whitespace-nowrap ${align === 'end' ? 'text-end' : 'text-start'}`}>
      <span className="invisible" aria-hidden>
        {widest}
      </span>
      <span className={`absolute inset-0 ${align === 'end' ? 'text-end' : 'text-start'}`}>{label}</span>
    </span>
  );
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
