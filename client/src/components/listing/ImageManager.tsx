import { useState } from 'react';
import { Dropzone } from '@/components/ui/Dropzone';
import { errorMessageOf } from '@/lib/apiError';
import {
  removeListingImage,
  reorderListingImages,
  uploadListingImage,
  type ListingDetail,
} from '@/services/agency';

interface Props {
  listing: ListingDetail;
  onChange: (listing: ListingDetail) => void;
}

/**
 * Photos go browser → Backblaze directly; this only ever sends the resulting key to our
 * API. The first image is the cover, which is why order is editable at all.
 */
export function ImageManager({ listing, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const upload = async (files: File[]) => {
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: files.length });

    try {
      // Sequential, not Promise.all: each upload ends in a position computed from the
      // current image count, so running them together would collide on position.
      let latest = listing;
      for (const [index, file] of files.entries()) {
        latest = await uploadListingImage(listing.id, file);
        setProgress({ done: index + 1, total: files.length });
      }
      onChange(latest);
    } catch (e) {
      setError(errorMessageOf(e, 'ההעלאה נכשלה.'));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const remove = async (imageId: string) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await removeListingImage(listing.id, imageId));
    } catch (e) {
      setError(errorMessageOf(e, 'לא הצלחנו למחוק את התמונה.'));
    } finally {
      setBusy(false);
    }
  };

  const move = async (imageId: string, delta: number) => {
    const ids = listing.images.map((i) => i.id);
    const from = ids.indexOf(imageId);
    const to = from + delta;
    if (to < 0 || to >= ids.length) return;

    ids.splice(to, 0, ...ids.splice(from, 1));

    setBusy(true);
    try {
      onChange(await reorderListingImages(listing.id, ids));
    } catch (e) {
      setError(errorMessageOf(e, 'לא הצלחנו לשנות את הסדר.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">תמונות</h2>
        {progress && (
          <span className="text-xs text-slate-500">
            מעלה {progress.done}/{progress.total}…
          </span>
        )}
      </div>

      <Dropzone multiple disabled={busy} onFiles={(files) => void upload(files)} />

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>
      )}

      {listing.images.length === 0 ? (
        <p className="text-center text-xs text-slate-400">התמונה הראשונה תופיע ככריכה.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {listing.images.map((image, index) => (
            <li
              key={image.id}
              className="relative overflow-hidden rounded-lg border border-slate-200"
            >
              <img src={image.url} alt="" className="aspect-[4/3] w-full object-cover" />

              {index === 0 && (
                <span className="absolute top-1 start-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] text-white">
                  כריכה
                </span>
              )}

              <div className="flex items-center justify-between gap-1 p-1">
                <div className="flex gap-1">
                  {/* Arrows, not drag-and-drop: this has to work on a phone too. */}
                  <button
                    type="button"
                    disabled={busy || index === 0}
                    onClick={() => void move(image.id, -1)}
                    className="rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    aria-label="הזז אחורה"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={busy || index === listing.images.length - 1}
                    onClick={() => void move(image.id, 1)}
                    className="rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    aria-label="הזז קדימה"
                  >
                    ↓
                  </button>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(image.id)}
                  className="rounded px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-30"
                >
                  מחק
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
