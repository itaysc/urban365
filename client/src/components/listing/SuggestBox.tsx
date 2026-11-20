import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  /**
   * Enter submits the form this sits in. A suggestion is taken only after the list
   * has been stepped into — otherwise the key would never reach the form.
   */
  submits?: boolean;
  disabled?: boolean;
  /** Draw the list on the document, so a scrolling panel cannot clip it. */
  floatMenu?: boolean;
  inputClassName?: string;
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
  submits = false,
  disabled = false,
  floatMenu = false,
  inputClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
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
      const target = e.target as Node;
      if (box.current?.contains(target)) return;
      if (target instanceof Element && target.closest('.u365-address-menu')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  useLayoutEffect(() => {
    if (!open || !floatMenu) return;
    const place = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, floatMenu, value, options.length]);

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
    /**
     * Enter, in a field that collects several values.
     *
     * Checked before anything else, because the two cases that most need it are the
     * two the guard below throws away: no list showing, and a typed name that matches
     * the list exactly so there is nothing left to suggest. In both, Enter reached the
     * form instead and submitted it — which from the other side of the screen looks
     * exactly like a field that will not take what you typed.
     *
     * What it takes is the option they moved to, or else their own words. Only where
     * `onPick` says the field collects values; a single-value box leaves Enter alone,
     * so a listing form still submits on Enter the way every other form does.
     */
    if (e.key === 'Enter' && onPick && !submits && value.trim() !== '') {
      e.preventDefault();
      choose(reached && options.length > 0 ? options[highlighted] : value.trim());
      return;
    }

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

  const menu = options.map((option, i) => (
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
        className={`u365-address-option flex w-full items-center gap-2 px-3 py-2 text-right text-sm ${i === highlighted ? 'is-on bg-slate-50' : ''}`}
      >
        <MapPin className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <span>{highlight(option, term)}</span>
      </button>
    </li>
  ));

  return (
    <div ref={box} className="relative w-full min-w-0">
      <input
        ref={inputRef}
        id={id}
        required={required}
        disabled={disabled}
        autoComplete="off"
        className={inputClassName ?? `${inputClass} w-full min-w-0`}
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

      {open && options.length > 0 &&
        (floatMenu && anchor
          ? createPortal(
              <ul className="u365-address-menu" style={{ top: anchor.top, left: anchor.left, width: anchor.width }}>
                {menu}
              </ul>,
              document.body,
            )
          : (
              <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {menu}
              </ul>
            ))}

      {/* Hidden while the list is open, where it would be underneath it. */}
      {footer && !open && footer}
    </div>
  );
}
