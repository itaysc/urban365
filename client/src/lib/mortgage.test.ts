import { describe, expect, it } from 'vitest';
import {
  budget,
  defaultMix,
  loanFor,
  LTV_CAP,
  mix,
  mixProblems,
  monthlyPayment,
  plan,
  rebalance,
  type MixPart,
} from './mortgage';

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

describe('mix', () => {
  const part = (over: Partial<MixPart> = {}): MixPart => ({
    key: 'fixed',
    amount: 500_000,
    annualRate: 5,
    years: 25,
    ...over,
  });

  it('is the parts priced separately and added', () => {
    // Which is what a bank does: three loans that happen to share a property.
    const parts = [part({ amount: 600_000 }), part({ key: 'prime', amount: 400_000 })];
    const expected =
      monthlyPayment(600_000, 5, 25) + monthlyPayment(400_000, 5, 25);

    expect(mix(parts).monthly).toBe(Math.round(expected));
    expect(mix(parts).amount).toBe(1_000_000);
  });

  it('prices a part on its own term, not a shared one', () => {
    // A short fixed track beside a long prime one is the usual shape, and averaging
    // the terms would quietly misprice both.
    const short = mix([part({ amount: 300_000, years: 10 })]);
    const long = mix([part({ amount: 300_000, years: 30 })]);

    expect(short.monthly).toBeGreaterThan(long.monthly);
    expect(short.totalInterest).toBeLessThan(long.totalInterest);
  });

  it('counts the variable share by rate, not by linkage', () => {
    // The distinction the rule turns on: a קבועה צמודה has a rate fixed for thirty
    // years and counts towards the fixed third, however much the index moves it.
    const summary = mix([
      part({ key: 'fixedLinked', amount: 500_000 }),
      part({ key: 'prime', amount: 500_000 }),
    ]);

    expect(summary.variableShare).toBeCloseTo(0.5, 10);
    expect(summary.linkedShare).toBeCloseTo(0.5, 10);
  });

  it('blends the rate by amount', () => {
    const summary = mix([
      part({ amount: 750_000, annualRate: 4 }),
      part({ key: 'prime', amount: 250_000, annualRate: 8 }),
    ]);

    expect(summary.weightedRate).toBeCloseTo(5, 10);
  });

  it('says nothing is variable when there is nothing at all', () => {
    const summary = mix([]);
    expect(summary.amount).toBe(0);
    expect(summary.variableShare).toBe(0);
    expect(summary.weightedRate).toBe(0);
  });
});

describe('mixProblems', () => {
  const fixed = (amount: number): MixPart => ({
    key: 'fixed',
    amount,
    annualRate: 5,
    years: 25,
  });
  const prime = (amount: number): MixPart => ({
    key: 'prime',
    amount,
    annualRate: 4.25,
    years: 25,
  });

  it('passes a mix that adds up and keeps a third fixed', () => {
    expect(mixProblems([fixed(400_000), prime(600_000)], 1_000_000)).toEqual([]);
  });

  it('allows exactly two thirds variable, which the 2020 amendment made legal', () => {
    // A third fixed and two thirds prime was forbidden until the prime sub-limit was
    // deleted. The cap is the published 66.66%, so two thirds sits just under it.
    const problems = mixProblems([fixed(1_000_000 / 3), prime((1_000_000 * 2) / 3)], 1_000_000);
    expect(problems).toEqual([]);
  });

  it('refuses a mix with more than two thirds variable', () => {
    const problems = mixProblems([fixed(200_000), prime(800_000)], 1_000_000);
    expect(problems).toContainEqual({ kind: 'variable-over-cap', share: 0.8 });
  });

  it('reports a mix that does not reach the loan', () => {
    expect(mixProblems([fixed(400_000)], 1_000_000)).toContainEqual({
      kind: 'short',
      by: 600_000,
    });
  });

  it('reports a mix that overshoots it', () => {
    expect(mixProblems([fixed(600_000), prime(600_000)], 1_000_000)).toContainEqual({
      kind: 'over',
      by: 200_000,
    });
  });

  it('ignores a shekel of rounding either way', () => {
    expect(mixProblems([fixed(999_999)], 1_000_000)).toEqual([]);
    expect(mixProblems([fixed(1_000_001)], 1_000_000)).toEqual([]);
  });

  it('puts the arithmetic first, because the share is of the wrong total until it adds up', () => {
    const problems = mixProblems([prime(400_000)], 1_000_000);
    expect(problems[0].kind).toBe('short');
    expect(problems[1].kind).toBe('variable-over-cap');
  });
});

describe('defaultMix', () => {
  it('adds up to the loan exactly, whatever the rounding', () => {
    for (const loan of [1_000_000, 1_000_001, 999_998, 1_750_000]) {
      const parts = defaultMix(loan, 25);
      expect(parts.reduce((sum, p) => sum + p.amount, 0)).toBe(loan);
    }
  });

  it('opens on a mix a bank would write', () => {
    expect(mixProblems(defaultMix(1_500_000, 25), 1_500_000)).toEqual([]);
  });
});

describe('rebalance', () => {
  const parts: MixPart[] = [
    { key: 'fixed', amount: 500_000, annualRate: 5, years: 25 },
    { key: 'prime', amount: 300_000, annualRate: 4.25, years: 25 },
    { key: 'variable5', amount: 200_000, annualRate: 4.6, years: 20 },
  ];

  it('hits the loan exactly, however the rounding falls', () => {
    for (const loan of [1_000_000, 1_234_567, 999_999, 777_777]) {
      const next = rebalance(parts, loan);
      expect(next.reduce((sum, p) => sum + p.amount, 0)).toBe(loan);
    }
  });

  it('keeps the shape the borrower chose', () => {
    const next = rebalance(parts, 2_000_000);
    expect(next.map((p) => p.amount)).toEqual([1_000_000, 600_000, 400_000]);
    // And nothing else about a part is touched.
    expect(next.map((p) => p.years)).toEqual([25, 25, 20]);
  });

  it('splits evenly when there is no shape to keep', () => {
    const empty: MixPart[] = parts.map((p) => ({ ...p, amount: 0 }));
    const next = rebalance(empty, 900_000);
    expect(next.map((p) => p.amount)).toEqual([300_000, 300_000, 300_000]);
  });

  it('leaves an empty mix alone', () => {
    expect(rebalance([], 1_000_000)).toEqual([]);
  });
});
