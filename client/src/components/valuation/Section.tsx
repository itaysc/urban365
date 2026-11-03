import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  title: string;
  /** What answering this section buys, said before it is opened. */
  hint: string;
  /** How many of its questions have been answered, shown on the closed header. */
  answered: number;
  total: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * One group of the data sheet, closed until it is wanted.
 *
 * The sheet runs to twenty-odd fields and the first six answer on their own — town,
 * pin, rooms, size — so showing all of it at once makes a short task look like a long
 * one. The rest narrow the range rather than unlock it, which is what the count on
 * each header is for: it says what you would gain, instead of implying you are not
 * finished.
 *
 * A real `<button>` with `aria-expanded` rather than a `<details>`, because the count
 * and the hint both need to stay readable when it is shut, and `<summary>` styling is
 * still uneven across browsers.
 */
export function Section({ title, hint, answered, total, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className="rounded-xl border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start"
      >
        <span className="flex flex-col">
          <span className="text-sm font-medium text-slate-800">{title}</span>
          <span className="text-xs text-slate-500">{hint}</span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <span className="text-xs tabular-nums text-slate-500">
            {answered}/{total}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {/*
        Unmounted rather than hidden: a closed section holds no focusable field, so
        tabbing through the form never lands somewhere invisible.
      */}
      {open && (
        <div id={id} className="flex flex-col gap-4 border-t border-slate-100 px-4 py-4">
          {children}
        </div>
      )}
    </div>
  );
}
