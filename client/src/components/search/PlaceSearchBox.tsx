import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin, Navigation, X } from 'lucide-react';
import {
  clearRecentPlaces,
  readRecentPlaces,
  rememberPlace,
  type RecentPlace,
} from '@/lib/recentPlaces';
import { qk } from '@/queries/keys';
import { fetchCityAt, fetchPlaceSuggestions } from '@/services/search';
import type { SearchFilters } from '@/types/search';

/**
 * How many places can be searched at once. A cap exists because each one widens the
 * query and the map can only frame a single outline — past a handful the result stops
 * being a search of anywhere in particular.
 */
const MAX_PLACES = 5;

/** Below this, every city in the country matches and the list says nothing. */
const MIN_TERM = 2;

interface Props {
  filters: SearchFilters;
  update: (patch: Partial<SearchFilters>) => void;
}

/** A chosen place, flattened so the chip row does not care which list it came from. */
interface Chosen {
  kind: 'city' | 'neighborhood';
  value: string;
  label: string;
}

/**
 * Bolds the part of a label the person has actually typed.
 *
 * Split rather than a regex over the label: a search term is arbitrary text and may
 * contain characters a regex would read as syntax.
 */
function highlight(label: string, term: string) {
  const at = term ? label.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (at === -1) return label;

  return (
    <>
      {label.slice(0, at)}
      <strong className="font-semibold text-slate-900">{label.slice(at, at + term.length)}</strong>
      {label.slice(at + term.length)}
    </>
  );
}

