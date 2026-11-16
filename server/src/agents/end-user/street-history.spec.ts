import { pickStreet, streetHistorySummary, streetQueryName } from './street-history.js';

describe('street price history', () => {
  it('drops the word street and a house number', () => {
    expect(streetQueryName('רחוב ויצמן 15')).toBe('ויצמן');
    expect(streetQueryName('שדרות הרצל')).toBe('הרצל');
  });

  it('keeps the street that was named when a square shares the name', () => {
    expect(pickStreet('ויצמן', ['ויצמן', 'ככר ויצמן'])).toEqual({ name: 'ויצמן' });
    expect(pickStreet('ויצ', ['ויצמן', 'ככר ויצמן'])).toEqual({ choices: ['ויצמן', 'ככר ויצמן'] });
  });

  it('summarises recorded sales by year and says they are near the street', () => {
    const summary = streetHistorySummary({
      city: 'חולון',
      street: 'ויצמן',
      years: 10,
      truncated: false,
      deals: [
        { dealDate: new Date('2024-03-01T00:00:00Z'), amount: 2_000_000, rooms: 4, area: 100, pricePerSqm: 20_000 },
        { dealDate: new Date('2024-06-01T00:00:00Z'), amount: 1_800_000, rooms: 3, area: 80, pricePerSqm: 22_500 },
        { dealDate: new Date('2023-01-15T00:00:00Z'), amount: 1_500_000, rooms: 3, area: 75, pricePerSqm: 20_000 },
      ],
    });

    expect(summary).toContain('בטווח 300 מטר מרחוב ויצמן, חולון');
    expect(summary).toContain('למרשם אין שם רחוב');
    expect(summary).toContain('2024: 2 עסקאות, חציון 1,900,000 ₪');
    expect(summary).toContain('2023: עסקה אחת, חציון 1,500,000 ₪');
    expect(summary).toContain('2024-06-01 | 3 חד\' | 80 מ"ר');
  });

  it('says so when nothing was recorded nearby', () => {
    const summary = streetHistorySummary({
      city: 'חולון',
      street: 'ויצמן',
      years: 10,
      truncated: false,
      deals: [],
    });
    expect(summary).toContain('לא נמצאו עסקאות מגורים');
  });
});
