import {
  listingOnStreet,
  pickStreet,
  rankStreets,
  streetHistoryCard,
  streetHistorySummary,
  streetQueryName,
} from './street-history.js';

describe('street price history', () => {
  it('drops a house number', () => {
    expect(streetQueryName('רחוב ויצמן 15')).toBe('רחוב ויצמן');
    expect(streetQueryName('ישראל נג׳ארה 9')).toBe('ישראל נג׳ארה');
    expect(streetQueryName("ישראל נג'ארה, 9")).toBe("ישראל נג'ארה");
  });

  it('finds the street when a house number is part of the address', () => {
    const register = ["נג'ארה ישראל", 'ברזילי ישראל'];
    expect(pickStreet('ישראל נג׳ארה 9', register)).toEqual({ name: "נג'ארה ישראל" });
    expect(pickStreet("ישראל נג'ארה 9א", register)).toEqual({ name: "נג'ארה ישראל" });
    expect(pickStreet('ישראל 9 נג׳ארה', register)).toEqual({ name: "נג'ארה ישראל" });
    expect(rankStreets('ישראל נג׳ארה 9', register.map((name) => ({ name }))).map((row) => row.name)[0]).toBe(
      "נג'ארה ישראל",
    );
    expect(listingOnStreet('ישראל נג׳ארה 9', "נג'ארה ישראל")).toBe(true);
  });

  it('keeps the street that was named when a square shares the name', () => {
    expect(pickStreet('ויצמן', ['ויצמן', 'ככר ויצמן'])).toEqual({ name: 'ויצמן' });
    expect(pickStreet('ויצ', ['ויצמן', 'ככר ויצמן'])).toEqual({ choices: ['ויצמן', 'ככר ויצמן'] });
  });

  it('recognises a boulevard said the way people say it', () => {
    const register = ['שד הוז דב', 'ויצמן', "נג'ארה ישראל"];
    expect(pickStreet('דב הוז', register)).toEqual({ name: 'שד הוז דב' });
    expect(pickStreet("שד' דב הוז", register)).toEqual({ name: 'שד הוז דב' });
    expect(pickStreet('שד׳ דב הוז', register)).toEqual({ name: 'שד הוז דב' });
    expect(pickStreet("ישראל נג'ארה", register)).toEqual({ name: "נג'ארה ישראל" });
    expect(pickStreet('נג׳ארה', register)).toEqual({ name: "נג'ארה ישראל" });
  });

  it('offers a surname-first street first when the words were typed the other way', () => {
    const rows = [
      { name: 'ברזילי ישראל' },
      { name: "נג'ארה ישראל" },
      { name: 'ויצמן' },
      { name: 'דרך הרצליה' },
      { name: 'הרצל' },
    ];
    expect(rankStreets("ישראל נג'ארה", rows).map((row) => row.name)[0]).toBe("נג'ארה ישראל");
    expect(rankStreets('נג׳ארה', rows).map((row) => row.name)[0]).toBe("נג'ארה ישראל");
    expect(rankStreets('דב הוז', [{ name: 'שד הוז דב' }, { name: 'ויצמן' }]).map((row) => row.name)).toEqual([
      'שד הוז דב',
    ]);
    expect(rankStreets('הרצ', rows).map((row) => row.name)).toEqual(['הרצל', 'דרך הרצליה']);
    expect(rankStreets('ויצמן', [{ name: 'ככר ויצמן' }, { name: 'ויצמן' }]).map((row) => row.name)).toEqual([
      'ויצמן',
      'ככר ויצמן',
    ]);
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
    expect(summary).toContain('01/06/2024 | 3 חד\' | 80 מ"ר');
  });

  it('builds a chart of yearly medians and keeps sale dates as calendar days', () => {
    const card = streetHistoryCard({
      city: 'חולון',
      street: 'ויצמן',
      deals: [
        { dealDate: new Date('2024-03-01T00:00:00Z'), amount: 2_000_000, rooms: 4, area: 100, pricePerSqm: 20_000 },
        { dealDate: new Date('2024-06-01T00:00:00Z'), amount: 1_800_000, rooms: 3, area: 80, pricePerSqm: 22_500 },
        { dealDate: new Date('2023-01-15T00:00:00Z'), amount: 1_500_000, rooms: 3, area: 75, pricePerSqm: 20_000 },
      ],
    });

    expect(card?.years.map((year) => year.year)).toEqual([2024, 2023]);
    expect(card?.years[0]).toMatchObject({ count: 2, median: 1_900_000 });
    expect(card?.recent[0]?.date).toBe('2024-06-01');
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
    expect(summary).toContain('אין כרגע מודעה עם מחיר ברחוב');
  });

  it('treats a listing written surname-last as the same street', () => {
    expect(listingOnStreet('צבי שיץ', 'שיץ צבי')).toBe(true);
    expect(listingOnStreet("שד' דב הוז", 'שד הוז דב')).toBe(true);
    expect(listingOnStreet('ויצמן', 'ככר ויצמן')).toBe(false);
  });

  it('reports current asking prices next to the yearly sales, including when nothing is for sale', () => {
    const summary = streetHistorySummary({
      city: 'חולון',
      street: 'שיץ צבי',
      years: 10,
      truncated: false,
      rooms: 4,
      asking: { count: 2, median: 1_700_000, perSqm: 21_000 },
      deals: [
        { dealDate: new Date('2024-06-01T00:00:00Z'), amount: 1_800_000, rooms: 4, area: 90, pricePerSqm: 20_000 },
      ],
    });

    expect(summary).toContain('המספרים הם לדירות 4 חדרים');
    expect(summary).toContain('2024: עסקה אחת, חציון 1,800,000 ₪');
    expect(summary).toContain('מודעות שמוצגות עכשיו לדירת 4 חדרים ברחוב: 2 מודעות, חציון 1,700,000 ₪');

    const card = streetHistoryCard({
      city: 'חולון',
      street: 'שיץ צבי',
      rooms: 4,
      asking: { count: 2, median: 1_700_000, perSqm: 21_000 },
      deals: [
        { dealDate: new Date('2024-06-01T00:00:00Z'), amount: 1_800_000, rooms: 4, area: 90, pricePerSqm: 20_000 },
      ],
    });
    expect(card?.rooms).toBe(4);
    expect(card?.asking).toMatchObject({ count: 2, median: 1_700_000 });
    expect(card?.years[0]).toMatchObject({ year: 2024, median: 1_800_000 });
  });

  it('still draws the current ads when no sale was recorded', () => {
    const card = streetHistoryCard({
      city: 'חולון',
      street: 'שיץ צבי',
      rooms: 4,
      asking: { count: 1, median: 1_600_000, perSqm: null },
      deals: [],
    });
    expect(card?.years).toEqual([]);
    expect(card?.asking?.count).toBe(1);

    const summary = streetHistorySummary({
      city: 'חולון',
      street: 'שיץ צבי',
      years: 10,
      truncated: false,
      rooms: 4,
      deals: [],
    });
    expect(summary).toContain('אין כרגע מודעה עם מחיר לדירת 4 חדרים ברחוב');
  });
});
