import { describe, expect, it } from 'vitest';
import { alreadySaved } from './savedSearch';
import type { SavedSearch } from '@/services/searches';
import { EMPTY_FILTERS, type SearchFilters } from '@/types/search';

const filters = (over: Partial<SearchFilters>): SearchFilters => ({ ...EMPTY_FILTERS, ...over });

const saved = (over: Partial<SavedSearch>): SavedSearch => ({
  id: 's1',
  name: 'שמור',
  // `forsale` rather than null: the search page always has a section, so anything
  // saved from it has one too, and a fixture without one tests nothing real.
  section: 'forsale',
  cities: [],
  propertyTypes: [],
  minRooms: null,
  maxRooms: null,
  minPrice: null,
  maxPrice: null,
  minSquareMeter: null,
  alert: true,
  lastAlertAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  ...over,
});

describe('alreadySaved', () => {
  it('finds the search that matches what is on screen', () => {
    const current = filters({ section: 'forsale', city: ['חולון'], minRooms: 4 });
    const list = [saved({ section: 'forsale', cities: ['חולון'], minRooms: 4 })];

    expect(alreadySaved(current, list)?.id).toBe('s1');
  });

  it('does not care what order the cities were picked in', () => {
    const current = filters({ city: ['בת ים', 'חולון'] });
    const list = [saved({ cities: ['חולון', 'בת ים'] })];

    expect(alreadySaved(current, list)).toBeDefined();
  });

  it('treats an unset filter and a null column as the same thing', () => {
    // The bar says undefined where the database says null; comparing them raw would
    // report "not saved" for a search that is, and the person saves it twice.
    expect(alreadySaved(filters({ city: ['חולון'] }), [saved({ cities: ['חולון'] })])).toBeDefined();
  });

  it('is not fooled by a different price ceiling', () => {
    const current = filters({ city: ['חולון'], maxPrice: 2_000_000 });
    const list = [saved({ cities: ['חולון'], maxPrice: 2_500_000 })];

    expect(alreadySaved(current, list)).toBeUndefined();
  });

  it('is not fooled by an extra city', () => {
    const current = filters({ city: ['חולון'] });
    const list = [saved({ cities: ['חולון', 'בת ים'] })];

    expect(alreadySaved(current, list)).toBeUndefined();
  });

  it('ignores filters an alert cannot carry', () => {
    // Free text is dropped when saving, so a search with it is still "already saved".
    const current = filters({ city: ['חולון'], q: 'מרפסת' });
    expect(alreadySaved(current, [saved({ cities: ['חולון'] })])).toBeDefined();
  });

  it('has nothing to find before the list has loaded', () => {
    expect(alreadySaved(filters({ city: ['חולון'] }), undefined)).toBeUndefined();
  });
});
