import { describe, expect, it } from 'vitest';
import { moveDeal, stageOf } from './dealBoard';
import type { Deal, DealBoard, DealStage } from '@/services/crm';

const deal = (id: string, stage: DealStage, price: number | null = 1_000_000): Deal =>
  ({
    id,
    title: `עסקה ${id}`,
    stage,
    price,
    commission: price === null ? null : price * 0.02,
    expectedCloseAt: null,
    closedAt: null,
    lostReason: null,
    notes: null,
    leadId: null,
    listingId: null,
    customerId: null,
    lead: null,
    customer: null,
    listing: null,
    owner: null,
  }) as Deal;

function board(...deals: Deal[]): DealBoard {
  const columns = {
    qualified: [],
    negotiation: [],
    under_contract: [],
    closed_won: [],
    closed_lost: [],
  } as DealBoard['columns'];
  const totals = {} as DealBoard['totals'];

  for (const d of deals) columns[d.stage].push(d);
  for (const stage of Object.keys(columns) as DealStage[]) {
    totals[stage] = {
      count: columns[stage].length,
      value: columns[stage].reduce((s, d) => s + (d.price ?? 0), 0),
      commission: columns[stage].reduce((s, d) => s + (d.commission ?? 0), 0),
    };
  }

  return { columns, totals };
}

describe('moveDeal', () => {
  it('takes the card out of one column and puts it in another', () => {
    const next = moveDeal(board(deal('a', 'qualified')), 'a', 'negotiation');

    expect(next.columns.qualified).toHaveLength(0);
    expect(next.columns.negotiation.map((d) => d.id)).toEqual(['a']);
  });

  it('gives the card its new stage, so the dropdown on it agrees', () => {
    const next = moveDeal(board(deal('a', 'qualified')), 'a', 'closed_won');

    expect(next.columns.closed_won[0].stage).toBe('closed_won');
  });

  it('puts it at the top, where the board puts the newest', () => {
    const before = board(deal('a', 'qualified'), deal('b', 'negotiation'));
    const next = moveDeal(before, 'a', 'negotiation');

    expect(next.columns.negotiation.map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('moves the money with it', () => {
    const next = moveDeal(board(deal('a', 'qualified', 2_000_000)), 'a', 'closed_won');

    expect(next.totals.qualified).toEqual({ count: 0, value: 0, commission: 0 });
    expect(next.totals.closed_won).toMatchObject({ count: 1, value: 2_000_000 });
  });

  it('counts a deal with no price without inventing one', () => {
    const next = moveDeal(board(deal('a', 'qualified', null)), 'a', 'negotiation');

    expect(next.totals.negotiation).toEqual({ count: 1, value: 0, commission: 0 });
  });

  it('is the same board when the card is dropped where it already is', () => {
    const before = board(deal('a', 'qualified'));

    expect(moveDeal(before, 'a', 'qualified')).toBe(before);
  });

  it('is the same board when it does not hold that deal', () => {
    const before = board(deal('a', 'qualified'));

    expect(moveDeal(before, 'nope', 'negotiation')).toBe(before);
  });

  it('leaves the columns it did not touch alone', () => {
    const before = board(deal('a', 'qualified'), deal('b', 'under_contract'));
    const next = moveDeal(before, 'a', 'negotiation');

    expect(next.columns.under_contract).toBe(before.columns.under_contract);
  });
});

describe('stageOf', () => {
  it('finds the column a deal sits in', () => {
    expect(stageOf(board(deal('a', 'under_contract')), 'a')).toBe('under_contract');
  });

  it('is null for a deal the board does not hold', () => {
    expect(stageOf(board(), 'a')).toBeNull();
  });
});
