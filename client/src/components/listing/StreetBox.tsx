import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SuggestBox } from '@/components/listing/SuggestBox';
import { splitPlace } from '@/lib/address-line';
import { splitHouseNumber } from '@/lib/house-number';
import { qk } from '@/queries/keys';
import { fetchAddressSuggestions, fetchStreetsIn } from '@/services/search';

interface Props {
  /** The city already on the form, when there is one. Empty still searches the register. */
  city: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * A number typed after the street. Picking the suggestion puts the street in the
   * street field and the number here, which is the field the address is actually saved as.
   */
  onHouseNumber?: (house: string) => void;
  /** Set when a suggestion names the town, because the street was typed before the city. */
  onCity?: (city: string) => void;
  id?: string;
}

/** "סוקולוב 12, חולון" back into the three fields an address form actually stores. */
function pickedAddress(picked: string): { street: string; house: string; city: string } {
  const comma = picked.lastIndexOf(',');
  if (comma < 0) {
    const parts = splitHouseNumber(picked);
    return { street: parts.name, house: parts.house, city: '' };
  }
  const parts = splitHouseNumber(picked.slice(0, comma));
  return { street: parts.name, house: parts.house, city: picked.slice(comma + 1).trim() };
}

/**
 * Which street, from the Interior Ministry's register of all 62,000 of them.
 *
 * Asked of the server rather than shipped to the browser: the register is a megabyte,
 * and nobody should download the streets of Eilat to fill in an address in Haifa.
 *
 * It matters more than it looks. The street is what the geocoder turns into the pin on
 * the map, and a misspelt one either lands the flat on the wrong road or fails to place
 * it at all — so this is the field where suggesting the register's own spelling pays
 * for itself.
 *
 * A house number does not stop the list. "הרצל 15" is still הרצל; the 15 is shown on
 * the suggestion and, when the form has a place for it, moved there on pick. With no
 * city chosen yet, "סוקולוב" is looked up across the country and picking a row fills
 * the town as well.
 */
export function StreetBox({ city, value, onChange, onHouseNumber, onCity, id = 'street' }: Props) {
  const { name, house } = splitHouseNumber(value);
  // "סוקולוב הרצליה" is a street and a town, same as with a comma. The town typed
  // here wins over the one already on the form.
  const place = splitPlace(value);
  const streetName = place.separated ? place.street : name;
  const houseShown = place.separated ? place.house : house;
  const chosen = place.separated ? '' : city.trim();
  // A half-typed town ("הרצל" for הרצליה) is also how a two-word street is written.
  const wholeName = place.loose ? name : '';
  const [debounced, setDebounced] = useState('');
  const [debouncedWhole, setDebouncedWhole] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(streetName), 200);
    return () => window.clearTimeout(timer);
  }, [streetName]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedWhole(wholeName), 200);
    return () => window.clearTimeout(timer);
  }, [wholeName]);

  const inCity = useQuery({
    queryKey: qk.listings.streets(chosen, debounced),
    queryFn: () => fetchStreetsIn(chosen, debounced),
    enabled: chosen.length > 1,
    staleTime: 5 * 60_000,
  });

  const anywhere = useQuery({
    queryKey: qk.listings.addressSuggestions(debounced, place.separated ? place.city : ''),
    queryFn: () => fetchAddressSuggestions(debounced, place.separated ? place.city : ''),
    enabled: chosen.length <= 1 && debounced.length >= 2,
    staleTime: 5 * 60_000,
  });

  const asWritten = useQuery({
    queryKey: qk.listings.addressSuggestions(debouncedWhole, ''),
    queryFn: () => fetchAddressSuggestions(debouncedWhole),
    enabled: debouncedWhole.length >= 2,
    staleTime: 5 * 60_000,
  });

  // The number stays on the label, so the list reads as the address being typed.
  // A bare street that is already the whole field is not a suggestion.
  const options =
    chosen.length > 1
      ? (inCity.data ?? []).flatMap((street) => {
          const label = houseShown ? `${street} ${houseShown}` : street;
          if (!houseShown && label === value.trim()) return [];
          return [label];
        })
      : [...(anywhere.data ?? []), ...(asWritten.data ?? [])].flatMap((row, index, all) => {
          const road = houseShown ? `${row.street} ${houseShown}` : row.street;
          const label = `${road}, ${row.city}`;
          const first = all.findIndex((item) => item.street === row.street && item.city === row.city);
          return first === index ? [label] : [];
        });

  return (
    <SuggestBox
      id={id}
      value={value}
      onChange={onChange}
      onPick={(picked) => {
        const parts = pickedAddress(picked);
        onChange(parts.street);
        if (parts.house) onHouseNumber?.(parts.house);
        if (parts.city) onCity?.(parts.city);
      }}
      options={options}
      term={debounced}
      submits
      placeholder="רחוב"
    />
  );
}