export function PlaceSearchBox({ filters, update }: Props) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // Read once on mount, then kept in step by `remember` below — reading storage on
  // every render would re-parse the same JSON on every keystroke.
  const [recent, setRecent] = useState<RecentPlace[]>(() => readRecentPlaces());
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Debounced, so a word typed at speed is one request rather than one per letter.
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(term.trim()), 200);
    return () => window.clearTimeout(id);
  }, [term]);

  const { data } = useQuery({
    queryKey: qk.listings.suggest(debounced, filters.section),
    queryFn: () => fetchPlaceSuggestions(debounced, filters.section),
    enabled: debounced.length >= MIN_TERM,
    // A place list barely changes between keystrokes, and holding the previous answer
    // stops the dropdown emptying and refilling while someone is still typing.
    staleTime: 5 * 60_000,
  });

  const chosen = useMemo<Chosen[]>(
    () => [
      ...filters.city.map((value) => ({ kind: 'city' as const, value, label: value })),
      ...filters.neighborhood.map((value) => ({ kind: 'neighborhood' as const, value, label: value })),
    ],
    [filters.city, filters.neighborhood],
  );

  const remaining = MAX_PLACES - chosen.length;

  // One flat list behind the grouped display, so the arrow keys can walk the whole
  // dropdown rather than stopping at a section boundary. Already-chosen places drop
  // out: offering to add what is already added is a dead row.
  const options = useMemo(() => {
    const hoods = (data?.neighborhoods ?? [])
      .filter((h) => !filters.neighborhood.includes(h.value))
      .map((h) => ({
        kind: 'neighborhood' as const,
        value: h.value,
        city: h.city,
        label: `${h.value}, ${h.city}`,
        count: h.count,
      }));

    const cities = (data?.cities ?? [])
      .filter((c) => !filters.city.includes(c.value))
      .map((c) => ({
        kind: 'city' as const,
        value: c.value,
        city: c.value,
        label: c.value,
        count: c.count,
      }));

    // Cities first. The reference this is modelled on lists neighbourhoods above them,
    // which works in a near-full-height dropdown; here six neighbourhoods pushed the
    // city itself below the fold, and the city is the one row that must never be
    // missed — typing a city name and not being offered the city reads as a bug.
    return [...cities, ...hoods];
  }, [data, filters.city, filters.neighborhood]);

  useEffect(() => setHighlighted(0), [options.length]);

  // Clicking anywhere else closes it. Pointerdown rather than click, so the dropdown is
  // gone by the time a click lands on whatever is underneath.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  /** Applies a place, whether it came from the suggestions, the recents or geolocation. */
  const apply = (place: RecentPlace) => {
    if (place.kind === 'city') {
      if (!filters.city.includes(place.value)) update({ city: [...filters.city, place.value] });
    } else {
      // The city travels with it: `מרכז העיר` exists in a dozen towns, and without the
      // city the filter would match all of them. It also gives the map an outline to
      // draw, which a neighbourhood on its own does not.
      update({
        neighborhood: filters.neighborhood.includes(place.value)
          ? filters.neighborhood
          : [...filters.neighborhood, place.value],
        city: filters.city.includes(place.city) ? filters.city : [...filters.city, place.city],
      });
    }

    setRecent(rememberPlace(place));
    setTerm('');
  };

  const choose = (option: (typeof options)[number]) => {
    if (remaining <= 0) return;
    apply({
      kind: option.kind,
      value: option.value,
      city: option.city,
      label: option.label,
    });
  };

  /**
   * "Near my location": the browser gives coordinates, the server says which city they
   * fall in, and the result is the same search as picking that city by hand — so the
   * outline, the pins and the list all follow with nothing special about this path.
   */
  const locateMe = () => {
    setLocationError(null);

    if (!('geolocation' in navigator)) {
      setLocationError('הדפדפן לא תומך באיתור מיקום.');
      return;
    }
    if (remaining <= 0) return;

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void fetchCityAt(position.coords.latitude, position.coords.longitude)
          .then((city) => {
            if (!city) {
              setLocationError('לא זיהינו עיר במיקום שלך.');
              return;
            }
            apply({ kind: 'city', value: city, city, label: city });
          })
          .catch(() => setLocationError('לא הצלחנו לזהות את המיקום שלך.'))
          .finally(() => setLocating(false));
      },
      (error) => {
        setLocating(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? 'לא ניתנה הרשאה לשימוש במיקום.'
            : 'לא הצלחנו לאתר את המיקום שלך.',
        );
      },
      { timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  };

  const remove = (item: Chosen) => {
    if (item.kind === 'city') update({ city: filters.city.filter((v) => v !== item.value) });
    else update({ neighborhood: filters.neighborhood.filter((v) => v !== item.value) });
  };

  const clear = () => update({ city: [], neighborhood: [] });

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setHighlighted((i) => {
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        return options.length === 0 ? 0 : (next + options.length) % options.length;
      });
      return;
    }
    if (e.key === 'Enter' && open && options[highlighted]) {
      e.preventDefault();
      choose(options[highlighted]);
    }
  };

  const cities = options.filter((o) => o.kind === 'city');
  const hoods = options.filter((o) => o.kind === 'neighborhood');
  // Where the second group starts in the flat list, so the highlighted index lines up
  // with what is drawn.
  const hoodOffset = cities.length;

  const row = (option: (typeof options)[number], index: number) => (
    <li key={`${option.kind}:${option.value}:${option.city}`}>
      <button
        type="button"
        // Mousedown, not click: a click fires after blur, by which point the dropdown
        // has already closed and the button is gone.
        onMouseDown={(e) => {
          e.preventDefault();
          choose(option);
        }}
        onMouseEnter={() => setHighlighted(index)}
        disabled={remaining <= 0}
        className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-sm text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 ${
          index === highlighted ? 'bg-slate-50' : ''
        }`}
      >
        <span>{highlight(option.label, debounced)}</span>
        {option.count > 0 && <span className="shrink-0 text-xs text-slate-400">{option.count}</span>}
      </button>
    </li>
  );

  return (
    <div ref={box} className="relative">
      <div className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 focus-within:border-slate-400">
        <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={chosen.length > 0 ? `${chosen.length} מיקומים נבחרו` : 'עיר או שכונה'}
          aria-label="חיפוש לפי מיקום"
          role="combobox"
          aria-expanded={open}
          aria-controls="place-suggestions"
          className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />
      </div>

      {open && (
        <div
          id="place-suggestions"
          className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm text-slate-500">
              {remaining === 0 && 'הגעתם למספר המיקומים המרבי'}
              {/* Hebrew does not take a numeral before a singular noun here. */}
              {remaining === 1 && 'נשאר עוד מיקום אחד לבחירה'}
              {remaining > 1 && `נשארו עוד ${remaining} מיקומים לבחירה`}
            </p>

            {chosen.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {chosen.map((item) => (
                  <li key={`${item.kind}:${item.value}`}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        remove(item);
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-200"
                    >
                      <X className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                      {item.label}
                      <span className="sr-only">הסרה</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/*
            Always first, typed into or not. It is the one row that needs no knowledge
            of how anywhere is spelled, which is the whole difficulty of a place search
            in Hebrew.
          */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              locateMe();
            }}
            disabled={locating || remaining <= 0}
            className="flex w-full items-center gap-2 border-b border-slate-100 px-4 py-3 text-start text-sm font-semibold text-orange-600 transition hover:bg-orange-50 disabled:opacity-50"
          >
            <Navigation className="h-4 w-4" aria-hidden />
            {locating ? 'מאתר…' : 'קרוב למיקום שלי'}
          </button>

          {locationError && (
            <p className="border-b border-slate-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              {locationError}
            </p>
          )}

          <div className="max-h-[60vh] overflow-y-auto">
            {/*
              Nothing typed yet. Rather than an instruction to type something, offer the
              places this person has already searched — on a search page most returns
              are to somewhere they looked at before.
            */}
            {debounced.length < MIN_TERM && recent.length > 0 && (
              <>
                <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
                  <h3 className="text-sm font-semibold text-slate-900">חיפושים אחרונים</h3>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setRecent(clearRecentPlaces());
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    ניקוי
                  </button>
                </div>
                <ul>
                  {recent.map((place) => (
                    <li key={`${place.kind}:${place.value}:${place.city}`}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          apply(place);
                        }}
                        disabled={remaining <= 0}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <Clock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                        {place.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {debounced.length < MIN_TERM && recent.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                הקלידו שם של עיר או שכונה
              </p>
            )}

            {debounced.length >= MIN_TERM && options.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-400">לא נמצאו מיקומים מתאימים</p>
            )}

            {cities.length > 0 && (
              <>
                <h3 className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-900">עיר</h3>
                <ul>{cities.map((o, i) => row(o, i))}</ul>
              </>
            )}

            {hoods.length > 0 && (
              <>
                <h3 className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-900">שכונה</h3>
                <ul>{hoods.map((o, i) => row(o, hoodOffset + i))}</ul>
              </>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                clear();
              }}
              disabled={chosen.length === 0}
              className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-40"
            >
              איפוס
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
              className="text-sm font-semibold text-orange-600 hover:text-orange-700"
            >
              אישור
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
