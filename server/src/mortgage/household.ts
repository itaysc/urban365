/**
 * What a household can actually sustain, as opposed to what a bank will approve.
 *
 * The two are different questions and the gap between them is where people get hurt.
 * A bank asks whether 40% of your income covers the repayment; it does not ask what
 * the other 60% already has to do. This file asks the second question.
 *
 * **Every shekel here is the household's own.** Nothing is estimated on their behalf
 * — no average family spend, no cost-per-child table, no inflation on the groceries.
 * Those numbers exist and they are all wrong for somebody: a figure this page invents
 * and then recommends a 30-year commitment from is worse than a blank field. What the
 * file does instead is arithmetic on what it is told, and it says out loud where it
 * stops knowing.
 */

export interface Outgoings {
  living: number;
  car: number;
  insurance: number;
  education: number;
  debts: number;
  other: number;
}

export const OUTGOING_LABELS: Record<keyof Outgoings, string> = {
  living: 'מזון וקניות הבית',
  car: 'רכב, דלק ותחבורה',
  insurance: 'ביטוחים',
  education: 'חינוך, מעון וחוגים',
  debts: 'הלוואות וכרטיסי אשראי — החזר חודשי',
  other: 'שאר ההוצאות הקבועות',
};

export const NO_OUTGOINGS: Outgoings = {
  living: 0,
  car: 0,
  insurance: 0,
  education: 0,
  debts: 0,
  other: 0,
};

export const totalOutgoings = (o: Outgoings): number =>
  Object.values(o).reduce((sum, value) => sum + value, 0);

/**
 * What stays out of the mortgage, as a share of net income.
 *
 * Not a savings plan — a shock absorber. A boiler, a gearbox, a month between jobs:
 * a household whose repayment eats the entire surplus has no answer to any of them
 * and reaches for the credit card, which is how a manageable mortgage becomes an
 * unmanageable one. Ten per cent is a convention, which is why the page lets it be
 * changed and says what it is rather than folding it invisibly into a total.
 */
export const DEFAULT_BUFFER_SHARE = 0.1;

/**
 * How much more expensive living here gets each year.
 *
 * The geometric mean of Israel's annual CPI inflation over the ten years 2016–2025,
 * from the World Bank's series (indicator FP.CPI.TOTL.ZG): −0.54, 0.25, 0.81, 0.82,
 * −0.58, 1.48, 4.41, 4.23, 3.07, 3.04. That compounds to 18.2% over the decade, or
 * 1.68% a year. Geometric rather than the arithmetic 1.70%, because this is applied
 * by compounding and the arithmetic mean of a compounding series overstates it.
 *
 * It is a real figure rather than a guess, which is why it is here at all — but it
 * is an average of an unusual decade, holding both two years of falling prices and
 * the 2022 spike. It is the opening value of a slider, not a forecast, and a
 * household that believes something else should say so.
 */
export const DEFAULT_COST_GROWTH = 1.7;

export interface Household {
  /** Net, monthly, everything that arrives. */
  netIncome: number;
  outgoings: Outgoings;
  /** Ages today, youngest to eldest or in any order. */
  childAges: number[];
  /** Years until another child is expected, or null when none is planned. */
  plannedChildIn: number | null;
  /** What the household expects another child to cost them each month. Theirs. */
  plannedChildCost: number;
  /** Expected annual pay rise, as a percentage. */
  salaryGrowth: number;
  /** How fast the outgoings grow each year, as a percentage. */
  costGrowth: number;
  /** The share of net income to keep out of the repayment. */
  bufferShare: number;
}

export interface Advice {
  outgoings: number;
  /** Income less everything already committed. */
  disposable: number;
  buffer: number;
  /** What is left for a mortgage once the buffer is set aside. Never below zero. */
  recommended: number;
}

export function advise(h: Household): Advice {
  const outgoings = totalOutgoings(h.outgoings);
  const disposable = h.netIncome - outgoings;
  const buffer = Math.max(0, h.netIncome * h.bufferShare);

  return {
    outgoings: Math.round(outgoings),
    disposable: Math.round(disposable),
    buffer: Math.round(buffer),
    // A household already spending more than it earns has nothing to recommend, and
    // a negative repayment is not advice.
    recommended: Math.max(0, Math.round(disposable - buffer)),
  };
}

