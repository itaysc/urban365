import { OTHER_REGION, primaryRegion, regionIndex, regionSort } from './public-region.js';

const regions = regionIndex([
  { name: 'דרום', memberCities: ['באר שבע', 'אילת'] },
  { name: 'תל אביב והסביבה', memberCities: ['תל אביב יפו', 'רמת גן'] },
  { name: 'מרכז והשרון', memberCities: ['הרצליה', 'רמת גן'] },
]);

describe('regionIndex', () => {
  it('keeps a city that sits in two districts with the earlier region', () => {
    expect(regions.get('רמת גן')).toBe('מרכז והשרון');
  });
});

describe('primaryRegion', () => {
  it('files an agency under the district that holds most of its listings', () => {
    expect(
      primaryRegion(
        [
          { city: 'באר שבע', count: 2 },
          { city: 'תל אביב יפו', count: 9 },
        ],
        ['באר שבע'],
        regions,
      ),
    ).toBe('תל אביב והסביבה');
  });

  it('uses the office when nothing is published', () => {
    expect(primaryRegion([], ['אילת'], regions)).toBe('דרום');
  });

  it('has a place for an agency we cannot locate', () => {
    expect(primaryRegion([], [], regions)).toBe(OTHER_REGION);
  });
});

describe('regionSort', () => {
  it('puts an unnamed region after the named ones', () => {
    expect(regionSort(OTHER_REGION, 'דרום')).toBeGreaterThan(0);
    expect(regionSort('תל אביב והסביבה', 'דרום')).toBeLessThan(0);
  });
});
