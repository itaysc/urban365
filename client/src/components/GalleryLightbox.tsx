import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Chevron } from '@/components/ui/Chevron';

interface Props {
  images: string[];
  alt: string;
  /** Shared with the inline gallery, so opening starts on the photo you were looking at
   *  and closing leaves you on the one you navigated to. */
  index: number;
  onIndexChange: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The photos at the size they were taken.
 *
 * `object-contain` against black rather than `object-cover`: a listing photo is the
 * thing being examined, and cropping it to fill the screen hides the part someone
 * opened it to see. Black because it is what every photo viewer does and because it
 * stops a pale room blending into a pale page.
 *
 * Sits above the listing modal it opens from, which is at z-50.
 */
export function GalleryLightbox({
  images,
  alt,
  index,
  onIndexChange,
  open,
  onOpenChange,
}: Props) {
  if (images.length === 0) return null;

  const step = (by: number) => onIndexChange((index + by + images.length) % images.length);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black" />

        <Dialog.Content
          // Escape closes this and nothing else. The listing modal underneath listens
          // for Escape on `window`, and an event that reaches Radix on `document` is
          // still on its way there — so without this, one press shut both and dumped
          // you back on the results.
          onEscapeKeyDown={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[60] flex flex-col focus:outline-none"
          aria-describedby={undefined}
        >
          {/* Required by Radix for an accessible name, and not worth showing. */}
          <Dialog.Title className="sr-only">{alt || 'תמונות הנכס'}</Dialog.Title>

          <div className="flex items-center justify-between p-3 text-white">
            {/*
              LTR: `1 / 9` in an RTL page is reordered by the bidi algorithm into
              `9 / 1`, which reads as the wrong photo of the wrong total.
            */}
            <span dir="ltr" className="rounded bg-white/10 px-2 py-1 text-sm tabular-nums">
              {index + 1} / {images.length}
            </span>

            <Dialog.Close
              aria-label="סגירה"
              className="rounded-full p-2 transition hover:bg-white/10"
            >
              <X className="h-6 w-6" />
            </Dialog.Close>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-3">
            <img
              src={images[index]}
              alt={alt}
              className="max-h-full max-w-full object-contain"
            />

            {images.length > 1 && (
              <>
                {/* RTL: the right-hand arrow points right and steps back, the left-hand
                    one points left and advances — the direction you read in. */}
                <button
                  type="button"
                  aria-label="התמונה הקודמת"
                  onClick={() => step(-1)}
                  className="absolute right-4 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
                >
                  <Chevron direction="right" />
                </button>
                <button
                  type="button"
                  aria-label="התמונה הבאה"
                  onClick={() => step(1)}
                  className="absolute left-4 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
                >
                  <Chevron direction="left" />
                </button>
              </>
            )}
          </div>

          {images.length > 1 && (
            <div className="flex shrink-0 justify-center gap-2 overflow-x-auto p-3">
              {images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => onIndexChange(i)}
                  aria-label={`תמונה ${i + 1}`}
                  aria-current={i === index}
                  className={`h-14 w-20 flex-none overflow-hidden rounded border-2 transition ${
                    i === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
