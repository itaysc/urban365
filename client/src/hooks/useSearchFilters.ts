import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isSection } from '@/lib/yad2Input';
import { EMPTY_FILTERS, SORTS, type SearchFilters, type Sort } from '@/types/search';

const num = (v: string | null): number | undefined => {
  if (v === null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const list = (v: string | null): string[] => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

/**
 * Filters live in the query string, so a search is shareable, survives a reload and
 * works with the back button — the same approach as the listing modal.
 */
export function useSearchFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<SearchFilters>(() => {
    const section = params.get('section');
    const sort = params.get('sort');

    return {
      section: isSection(section) ? section : EMPTY_FILTERS.section,
      agencyId: params.get('agencyId') ?? undefined,
      city: list(params.get('city')),
      neighborhood: list(params.get('neighborhood')),
      district: list(params.get('district')),
      propertyType: list(params.get('propertyType')),
      amenities: list(params.get('amenities')),
      minPrice: num(params.get('minPrice')),
      maxPrice: num(params.get('maxPrice')),
      minPricePerSqm: num(params.get('minPricePerSqm')),
      maxPricePerSqm: num(params.get('maxPricePerSqm')),
      minRooms: num(params.get('minRooms')),
      maxRooms: num(params.get('maxRooms')),
      minSquareMeter: num(params.get('minSquareMeter')),
      maxSquareMeter: num(params.get('maxSquareMeter')),
      q: params.get('q') ?? undefined,
      // Only ever true or absent — see the note on the DTO. A `false` in the URL would
      // be a third state meaning the same as none.
      isNew: params.get('isNew') === 'true' ? true : undefined,
      sort: SORTS.includes(sort as Sort) ? (sort as Sort) : EMPTY_FILTERS.sort,
      page: num(params.get('page')) ?? 1,
    };
  }, [params]);

  /** Any change other than the page itself sends you back to page one. */
  const update = useCallback(
    (patch: Partial<SearchFilters>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);

          for (const [key, value] of Object.entries(patch)) {
            const empty =
              value === undefined ||
              value === '' ||
              (Array.isArray(value) && value.length === 0) ||
              (key === 'page' && value === 1);

            if (empty) next.delete(key);
            else next.set(key, Array.isArray(value) ? value.join(',') : String(value));
          }

          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setParams],
  );

  const toggle = useCallback(
    (key: 'city' | 'neighborhood' | 'district' | 'propertyType' | 'amenities', value: string) => {
      const current = filters[key];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      update({ [key]: next } as Partial<SearchFilters>);
    },
    [filters, update],
  );

  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  const activeCount =
    filters.city.length +
    filters.neighborhood.length +
    filters.district.length +
    filters.propertyType.length +
    filters.amenities.length +
    [
      filters.minPrice,
      filters.maxPrice,
      filters.minPricePerSqm,
      filters.maxPricePerSqm,
      filters.minRooms,
      filters.maxRooms,
      filters.minSquareMeter,
      filters.maxSquareMeter,
      filters.q,
      filters.isNew,
    ]
      .filter((v) => v !== undefined && v !== '').length;

  return { filters, update, toggle, reset, activeCount };
}
