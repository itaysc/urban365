import { useRef, useState, type DragEvent, type ReactNode } from 'react';

/** The types the server will actually accept, so the picker and the drop agree with it. */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const ACCEPT = IMAGE_TYPES.join(',');

interface Props {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  /** Shown in the resting state; falls back to a sensible Hebrew default. */
  children?: ReactNode;
}

/**
 * Click or drop. It is a `<button>` rather than a styled div so it is reachable by
 * keyboard and announced as something activatable — a div with an onClick is invisible
 * to anyone not using a mouse.
 */
export function Dropzone({ onFiles, multiple = false, disabled = false, children }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState(0);

  // Entering a child element fires dragleave on the parent, so a boolean alone makes the
  // highlight flicker. Counting enter/leave pairs is what keeps it steady.
  const depth = useRef(0);

  const take = (list: FileList | null) => {
    if (!list) return;

    const files = [...list];
    // A drop carries anything the user happened to be holding — a PDF, a folder — so
    // the non-images are dropped here rather than failing one by one at the server.
    const images = files.filter((f) => IMAGE_TYPES.includes(f.type));

    setRejected(files.length - images.length);
    if (images.length > 0) onFiles(multiple ? images : images.slice(0, 1));
  };

  const onDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    if (!disabled) take(e.dataTransfer.files);
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple={multiple}
        hidden
        onChange={(e) => {
          take(e.target.files);
          // Cleared so picking the same file twice in a row still fires a change event.
          e.target.value = '';
        }}
      />

      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          depth.current += 1;
          if (!disabled) setOver(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          depth.current -= 1;
          if (depth.current <= 0) setOver(false);
        }}
        onDrop={onDrop}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition ${
          disabled
            ? 'cursor-not-allowed border-slate-200 text-slate-300'
            : over
              ? 'border-slate-900 bg-slate-50 text-slate-900'
              : 'border-slate-300 text-slate-500 hover:border-slate-900 hover:text-slate-700'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M12 16V4m0 0L8 8m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
        </svg>

        <span className="text-sm font-medium">
          {children ?? (multiple ? 'גררו תמונות לכאן או לחצו לבחירה' : 'גררו תמונה לכאן או לחצו לבחירה')}
        </span>
        <span className="text-xs">JPG · PNG · WebP · AVIF · עד 8MB</span>
      </button>

      {rejected > 0 && (
        <p className="text-xs text-amber-700">
          {rejected === 1 ? 'קובץ אחד לא היה תמונה ולא נוסף.' : `${rejected} קבצים לא היו תמונות ולא נוספו.`}
        </p>
      )}
    </div>
  );
}
