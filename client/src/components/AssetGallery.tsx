import { useEffect, useState } from 'react';
import { Expand } from 'lucide-react';
import { GalleryLightbox } from '@/components/GalleryLightbox';
import { Chevron } from '@/components/ui/Chevron';

/** Main image plus thumbnails, with arrow-key and button navigation. */
export function AssetGallery({ images, alt }: { images: string[]; alt: string }) {
  const [index, setIndex] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => setIndex(0), [images]);

  // One handler for both views: they share `index`, so the arrow keys work the same
  // whether the gallery is inline or filling the screen.
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
        {/*
          The photo itself opens it too. The icon is the affordance people look for, but
          clicking a photo to enlarge it is what everyone tries first, and the two cost
          one element between them.
        */}
        <button
          type="button"
          onClick={() => setFullScreen(true)}
          // Out of the tab order and hidden from assistive technology: the icon beside
          // it is the same action with the same label, and two identical tab stops that
          // do one thing is worse than one.
          tabIndex={-1}
          aria-hidden
          className="block h-full w-full cursor-zoom-in"
        >
          <img src={images[index]} alt={alt} className="h-full w-full object-cover" />
        </button>

        <button
          type="button"
          onClick={() => setFullScreen(true)}
          aria-label="הצגה במסך מלא"
          // Top-right: the listing modal puts its close button at the top-left, and
          // the two were landing on each other.
          className="absolute right-3 top-3 rounded-full bg-black/55 p-2 text-white transition hover:bg-black/75"
        >
          <Expand className="h-5 w-5" aria-hidden />
        </button>

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
            {/* LTR, or the bidi algorithm reorders `1 / 9` into `9 / 1`. */}
            <span
              dir="ltr"
              className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-0.5 text-xs text-white"
            >
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

      <GalleryLightbox
        images={images}
        alt={alt}
        index={index}
        onIndexChange={setIndex}
        open={fullScreen}
        onOpenChange={setFullScreen}
      />
    </div>
  );
}
