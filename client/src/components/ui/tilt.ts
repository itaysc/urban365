import { useRef, type PointerEvent } from 'react';

/** A few degrees toward the pointer. Nothing moves when motion is reduced. */
export function useCardTilt() {
  const ref = useRef<HTMLDivElement>(null);

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const node = ref.current;
    if (!node) return;
    if (event.pointerType !== 'mouse') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = node.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    node.style.transform = `perspective(900px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg) translateY(-3px)`;
  };

  const onPointerLeave = () => {
    if (ref.current) ref.current.style.transform = '';
  };

  return { ref, onPointerMove, onPointerLeave };
}
