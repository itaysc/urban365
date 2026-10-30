import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { highlight } from '@/lib/highlight';
import { inputClass } from '@/components/ui/Field';
import { qk } from '@/queries/keys';
import { fetchNeighborhoodsIn } from '@/services/search';

interface Props {
  /** The city chosen on the form. With none, there is nothing to scope a list to. */
  city: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

/**
 * Which part of the city, suggested from the neighbourhoods we already hold.
 *
 * The search page's box in miniature — same dropdown, same bolding of what was typed —
 * but one value instead of chips, and scoped to the city on the form rather than the
 * whole country. A neighbourhood name means nothing without its city: several towns
 * have a מרכז העיר, and offering Tel Aviv's while somebody describes a flat in Holon
 * is worse than offering nothing.
 *
 * Whatever is typed stands whether or not it is on the list. A new development has a
 * name long before it has any listings, and the seller knows that name better than we
 * do.
 */
export function NeighborhoodBox({ city, value, onChange, id = 'neighborhood' }: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // Debounced, so a word typed at speed is one request rather than one per letter.
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value.trim()), 200);
    return () => window.clearTimeout(id);
  }, [value]);

  const { data } = useQuery({
    queryKey: qk.listings.neighborhoods(city.trim(), debounced),
    queryFn: () => fetchNeighborhoodsIn(city.trim(), debounced),
    // No minimum term, unlike the search box: inside one city the whole list is short
    // enough to show on focus, and seeing it is how somebody learns what we call their
    // neighbourhood.
    enabled: city.trim().length > 1,
    staleTime: 5 * 60_000,
  });

  // Anything already typed in full is not a suggestion, it is what is in the box.
  const options = (data ?? []).filter((name) => name !== value.trim());

  useEffect(() => {
    const onDocumentClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || options.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === 'Enter') {
      // Only when something is actually highlighted — otherwise Enter in this field
      // means "I have finished typing my own answer", not "take the first guess".
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
        className={`${inputClass} w-full`}
        value={value}
        autoComplete="off"
        placeholder={city.trim() ? 'שכונה' : 'קודם בחרו עיר'}
        onChange={(e) => {
          onChange(e.target.value);
          setHighlighted(0);
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
          {options.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                // mousedown, not click: the input's blur fires first and would close
                // the list out from under the pointer.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(name);
                }}
                onMouseEnter={() => setHighlighted(i)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-right text-sm ${
                  i === highlighted ? 'bg-slate-50' : ''
                }`}
              >
                <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span>{highlight(name, debounced)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
