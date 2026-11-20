import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ISRAELI_CITIES } from '@/data/cities';
import { qk } from '@/queries/keys';
import { fetchAddressSuggestions, fetchStreetsIn } from '@/services/search';
import { addressLookup, addressOptions } from './address-options';
import { SuggestBox } from './SuggestBox';

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Chat styling. The suggestions themselves are the same list either way. */
  tone?: 'app' | 'chat';
}

/**
 * One address line: street, house number and town, with the register's suggestions.
 *
 * The same list the listing address uses. A street is found with its words in either
 * order, and a number typed after it stays on the suggestion instead of hiding the street.
 */
export function AddressBox({ id, value, onChange, placeholder = 'רחוב ומספר, עיר', disabled = false, tone = 'app' }: Props) {
  const lookup = addressLookup(value);
  const [streetQuery, setStreetQuery] = useState('');
  const [looseQuery, setLooseQuery] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setStreetQuery(lookup.streetQuery), 200);
    return () => window.clearTimeout(timer);
  }, [lookup.streetQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => setLooseQuery(lookup.looseQuery), 200);
    return () => window.clearTimeout(timer);
  }, [lookup.looseQuery]);

  const streets = useQuery({
    queryKey: qk.listings.streets(lookup.knownCity, lookup.separated ? streetQuery : ''),
    queryFn: () => fetchStreetsIn(lookup.knownCity, lookup.separated ? streetQuery : ''),
    enabled: lookup.knownCity !== '' && (!lookup.separated || streetQuery !== ''),
    staleTime: 5 * 60_000,
  });

  const anywhere = useQuery({
    queryKey: qk.listings.addressSuggestions(streetQuery, lookup.separated ? lookup.city : ''),
    queryFn: () => fetchAddressSuggestions(streetQuery, lookup.separated ? lookup.city : ''),
    enabled: streetQuery.length >= 2 && lookup.knownCity === '',
    staleTime: 5 * 60_000,
  });

  const asWritten = useQuery({
    queryKey: qk.listings.addressSuggestions(looseQuery, ''),
    queryFn: () => fetchAddressSuggestions(looseQuery),
    enabled: looseQuery.length >= 2,
    staleTime: 5 * 60_000,
  });

  const options = addressOptions(value, ISRAELI_CITIES, streets.data ?? [], anywhere.data ?? [], asWritten.data ?? []);

  return (
    <SuggestBox
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      term={lookup.term}
      placeholder={placeholder}
      disabled={disabled}
      floatMenu
      inputClassName={tone === 'chat' ? 'u365-address-input' : undefined}
    />
  );
}
