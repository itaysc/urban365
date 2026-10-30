import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { ISRAELI_CITIES } from '@/data/cities';
import { inputClass } from '@/components/ui/Field';
import { highlight } from '@/lib/highlight';

interface Props {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

/** Enough to be worth drawing, few enough to read without scrolling past the field. */
const MAX_SUGGESTIONS = 8;

/**
 * Which city, from the list of every locality in Israel.
 *
 * A list rather than a free text box, because `Listing.city` is compared exactly: a flat
 * filed under `תל אביב` instead of `תל אביב יפו` is a flat nobody searching Tel Aviv
 * will ever see. The seller cannot know that, and should not have to.
 *
 * Matching is on a prefix first and then anywhere in the name, so typing `רמת` offers
 * רמת גן before רמת ישי and both before אבן יהודה — the thing you are most likely to
 * have meant is the thing at the top.
 */
export function CityBox({ value, onChange, id = 'city' }: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const term = value.trim();

  const matches = useMemo(() => {
    if (term === '') return [];

    const starts: string[] = [];
    const contains: string[] = [];

    for (const city of ISRAELI_CITIES) {
      if (city === term) continue;
      if (city.startsWith(term)) starts.push(city);
      else if (city.includes(term)) contains.push(city);
      if (starts.length >= MAX_SUGGESTIONS) break;
    }

    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [term]);

  // Every locality, so a village of two hundred people is as findable as Tel Aviv. The
  // filter is a scan over 1,300 strings, which is nothing next to one request.
  const known = useMemo(() => new Set(ISRAELI_CITIES), []);
  const unknown = term !== '' && !known.has(term);

  useEffect(() => {
    const onDocumentClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  const choose = (city: string) => {
    onChange(city);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || matches.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      // Enter in a single-field row would submit the form; here it takes the highlighted
      // city instead, which is what somebody halfway through typing a name meant.
      e.preventDefault();
      choose(matches[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={box} className="relative">
      <input
        id={id}
        required
        autoComplete="off"
        className={inputClass}
        value={value}
        placeholder="עיר או יישוב"
        onChange={(e) => {
          onChange(e.target.value);
          setHighlighted(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
      />

      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((city, i) => (
            <li key={city}>
              <button
                type="button"
                // mousedown, not click: the input's blur fires first and would close the
                // list out from under the pointer.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(city);
                }}
                onMouseEnter={() => setHighlighted(i)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-right text-sm ${
                  i === highlighted ? 'bg-slate-50' : ''
                }`}
              >
                <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span>{highlight(city, term)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        A warning, not a block. The list is every locality the CBS knows about, so a
        name that is not on it is almost always a typo — but "almost" is doing work, and
        refusing to let somebody name their own town would be worse than a stray entry.
      */}
      {unknown && !open && (
        <p className="mt-1 text-xs text-amber-700">
          לא מצאנו יישוב בשם הזה. אפשר להמשיך, אבל ייתכן שהנכס לא יופיע בחיפושים.
        </p>
      )}
    </div>
  );
}
