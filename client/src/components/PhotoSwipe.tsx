import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { slideOffsets, swipeDirection, type SwipeMotion } from '@/components/photo-swipe';

export interface PhotoSwipeHandle {
  /** One step. 1 is the next photo, the direction a leftward swipe commits to. */
  go: (dir: -1 | 1) => void;
  goTo: (index: number) => void;
}

interface Props {
  images: string[];
  index: number;
  alt: string;
  onIndex: (index: number) => void;
  /** cover fills the listing popup; contain is the lightbox. */
  fit: 'cover' | 'contain';
  /** A tap with no drag. The listing popup uses it to open the lightbox. */
  onActivate?: () => void;
  className?: string;
}

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Photos layered in the frame, each shifted by its own translate.
 *
 * A strip that is wider than the frame gets aligned to the right on this RTL page,
 * so recentering it at the end of a swipe looked at empty space and the photo was
 * gone. Here the photo that arrives is already at 0, and it is still at 0 when it
 * becomes the current one.
 */
export const PhotoSwipe = forwardRef<PhotoSwipeHandle, Props>(function PhotoSwipe(
  { images, index, alt, onIndex, fit, onActivate, className },
  ref,
) {
  const frame = useRef<HTMLElement>(null);
  const setFrame = useCallback((node: HTMLElement | null) => {
    frame.current = node;
  }, []);
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);
  const dxRef = useRef(0);
  const moved = useRef(false);
  const ended = useRef(false);
  const [width, setWidth] = useState(0);
  const [motion, setMotion] = useState<SwipeMotion>({ kind: 'idle' });

  useLayoutEffect(() => {
    const node = frame.current;
    if (!node) return;
    const apply = () => {
      const next = node.clientWidth;
      setWidth((current) => (current === next ? current : next));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [images, index]);

  const count = images.length;

  useEffect(() => {
    if (motion.kind === 'settle') {
      const timer = window.setTimeout(() => {
        if (ended.current) return;
        ended.current = true;
        setMotion({ kind: 'idle' });
      }, 320);
      return () => window.clearTimeout(timer);
    }
    if (motion.kind !== 'glide' || motion.phase !== 'to') return;
    const pending = motion;
    const timer = window.setTimeout(() => {
      if (ended.current) return;
      ended.current = true;
      onIndex(pending.to);
      setMotion({ kind: 'idle' });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [motion, onIndex]);

  // One frame with the incoming photo held off to the side, then it slides.
  useLayoutEffect(() => {
    if (motion.kind !== 'glide' || motion.phase !== 'from') return;
    frame.current?.getBoundingClientRect();
    const id = requestAnimationFrame(() => {
      setMotion((current) =>
        current.kind === 'glide' && current.phase === 'from' ? { ...current, phase: 'to' } : current,
      );
    });
    return () => cancelAnimationFrame(id);
  }, [motion]);

  const begin = (to: number, dir: -1 | 1) => {
    if (count < 2 || motion.kind === 'glide' || to === index) return;
    const frameWidth = frame.current?.clientWidth ?? width;
    if (reducedMotion() || frameWidth < 2) {
      onIndex(to);
      setMotion({ kind: 'idle' });
      return;
    }
    ended.current = false;
    setMotion({ kind: 'glide', dir, to, width: frameWidth, phase: 'from' });
  };

  const goTo = (to: number) => {
    const dir = swipeDirection(index, to, count);
    if (dir === 0) return;
    begin(to, dir);
  };

  useImperativeHandle(ref, () => ({
    go: (dir) => begin((index + dir + count) % count, dir),
    goTo,
  }));

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (count < 2 || motion.kind === 'glide' || event.button !== 0) return;
    moved.current = false;
    dxRef.current = 0;
    origin.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const start = origin.current;
    if (!start || event.pointerId !== start.id || motion.kind === 'glide') return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (motion.kind !== 'drag') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        origin.current = null;
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    moved.current = true;
    dxRef.current = dx;
    setMotion({ kind: 'drag', dx });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (!origin.current || event.pointerId !== origin.current.id) return;
    const frameWidth = frame.current?.clientWidth ?? width;
    const threshold = Math.min(72, frameWidth * 0.18);
    const dx = dxRef.current;
    origin.current = null;
    if (dx <= -threshold) begin((index + 1) % count, 1);
    else if (dx >= threshold) begin((index - 1 + count) % count, -1);
    else {
      dxRef.current = 0;
      setMotion(Math.abs(dx) > 1 ? { kind: 'settle' } : { kind: 'idle' });
    }
  };

  const onClick = () => {
    if (moved.current) {
      moved.current = false;
      return;
    }
    onActivate?.();
  };

  const onTransitionEnd = (event: React.TransitionEvent<HTMLImageElement>) => {
    if (event.propertyName !== 'transform' || event.target !== event.currentTarget || ended.current) return;
    if (motion.kind === 'settle') {
      ended.current = true;
      setMotion({ kind: 'idle' });
      return;
    }
    if (motion.kind !== 'glide' || motion.phase !== 'to') return;
    if (event.currentTarget.dataset.photo !== String(motion.to)) return;
    ended.current = true;
    onIndex(motion.to);
    setMotion({ kind: 'idle' });
  };

  if (count === 0) return null;

  const frameWidth = motion.kind === 'glide' ? motion.width : width;
  const slides = slideOffsets(index, count, frameWidth, motion);
  const moving = (motion.kind === 'glide' && motion.phase === 'to') || motion.kind === 'settle';
  const frameClass = `relative overflow-hidden touch-pan-y select-none ${className ?? ''}`;
  const imageClass =
    fit === 'cover' ? 'absolute inset-0 h-full w-full object-cover' : 'absolute inset-0 h-full w-full object-contain';

  const track = slides.map((slide) => (
    <img
      key={slide.index}
      src={images[slide.index]}
      alt={slide.index === index ? alt : ''}
      draggable={false}
      data-photo={slide.index}
      aria-hidden={slide.index !== index}
      onTransitionEnd={onTransitionEnd}
      className={`${imageClass} pointer-events-none`}
      style={{
        transform: `translate3d(${slide.x}px, 0, 0)`,
        zIndex: motion.kind === 'glide' && slide.index === motion.to ? 1 : 0,
        transition: moving && !reducedMotion() ? 'transform 280ms ease' : 'none',
      }}
    />
  ));

  if (onActivate) {
    return (
      <button
        ref={setFrame}
        type="button"
        tabIndex={-1}
        aria-hidden
        dir="ltr"
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          origin.current = null;
          dxRef.current = 0;
          setMotion({ kind: 'idle' });
        }}
        className={`block cursor-zoom-in ${frameClass}`}
      >
        {track}
      </button>
    );
  }

  return (
    <div
      ref={setFrame}
      dir="ltr"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        origin.current = null;
        dxRef.current = 0;
        setMotion({ kind: 'idle' });
      }}
      className={frameClass}
    >
      {track}
    </div>
  );
});
