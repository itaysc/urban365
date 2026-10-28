import { useEffect, useState } from 'react';

/**
 * Drawn as SVG rather than the `‹` / `›` characters: those are Bidi_Mirrored, so inside
 * this RTL page the browser flips them and each arrow ends up pointing the wrong way.
 */
const Chevron = ({ direction }: { direction: 'left' | 'right' }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path
      d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Main image plus thumbnails, with arrow-key and button navigation. */
export function AssetGallery({ images, alt }: { images: string[]; alt: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [images]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // RTL: ArrowLeft advances, ArrowRight goes back.
      if (e.key === 'ArrowLeft') setIndex((i) => (i + 1) % images.length);
      if (e.key === 'ArrowRight') setIndex((i) => (i - 1 + images.length) % images.length);
    };
    if (images.length > 1) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length]);

  if (images.length === 0) {
    return <div className="flex h-72 items-center justify-center bg-slate-100 text-slate-400">ללא תמונות</div>;
  }

  const arrow =
    'absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-white/90 p-2 text-slate-800 shadow hover:bg-white';

  return (
    <div>
      <div className="relative h-72 bg-slate-100 sm:h-96">
        <img src={images[index]} alt={alt} className="h-full w-full object-cover" />

        {images.length > 1 && (
          <>
            {/* RTL: the right-hand arrow points right and steps back, the left-hand one
                points left and advances — the direction you read in. */}
            <button
              type="button"
              aria-label="התמונה הקודמת"
              className={`${arrow} right-3`}
              onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
            >
              <Chevron direction="right" />
            </button>
            <button
              type="button"
              aria-label="התמונה הבאה"
              className={`${arrow} left-3`}
              onClick={() => setIndex((i) => (i + 1) % images.length)}
            >
              <Chevron direction="left" />
            </button>
            <span className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto p-3">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`תמונה ${i + 1}`}
              className={`h-16 w-20 flex-none overflow-hidden rounded border-2 ${
                i === index ? 'border-slate-900' : 'border-transparent'
              }`}
            >
              <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
