import { describe, expect, it } from 'vitest';

import { HISTORY_SALES_LIMIT, presentHistory, type FoundHistory } from './market-history.js';

const deal = (date: string, amount: number, area: number): FoundHistory['deals'][number] => ({
  dealDate: new Date(`${date}T00:00:00Z`),
  amount,
  rooms: 4,
  area,
  pricePerSqm: Math.round(amount / area),
  nature: 'דירה בבית משותף',
});

const history = (deals: FoundHistory['deals']): FoundHistory => ({
  city: 'חולון',
  street: 'סוקולוב',
  years: 10,
  deals,
  truncated: false,
  asking: { count: 2, median: 2_400_000, perSqm: 28_000 },
});

describe('presentHistory', () => {
  it('groups sales by year, newest first, and lists the latest ones', () => {
    const view = presentHistory(
      history([
        deal('2023-03-01', 1_800_000, 90),
        deal('2024-06-01', 2_200_000, 100),
        deal('2024-01-15', 2_000_000, 95),
      ]),
    );

    expect(view.city).toBe('חולון');
    expect(view.street).toBe('סוקולוב');
    expect(view.total).toBe(3);
    expect(view.byYear.map((year) => year.year)).toEqual([2024, 2023]);
    expect(view.byYear[0]).toMatchObject({ count: 2, median: 2_100_000 });
    expect(view.sales.map((sale) => sale.date)).toEqual(['2024-06-01', '2024-01-15', '2023-03-01']);
    expect(view.sales[0]?.nature).toBe('דירה בבית משותף');
    expect(view.asking?.median).toBe(2_400_000);
  });

  it('keeps every year on the chart when the table is one year', () => {
    const view = presentHistory(
      history([deal('2024-06-01', 2_200_000, 100), deal('2019-04-01', 1_400_000, 90)]),
      2019,
    );

    expect(view.byYear.map((year) => year.year)).toEqual([2024, 2019]);
    expect(view.sales.map((sale) => sale.date)).toEqual(['2019-04-01']);
    expect(view.salesTotal).toBe(1);
    expect(view.total).toBe(2);
  });

  it('caps the table and says how many sales it was cut from', () => {
    const deals = Array.from({ length: HISTORY_SALES_LIMIT + 5 }, (_, index) =>
      deal(`2024-06-${String((index % 28) + 1).padStart(2, '0')}`, 1_000_000 + index, 80),
    );

    const view = presentHistory(history(deals));

    expect(view.sales).toHaveLength(HISTORY_SALES_LIMIT);
    expect(view.salesTotal).toBe(HISTORY_SALES_LIMIT + 5);
    expect(view.total).toBe(HISTORY_SALES_LIMIT + 5);
  });
});
