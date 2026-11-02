import { describe, expect, it } from 'vitest';
import { budget, loanFor, LTV_CAP, monthlyPayment, plan } from './mortgage';

describe('monthlyPayment', () => {
  it('matches the figure a bank quotes', () => {
    // A million shekels at 5% over 25 years is about 5,846 a month — the number every
    // published שפיצר table gives, which is the point of checking against it.
    expect(monthlyPayment(1_000_000, 5, 25)).toBeCloseTo(5846, 0);
  });

  it('splits the principal evenly when nothing is charged', () => {
    // Not a rounding case: at zero the formula is 0/0 and has to be answered directly.
    expect(monthlyPayment(240_000, 0, 20)).toBeCloseTo(1_000, 6);
  });

  it('is nothing to pay when there is nothing borrowed', () => {
    expect(monthlyPayment(0, 5, 25)).toBe(0);
    expect(monthlyPayment(-50_000, 5, 25)).toBe(0);
  });

  it('costs less each month over a longer term', () => {
    expect(monthlyPayment(1_000_000, 5, 30)).toBeLessThan(monthlyPayment(1_000_000, 5, 20));
  });
});

describe('loanFor', () => {
  it('inverts the payment exactly', () => {
    // The two directions are shown on the same page, so a buyer who reads one and then
    // the other must not find them disagreeing.
    const monthly = monthlyPayment(1_400_000, 4.6, 28);
    expect(loanFor(monthly, 4.6, 28)).toBeCloseTo(1_400_000, 4);
  });

  it('borrows nothing on nothing', () => {
    expect(loanFor(0, 5, 25)).toBe(0);
  });
});

describe('plan', () => {
  const first = { price: 2_000_000, equity: 500_000, annualRate: 5, years: 25, buyer: 'first' as const };

  it('borrows the rest of the price', () => {
    const result = plan(first);
    expect(result.loan).toBe(1_500_000);
    expect(result.ltv).toBeCloseTo(0.75, 10);
  });

  it('adds up', () => {
    const result = plan(first);
    expect(result.totalInterest).toBe(result.totalPaid - result.loan);
    expect(result.totalPaid).toBeGreaterThan(result.loan);
  });

  it('is within reach for a first home at a quarter down', () => {
    expect(plan(first).equityShortfall).toBe(0);
  });

  it('is short for an investor at the same price, who may only borrow half', () => {
    // The same flat, the same deposit, and a loan no bank would write: 50% of the
    // price is 1,000,000, so 500,000 of equity is 500,000 short.
    expect(plan({ ...first, buyer: 'investor' }).equityShortfall).toBe(500_000);
  });

  it('asks for nothing when the buyer pays cash', () => {
    const result = plan({ ...first, equity: 2_500_000 });
    expect(result.loan).toBe(0);
    expect(result.monthly).toBe(0);
    expect(result.equityShortfall).toBe(0);
  });
});

describe('budget', () => {
  const buyer = {
    income: 30_000,
    commitments: 0,
    equity: 1_000_000,
    annualRate: 5,
    years: 25,
    buyer: 'first' as const,
  };

  it('spends at most the share of income a bank allows', () => {
    expect(budget(buyer).ceiling).toBe(12_000);
  });

  it('counts what is already going out', () => {
    expect(budget({ ...buyer, commitments: 2_000 }).ceiling).toBe(10_000);
  });

  it('is held back by the deposit when it is the smaller of the two', () => {
    // A good salary and a thin deposit: 12,000 a month carries about 2.05M, so the
    // income alone would reach 2.35M — but a first home is financed to 75%, and
    // 300,000 down stops at 1.2M however much the household earns.
    const result = budget({ ...buyer, equity: 300_000 });
    expect(result.limitedBy).toBe('equity');
    expect(result.price).toBeCloseTo(300_000 / (1 - LTV_CAP.first), -2);

    // And the payment is the one on the flat they can actually buy, not the ceiling
    // their salary would have carried.
    expect(result.monthly).toBeLessThan(result.ceiling);
  });

  it('is held back by the income when the deposit is the larger', () => {
    const result = budget(buyer);
    expect(result.limitedBy).toBe('income');
    expect(result.price).toBe(1_000_000 + result.loan);
    expect(result.monthly).toBeCloseTo(result.ceiling, -1);
  });

  it('can only pay cash when the commitments swallow the income', () => {
    const result = budget({ ...buyer, commitments: 20_000 });
    expect(result.ceiling).toBe(0);
    expect(result.loan).toBe(0);
    expect(result.monthly).toBe(0);
    expect(result.price).toBe(1_000_000);
  });
});
