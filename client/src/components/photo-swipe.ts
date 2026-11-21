export type SwipeMotion =
  | { kind: 'idle' }
  | { kind: 'drag'; dx: number }
  | { kind: 'settle' }
  | { kind: 'glide'; dir: -1 | 1; to: number; width: number; phase: 'from' | 'to' };

/**
 * Where each photo sits, in pixels, inside the frame.
 *
 * The photo that is arriving is placed at 0 and stays at 0 once it becomes the
 * current one. Nothing slides back underneath it at the end.
 */
export function slideOffsets(
  index: number,
  count: number,
  width: number,
  motion: SwipeMotion,
): { index: number; x: number }[] {
  if (count <= 0) return [];
  if (count === 1 || width <= 0) return [{ index, x: 0 }];

  if (motion.kind === 'glide') {
    // 'from' parks the incoming photo just off the side it enters from, with no
    // transition, so the next frame can slide it. A photo that was off the left
    // never painted, and jumping it straight to the middle skipped the slide.
    if (motion.phase === 'from') {
      return [
        { index, x: 0 },
        { index: motion.to, x: motion.dir * motion.width },
      ];
    }
    return [
      { index, x: -motion.dir * motion.width },
      { index: motion.to, x: 0 },
    ];
  }

  const dx = motion.kind === 'drag' ? motion.dx : 0;
  const prev = (index - 1 + count) % count;
  const next = (index + 1) % count;
  if (prev === next) {
    const side = dx > 0 ? -1 : 1;
    return [
      { index, x: dx },
      { index: next, x: dx + side * width },
    ];
  }
  return [
    { index: prev, x: dx - width },
    { index, x: dx },
    { index: next, x: dx + width },
  ];
}

/**
 * Which way the shorter move runs.
 *
 * 1 is forward, the direction the left arrow already uses. An equal split, two photos
 * or a jump of exactly half the set, goes forward too.
 */
export function swipeDirection(from: number, to: number, length: number): -1 | 1 | 0 {
  if (length <= 1 || from === to) return 0;
  const forward = (to - from + length) % length;
  const back = (from - to + length) % length;
  if (forward === back) return 1;
  return forward < back ? 1 : -1;
}
