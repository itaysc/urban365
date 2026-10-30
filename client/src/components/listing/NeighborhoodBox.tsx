import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NEIGHBORHOODS } from '@/data/neighborhoods';
import { SuggestBox } from '@/components/listing/SuggestBox';
import { cityKey } from '@/lib/cityKey';
import { qk } from '@/queries/keys';
import { fetchNeighborhoodsIn } from '@/services/search';

interface Props {
  /** The city chosen on the form. With none, there is nothing to scope a list to. */
  city: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

/** Enough to be worth drawing, few enough to read without scrolling past the field. */
const MAX_SUGGESTIONS = 8;

/**
 * Which part of the city.
 *
 * Two sources, in order. The Central Bureau of Statistics names the neighbourhoods of
 * every city large enough to be divided into statistical areas, which is where the
 * answer almost always is. Our own listings fill the rest: a city too small for the CBS
 * table, and the new developments that have a name before they appear in any official
 * list.
 *
 * Scoped to the city on the form, because a neighbourhood name means nothing without
 * its city — several towns have a מרכז העיר, and offering Tel Aviv's while somebody
 * describes a flat in Holon is worse than offering nothing.
 *
 * Whatever is typed stands whether or not it is on either list. The seller knows where
 * they live better than we do.
 */
export function NeighborhoodBox({ city, value, onChange, id = 'neighborhood' }: Props) {
  // Debounced, so a word typed at speed is one request rather than one per letter.
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value.trim()), 200);
    return () => window.clearTimeout(timer);
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

  const known = useMemo(() => NEIGHBORHOODS[cityKey(city)] ?? [], [city]);

  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];

    // The official list first and whatever our listings add after it, both filtered by
    // what has been typed. Anything already typed in full is not a suggestion, it is
    // what is in the box.
    for (const name of [...known, ...(data ?? [])]) {
      if (seen.has(name) || name === value.trim()) continue;
      if (debounced && !name.includes(debounced)) continue;
      seen.add(name);
      out.push(name);
      if (out.length >= MAX_SUGGESTIONS) break;
    }

    return out;
  }, [known, data, debounced, value]);

  return (
    <SuggestBox
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      term={debounced}
      placeholder={city.trim() ? 'שכונה' : 'קודם בחרו עיר'}
    />
  );
}
