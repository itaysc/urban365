import { describe, expect, it } from 'vitest';
import { affordBlock, buyingNote } from './city-affordability';
import { quoteListing, type BuyingPower } from './lib/buying-power';

const power = (over: Partial<BuyingPower> = {}): BuyingPower => ({
  buyer: 'first',
  equity: 400_000,
  income: 8_000,
  incomeKnown: true,
  commitments: 0,
  chosenMonthly: null,
  annualRate: 5,
  years: 25,
  shaped: false,
  parts: [],
  price: 1_600_000,
  ...over,
});

describe('city card marks', () => {
  it('says the payment and the rule the bank would refuse', () => {
    const html = affordBlock(quoteListing(power(), 2_500_000));

    expect(html).toContain('החזר');
    expect(html).toContain('חסר הון עצמי');
    expect(html).toContain('מס ועורך דין');
  });

  it('points the note at the budget tab', () => {
    expect(buyingNote(power())).toContain('href="/mortgage?tab=budget"');
    expect(buyingNote(power())).toContain('הסרה');
  });
});
