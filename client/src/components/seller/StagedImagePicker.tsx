import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { MAX_SELLER_IMAGES } from '@/services/seller';

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

/**
 * Photos chosen before the listing exists, held in the browser until it does.
 *
 * The listing used to be published first so there was something to upload to, which
 * meant a flat went on the market picture-less and stayed that way for however long ten
 * photos take to send — the worst possible moment to be seen, since a listing with no
 * photo is the one nobody opens. Now everything is chosen first and the whole thing
 * goes up in one submit.
 *
 * Previews come from object URLs rather than the server, so they appear instantly and
 * cost nothing; they are revoked when the file leaves the list, or the browser holds on
 * to every photo ever chosen for the life of the page.
 */
export function StagedImagePicker({ files, onChange, disabled = false }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // Made during render and revoked when the list changes, rather than set into state
  // from an effect: the preview of a file is not news that has to travel through a
  // second render, it is just a handle on bytes the browser already has.
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const remaining = MAX_SELLER_IMAGES - files.length;

  const add = (picked: FileList | File[]) => {
    const images = [...picked].filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return;

    if (images.length > remaining) {
      toast.error(`אפשר להוסיף עוד ${remaining} תמונות בלבד.`);
    }

    onChange([...files, ...images.slice(0, remaining)]);
    if (input.current) input.current.value = '';
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">תמונות</h2>
        <span className="text-xs text-slate-500">
          {files.length} מתוך {MAX_SELLER_IMAGES}
        </span>
      </div>

      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${file.lastModified}-${i}`}
              className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200"
            >
              {previews[i] && <img src={previews[i]} alt="" className="h-full w-full object-cover" />}

              {i === 0 && (
                // The first photo is the one every search result shows, which is worth
                // saying rather than leaving someone to discover.
                <span className="absolute bottom-1 start-1 rounded bg-black/70 px-1.5 py-0.5 text-[0.65rem] text-white">
                  תמונה ראשית
                </span>
              )}

              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(files.filter((_, at) => at !== i))}
                aria-label="הסרת התמונה"
                className="absolute end-1 top-1 rounded-full bg-white/90 p-1 text-slate-600 opacity-0 transition hover:text-red-700 focus:opacity-100 group-hover:opacity-100 disabled:hidden"
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
            add(e.dataTransfer.files);
          }}
          disabled={disabled}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm transition ${
            dragging ? 'border-slate-900 bg-slate-50' : 'border-slate-300 text-slate-500 hover:border-slate-400'
          } disabled:opacity-60`}
        >
          <ImagePlus className="h-6 w-6" aria-hidden />
          גררו תמונות לכאן או לחצו לבחירה (עוד {remaining})
        </button>
      )}

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => e.target.files && add(e.target.files)}
      />
    </section>
  );
}
