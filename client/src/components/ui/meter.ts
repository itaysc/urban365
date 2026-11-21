import { useEffect, useRef, useState } from 'react';

const DURATION = 450;

/** 0 at the low end, 100 at the high end. A collapsed range sits in the middle. */
export function placeOnRange(low: number, high: number, value: number): number {
  const span = high - low;
  if (!(span > 0)) return 50;
  const ratio = (value - low) / span;
  return Math.min(100, Math.max(0, ratio * 100));
}

/**
 * One step of a readout chasing its target.
 *
 * Most of the gap closes inside the duration, and a step that rounding would swallow
 * still moves a shekel, so the figure cannot stall short of the target.
 */
export function followCount(current: number, target: number, dt: number): number {
  if (current === target || dt <= 0) return current;
  const k = 1 - Math.exp(-Math.min(dt, DURATION) / (DURATION / 3));
  const next = Math.round(current + (target - current) * k);
  if (next === current) return current + Math.sign(target - current);
  return next;
}

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * The number a readout is showing.
 *
 * It arrives from zero, then eases from wherever it is when the target changes, so a
 * slider does not restart the count. Reduced motion shows the target immediately.
 */
export function useCounted(target: number): number {
  const [shown, setShown] = useState(() => (reducedMotion() ? target : 0));
  const shownRef = useRef(shown);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (reducedMotion()) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const goal = targetRef.current;
      const next = followCount(shownRef.current, goal, now - last);
      last = now;
      shownRef.current = next;
      setShown(next);
      if (next !== goal) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}
