import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SuggestBox } from '@/components/listing/SuggestBox';
import { qk } from '@/queries/keys';
import { fetchStreetsIn } from '@/services/search';

interface Props {
  /** The city chosen on the form. A street name means nothing without one. */
  city: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
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
 */
export function StreetBox({ city, value, onChange, id = 'street' }: Props) {
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [value]);

  const { data } = useQuery({
    queryKey: qk.listings.streets(city.trim(), debounced),
    queryFn: () => fetchStreetsIn(city.trim(), debounced),
    enabled: city.trim().length > 1,
    staleTime: 5 * 60_000,
  });

  // Anything already typed in full is not a suggestion, it is what is in the box.
  const options = (data ?? []).filter((name) => name !== value.trim());

  return (
    <SuggestBox
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      term={debounced}
      placeholder={city.trim() ? 'רחוב' : 'קודם בחרו עיר'}
    />
  );
}
