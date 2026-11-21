import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Expand } from 'lucide-react';
import { GalleryLightbox } from '@/components/GalleryLightbox';
import { PhotoSwipe, type PhotoSwipeHandle } from '@/components/PhotoSwipe';
import { Chevron } from '@/components/ui/Chevron';

/** Main image plus thumbnails, with arrow-key and button navigation. */
export function AssetGallery({ images, alt, strip }: { images: string[]; alt: string; strip?: ReactNode }) {
  const [index, setIndex] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);
  const gallery = useRef<PhotoSwipeHandle>(null);
  const lightbox = useRef<PhotoSwipeHandle>(null);

  useEffect(() => setIndex(0), [images]);

  // One handler for both views: they share `index`, so the arrow keys work the same
  // whether the gallery is inline or filling the screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // RTL: ArrowLeft advances, ArrowRight goes back.
      const swipe = fullScreen ? lightbox.current : gallery.current;
      if (e.key === 'ArrowLeft') swipe?.go(1);
      if (e.key === 'ArrowRight') swipe?.go(-1);
    };
    if (images.length > 1) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, fullScreen]);

  if (images.length === 0) {
    return (
      <div className="relative flex h-72 items-center justify-center bg-slate-100 text-slate-500">
        ללא תמונות
        {strip}
      </div>
    );
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
        <PhotoSwipe
          ref={gallery}
          images={images}
          index={index}
          alt={alt}
          onIndex={setIndex}
          fit="cover"
          onActivate={() => setFullScreen(true)}
          className="h-full w-full"
        />

        {strip}

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
              className={`${arrow} right-3 z-10`}
              onClick={() => gallery.current?.go(-1)}
            >
              <Chevron direction="right" />
            </button>
            <button
              type="button"
              aria-label="התמונה הבאה"
              className={`${arrow} left-3 z-10`}
              onClick={() => gallery.current?.go(1)}
            >
              <Chevron direction="left" />
            </button>
            {/* LTR, or the bidi algorithm reorders `1 / 9` into `9 / 1`. */}
            <span
              dir="ltr"
              className={`absolute left-3 z-10 rounded bg-black/60 px-2 py-0.5 text-xs text-white ${strip ? 'bottom-9' : 'bottom-3'}`}
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
              onClick={() => gallery.current?.goTo(i)}
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
        swipeRef={lightbox}
        open={fullScreen}
        onOpenChange={setFullScreen}
      />
    </div>
  );
}