/** Compound growth, which is what a yearly rise is. */
const grown = (amount: number, percent: number, years: number): number =>
  amount * (1 + percent / 100) ** years;

export interface Horizon {
  /** Years from now. */
  inYears: number;
  reason: 'now' | 'child' | 'growth';
  income: number;
  outgoings: number;
  /** Income less outgoings at that point. */
  disposable: number;
  /** What a repayment of this size would leave over, there. */
  spare: number;
}

/**
 * The same sum at the two or three moments when it changes.
 *
 * A mortgage is signed on today's payslip and paid out of twenty-five years of them,
 * and the question worth asking is not whether it fits now but whether it fits in the
 * year the household changes shape. Only the changes the household has actually named
 * are modelled: a child they are planning, and a rise they expect.
 *
 * Both sides move. The outgoings used to be held flat, which made every row
 * flattering in exactly the place people plan from: a salary growing at 3% against
 * groceries frozen at today's price turned a year-five surplus of 2,400 into 5,478.
 * They now compound at `costGrowth`, which opens on a decade of actual Israeli CPI
 * rather than on a number this file made up — and which the household can change,
 * including to zero if they want the old behaviour back.
 *
 * A planned child's cost is given in today's money and inflated to the year it
 * starts, like everything else.
 */
export function horizons(h: Household, repayment: number): Horizon[] {
  const base = totalOutgoings(h.outgoings);

  const at = (inYears: number, reason: Horizon['reason'], extra = 0): Horizon => {
    const income = grown(h.netIncome, h.salaryGrowth, inYears);
    const outgoings = grown(base + extra, h.costGrowth, inYears);
    const disposable = income - outgoings;

    return {
      inYears,
      reason,
      income: Math.round(income),
      outgoings: Math.round(outgoings),
      disposable: Math.round(disposable),
      spare: Math.round(disposable - repayment),
    };
  };

  const rows = [at(0, 'now')];

  if (h.plannedChildIn !== null) {
    rows.push(at(h.plannedChildIn, 'child', h.plannedChildCost));
  }

  /*
   * A rise is only worth a row of its own once it has had time to amount to
   * something, and only if it lands after the child — otherwise it repeats a row the
   * reader has already seen, with a smaller number.
   */
  const RISE_AFTER = 5;
  if (h.salaryGrowth > 0 && (h.plannedChildIn === null || h.plannedChildIn < RISE_AFTER)) {
    rows.push(at(RISE_AFTER, 'growth', h.plannedChildIn === null ? 0 : h.plannedChildCost));
  }

  return rows;
}

export type ChildNote =
  /** Children young enough that childcare is still being paid for them. */
  | { kind: 'daycare'; count: number }
  /** The next child to reach 18, and how long that is. */
  | { kind: 'leaving'; inYears: number };

/**
 * What the children's ages say about the years ahead — in time, never in money.
 *
 * Childcare ends, teenagers get more expensive, eighteen-year-olds leave. Everyone
 * knows the direction; nobody can put a number on it for somebody else's family, so
 * this returns the dates and leaves the amounts to the household. `SCHOOL_AGE` is
 * when subsidised schooling begins here, and 18 is when a child's direct costs
 * usually drop.
 */
const SCHOOL_AGE = 6;
const LEAVING_AGE = 18;

export function childNotes(ages: number[]): ChildNote[] {
  const notes: ChildNote[] = [];

  const young = ages.filter((age) => age < SCHOOL_AGE).length;
  if (young > 0) notes.push({ kind: 'daycare', count: young });

  // The soonest one to go, which is the eldest still at home.
  const leaving = ages.filter((age) => age < LEAVING_AGE).map((age) => LEAVING_AGE - age);
  if (leaving.length > 0) notes.push({ kind: 'leaving', inYears: Math.min(...leaving) });

  return notes;
}
