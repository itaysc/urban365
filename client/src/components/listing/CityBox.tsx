import { useMemo } from 'react';
import { ISRAELI_CITIES } from '@/data/cities';
import { SuggestBox } from '@/components/listing/SuggestBox';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Choosing a city from the list, when that is a different act from typing one. */
  onPick?: (value: string) => void;
  id?: string;
  /** The agency editor saves half-filled drafts; the publish form does not. */
  required?: boolean;
  /**
   * Whether an unknown name gets the note under the field. Off where that note would
   * resize a dialog, and where a listing search is not what the city is for.
   */
  warn?: boolean;
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
export function CityBox({ value, onChange, onPick, id = 'city', required = false, warn = true }: Props) {
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

  // The filter is a scan over 1,300 strings, which is nothing next to one request — and
  // it means a village of two hundred people is as findable as Tel Aviv.
  const known = useMemo(() => new Set(ISRAELI_CITIES), []);

  return (
    <SuggestBox
      id={id}
      value={value}
      onChange={onChange}
      onPick={onPick}
      options={matches}
      term={term}
      required={required}
      placeholder="עיר או יישוב"
      footer={
        // A warning, not a block. The list is every locality the CBS knows about, so a
        // name that is not on it is almost always a typo — but "almost" is doing work,
        // and refusing to let somebody name their own town would be worse than a stray
        // entry.
        warn && term !== '' && !known.has(term) ? (
          <p className="mt-1 text-xs text-amber-700">
            לא מצאנו יישוב בשם הזה. אפשר להמשיך, אבל ייתכן שהנכס לא יופיע בחיפושים.
          </p>
        ) : null
      }
    />
  );
}
