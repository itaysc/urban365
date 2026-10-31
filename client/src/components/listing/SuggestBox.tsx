import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { inputClass } from '@/components/ui/Field';
import { highlight } from '@/lib/highlight';

interface Props {
  id: string;
  value: string;
  /** Typing. Fires per keystroke, and for a pick when there is no `onPick`. */
  onChange: (value: string) => void;
  /**
   * Choosing one of the suggestions, which is a different act from typing one.
   *
   * Without this, a field that reacts to a chosen value has to guess from `onChange`
   * whether the text it just received was picked or typed — and every guess is wrong
   * on the first keystroke, which looks exactly like a field that will not accept
   * input. Given, it is the only thing a pick calls.
   */
  onPick?: (value: string) => void;
  /** Already filtered and ordered by whoever knows where they come from. */
  options: readonly string[];
  placeholder?: string;
  required?: boolean;
  /** What the typing is matched against, for bolding. Usually the debounced value. */
  term?: string;
  /** Said under the field — a warning about what was typed, say. */
  footer?: ReactNode;
}

/**
 * A text field that suggests, without insisting.
 *
 * The shape is the search page's place box reduced to one value: a list under the
 * field, the typed part bolded, arrows and Enter to pick, and whatever was typed
 * standing whether or not it is on the list. Three fields want exactly that — city,
 * neighbourhood, street — and they differ only in where the options come from, which
 * is the one thing this does not know.
 */
export function SuggestBox({
  id,
  value,
  onChange,
  onPick,
  options,
  placeholder,
  required = false,
  term = '',
  footer,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  /**
   * Whether the person has actually reached into the list, by arrow key or pointer.
   *
   * Until they have, Enter and Tab leave what they typed alone. Someone typing a street
   * that is not on the list — a new one, or one with a house number after it — would
   * otherwise have their text replaced by whatever the list happened to be showing,
   * which is the opposite of allowing free text.
   */
  const [reached, setReached] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocumentClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  const choose = (option: string) => {
    if (onPick) {
      onPick(option);
      setOpen(false);
      setReached(false);
      return;
    }

    onChange(option);
    setOpen(false);
    setReached(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || options.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setReached(true);
      setHighlighted((i) => (reached ? (i + 1) % options.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setReached(true);
      setHighlighted((i) => (reached ? (i - 1 + options.length) % options.length : options.length - 1));
    } else if ((e.key === 'Enter' || e.key === 'Tab') && reached) {
      // Only once they have chosen something. Enter on a form would otherwise submit,
      // so it is still swallowed here — but what it takes is the option they moved to,
      // never a guess at what they were typing.
      e.preventDefault();
      choose(options[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={box} className="relative">
      <input
        id={id}
        required={required}
        autoComplete="off"
        className={`${inputClass} w-full`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setHighlighted(0);
          setReached(false);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-autocomplete="list"
      />

      {open && options.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {options.map((option, i) => (
            <li key={option}>
              <button
                type="button"
                // mousedown, not click: the input's blur fires first and would close the
                // list out from under the pointer.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(option);
                }}
                onMouseEnter={() => {
                  setHighlighted(i);
                  setReached(true);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-right text-sm ${
                  i === highlighted ? 'bg-slate-50' : ''
                }`}
              >
                <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span>{highlight(option, term)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Hidden while the list is open, where it would be underneath it. */}
      {footer && !open && footer}
    </div>
  );
}
