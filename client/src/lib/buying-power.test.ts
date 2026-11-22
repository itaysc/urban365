import { describe, expect, it } from 'vitest';
import {
  clearBuyingPower,
  loadBuyingPower,
  quoteListing,
  storeBuyingPower,
  type BuyingPower,
} from './buying-power';
import { defaultMix, lawyerEstimate, monthlyPayment, purchaseTax } from './mortgage';

function memory(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function power(over: Partial<BuyingPower> = {}): BuyingPower {
  return {
    buyer: 'first',
    equity: 500_000,
    income: 25_000,
    incomeKnown: true,
    commitments: 0,
    chosenMonthly: null,
    annualRate: 5,
    years: 25,
    shaped: false,
    parts: [],
    price: 2_000_000,
    ...over,
  };
}

describe('purchase tax', () => {
  it('charges nothing under the single-apartment exemption', () => {
    expect(purchaseTax(1_978_745, 'first')).toBe(0);
  });

  it('matches the tax authority example of 2,200,000 on a single apartment', () => {
    // (2,200,000 − 1,978,745) × 3.5% = 7,744. Published with הוראת ביצוע 1/2026.
    expect(purchaseTax(2_200_000, 'first')).toBe(7_744);
    expect(purchaseTax(2_200_000, 'upgrader')).toBe(7_744);
  });

  it('charges an additional apartment from the first shekel', () => {
    expect(purchaseTax(1_000_000, 'investor')).toBe(80_000);
  });
});

describe('lawyer estimate', () => {
  it('is half a percent plus VAT, and not below the floor', () => {
    expect(lawyerEstimate(2_000_000)).toBe(11_800);
    expect(lawyerEstimate(500_000)).toBe(5_900);
  });
});

describe('quoteListing', () => {
  it('prices a flat the bank would finance and leaves it unmarked', () => {
    const quote = quoteListing(power(), 1_600_000);

    expect(quote.equityRequired).toBe(400_000);
    expect(quote.monthly).toBe(Math.round(monthlyPayment(1_100_000, 5, 25)));
    expect(quote.purchaseTax).toBe(0);
    expect(quote.lawyer).toBe(9_440);
    expect(quote.marks).toEqual([]);
  });

  it('marks a short deposit, and does not also mark the tax', () => {
    const quote = quoteListing(power(), 2_500_000);
    expect(quote.marks).toContain('equity');
    expect(quote.marks).not.toContain('cash');
  });

  it('marks a repayment the income cap will not carry', () => {
    const quote = quoteListing(power({ income: 8_000 }), 1_600_000);
    expect(quote.ceiling).toBe(3_200);
    expect(quote.marks).toEqual(['income']);
  });

  it('marks tax and lawyer as missing equity once the bank is already satisfied', () => {
    const quote = quoteListing(power({ equity: 400_000, incomeKnown: false }), 1_600_000);
    expect(quote.marks).toEqual(['equity', 'cash']);
    expect(quote.equityShortfall).toBe(0);
    expect(quote.ceiling).toBeNull();
  });

  it('does not treat the untouched income field as a salary', () => {
    const quote = quoteListing(power({ income: 25_000, incomeKnown: false }), 1_600_000);
    expect(quote.marks).not.toContain('income');
  });

  it('prices a shaped mix instead of the single rate', () => {
    const parts = defaultMix(900_000, 25);
    const quote = quoteListing(power({ shaped: true, parts }), 1_600_000);
    expect(quote.monthly).not.toBe(Math.round(monthlyPayment(1_100_000, 5, 25)));
  });

  it('charges nothing a month when they can pay cash', () => {
    const quote = quoteListing(power({ equity: 2_000_000 }), 1_600_000);
    expect(quote.monthly).toBe(0);
    expect(quote.marks).not.toContain('equity');
  });
});

describe('buying power in storage', () => {
  it('round-trips, and ignores a store it cannot read', () => {
    const box = memory();
    const saved = power({ shaped: true, parts: defaultMix(1_000_000, 25) });
    storeBuyingPower(saved, box);
    expect(loadBuyingPower(box)).toEqual(saved);

    box.setItem('urban365.buyingPower', '{');
    expect(loadBuyingPower(box)).toBeNull();

    box.setItem('urban365.buyingPower', JSON.stringify({ buyer: 'oleh' }));
    expect(loadBuyingPower(box)).toBeNull();

    clearBuyingPower(box);
    expect(loadBuyingPower(box)).toBeNull();
  });
});
