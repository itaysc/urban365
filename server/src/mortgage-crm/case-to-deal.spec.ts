import { describe, expect, it } from 'vitest';
import { dealFieldsFromCase } from './case-to-deal.js';

describe('what a signed mortgage case becomes on the deal board', () => {
  it('produces nothing for a case still open', () => {
    expect(
      dealFieldsFromCase({ stage: 'sent_to_banks', requestedAmount: 1_000_000, displayName: 'x' }),
    ).toBeNull();
  });

  it('produces nothing for a case marked lost', () => {
    expect(dealFieldsFromCase({ stage: 'lost', requestedAmount: 1_000_000, displayName: 'x' })).toBeNull();
  });

  it('closes won, carrying the requested amount as the price', () => {
    const deal = dealFieldsFromCase({
      stage: 'signed',
      requestedAmount: 1_800_000,
      displayName: 'אלירן — נתניה',
    });

    expect(deal).toEqual({
      stage: 'closed_won',
      title: 'אלירן — נתניה',
      price: 1_800_000,
      commission: null,
      closedAt: expect.any(Date),
    });
  });

  it('carries a null price rather than inventing one when the amount was never entered', () => {
    const deal = dealFieldsFromCase({ stage: 'signed', requestedAmount: null, displayName: 'x' });
    expect(deal?.price).toBeNull();
  });
});
