import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessageOf } from '@/lib/apiError';
import {
  deleteMyListingImage,
  uploadMyListingImage,
  MAX_SELLER_IMAGES,
  type SellerListing,
} from '@/services/seller';
import type { ListingImage } from '@/services/agency';

interface Props {
  listingId: string;
  images: ListingImage[];
  onChange: (images: ListingImage[]) => void;
}

/**
 * Up to ten photos, uploaded one at a time.
 *
 * Sequentially rather than in parallel: ten phone photos at once is tens of megabytes
 * leaving a mobile connection together, and the failure mode — some arrive, some do not,
 * in no particular order — is far harder to report than one at a time.
 *
 * The cap is checked here *and* on the server. This one is a courtesy so nobody waits
 * for an upload that was always going to be refused; the server's is the rule.
 */
export function ImageUploader({ listingId, images, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const remaining = MAX_SELLER_IMAGES - images.length;

  const add = async (files: FileList | File[]) => {
    const picked = [...files].filter((f) => f.type.startsWith('image/'));
    if (picked.length === 0) return;

    if (picked.length > remaining) {
      toast.error(`אפשר להוסיף עוד ${remaining} תמונות בלבד.`);
    }

    setBusy(true);
    let current = images;

    for (const file of picked.slice(0, remaining)) {
      try {
        const image = await uploadMyListingImage(listingId, file);
        current = [...current, image];
        // Published as each one lands, so progress is visible rather than the whole
        // batch appearing at the end.
        onChange(current);
      } catch (e) {
        toast.error(errorMessageOf(e, `לא הצלחנו להעלות את ${file.name}.`));
        break;
      }
    }

    setBusy(false);
    if (input.current) input.current.value = '';
  };

  const remove = async (imageId: string) => {
    try {
      await deleteMyListingImage(listingId, imageId);
      onChange(images.filter((image) => image.id !== imageId));
    } catch (e) {
      toast.error(errorMessageOf(e, 'לא הצלחנו להסיר את התמונה.'));
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">תמונות</h2>
        <span className="text-xs text-slate-500">
          {images.length} מתוך {MAX_SELLER_IMAGES}
        </span>
      </div>

      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {images.map((image, i) => (
            <li key={image.id} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200">
              <img src={image.url} alt="" className="h-full w-full object-cover" />

              {i === 0 && (
                // The first photo is the one every search result shows, which is worth
                // saying rather than leaving someone to discover.
                <span className="absolute bottom-1 start-1 rounded bg-black/70 px-1.5 py-0.5 text-[0.65rem] text-white">
                  תמונה ראשית
                </span>
              )}

              <button
                type="button"
                onClick={() => void remove(image.id)}
                aria-label="הסרת התמונה"
                className="absolute end-1 top-1 rounded-full bg-white/90 p-1 text-slate-600 opacity-0 transition hover:text-red-700 focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {remaining > 0 && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void add(e.dataTransfer.files);
          }}
          disabled={busy}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm transition ${
            dragging ? 'border-slate-900 bg-slate-50' : 'border-slate-300 text-slate-500 hover:border-slate-400'
          } disabled:opacity-60`}
        >
          <ImagePlus className="h-6 w-6" aria-hidden />
          {busy ? 'מעלה…' : `גררו תמונות לכאן או לחצו לבחירה (עוד ${remaining})`}
        </button>
      )}

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => e.target.files && void add(e.target.files)}
      />
    </section>
  );
}

export type { SellerListing };
