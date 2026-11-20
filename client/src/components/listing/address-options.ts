import { ISRAELI_CITIES } from '@/data/cities';
import { splitPlace } from '@/lib/address-line';

export const ADDRESS_LIMIT = 8;

export interface AddressHit {
  street: string;
  city: string;
}

/**
 * The lines under one address field.
 *
 * A town comes first while the line is still a town. A street is offered with its
 * town, and a house number already typed stays on the suggestion. Word order is
 * settled by the server: `ישראל נג׳ארה` and `נג׳ארה ישראל` are the same street.
 */
export function addressOptions(
  line: string,
  cities: readonly string[],
  streetsInCity: readonly string[],
  anywhere: readonly AddressHit[],
  asWritten: readonly AddressHit[],
): string[] {
  const { street, house, city: cityTerm, separated } = splitPlace(line);
  const knownCity = (cities as readonly string[]).includes(cityTerm) ? cityTerm : '';

  const cityOptions = cityChoices(cityTerm, separated, cities);
  const fromStreets = streetsInCity
    .filter((name) => name !== street)
    .map((name) => `${house ? `${name} ${house}` : name}, ${knownCity}`);
  const fromAnywhere = anywhere.map((row) => lineOf(row.street, house, row.city));

  if (!separated && knownCity) return fromStreets.slice(0, ADDRESS_LIMIT);
  if (!separated) {
    const towns = cityOptions.slice(0, 4);
    const roads = fromAnywhere.filter((option) => !towns.includes(option));
    return [...towns, ...roads].filter((option) => option !== line.trim()).slice(0, ADDRESS_LIMIT);
  }

  const head = house ? `${street} ${house}` : street;
  const fromCities = cityOptions.map((city) => (head ? `${head}, ${city}` : city));
  const fromWritten = asWritten.map((row) => lineOf(row.street, house, row.city));
  return [...fromAnywhere, ...fromStreets, ...fromCities, ...fromWritten]
    .filter((option, index, all) => option !== line.trim() && all.indexOf(option) === index)
    .slice(0, ADDRESS_LIMIT);
}

/** What the street register should be asked, and what to bold in the list. */
export function addressLookup(line: string, cities: readonly string[] = ISRAELI_CITIES) {
  const parts = splitPlace(line);
  const knownCity = (cities as readonly string[]).includes(parts.city) ? parts.city : '';
  const streetQuery = parts.separated || parts.house !== '' ? parts.street : knownCity ? '' : parts.city;
  const looseQuery = parts.loose ? line.trim() : '';
  const term = parts.separated ? parts.street || parts.city : parts.city;
  return { ...parts, knownCity, streetQuery, looseQuery, term };
}

function lineOf(street: string, house: string, city: string): string {
  const road = house ? `${street} ${house}` : street;
  return `${road}, ${city}`;
}

function cityChoices(term: string, separated: boolean, cities: readonly string[]): string[] {
  if (term === '') return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const city of cities) {
    if (!separated && city === term) continue;
    if (city.startsWith(term)) starts.push(city);
    else if (city.includes(term)) contains.push(city);
    if (starts.length >= ADDRESS_LIMIT) break;
  }
  return [...starts, ...contains].slice(0, ADDRESS_LIMIT);
}
