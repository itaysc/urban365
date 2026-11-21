/**
 * Cash a mortgage does not cover, priced so a listing can show it next to the loan.
 *
 * The bank finances a share of the price. Purchase tax and the lawyer are paid in
 * cash on top of the equity the bank counts, and a deposit that looks sufficient for
 * the price runs out before the contract when those two are left off.
 *
 * Purchase tax follows הוראת ביצוע מיסוי מקרקעין 1/2026. The single-apartment
 * brackets were frozen from 16.1.2025 through 15.1.2028. The additional-apartment
 * rates are a temporary order in force through 31.12.2026 — when that order lapses
 * the second table here has to be replaced, not left in place.
 *
 * An upgrader is taxed as a single apartment. That relief holds only if the
 * apartment they already own is sold within the period the law allows, which this
 * function cannot see, so the figure is the rate they are aiming at.
 *
 * The lawyer is a market convention — half a percent of the price plus VAT, and not
 * less than 5,000 ₪ before VAT. VAT is 18%, the rate since January 2025. It is not
 * a quote, and brokerage is left out: the seller is the one who usually pays it.
 */

import type { BuyerKind } from './mortgage-math.js';

interface Bracket {
  /** The top of this slice. The last bracket is open. */
  upTo: number;
  rate: number;
}

/** דירה יחידה, 16.1.2025–15.1.2028. Each rate applies only to the slice inside it. */
const SINGLE_APARTMENT: Bracket[] = [
  { upTo: 1_978_745, rate: 0 },
  { upTo: 2_347_040, rate: 0.035 },
  { upTo: 6_055_070, rate: 0.05 },
  { upTo: 20_183_565, rate: 0.08 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.1 },
];

/** דירה נוספת, through 31.12.2026. */
const ADDITIONAL_APARTMENT: Bracket[] = [
  { upTo: 6_055_070, rate: 0.08 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.1 },
];

const LAWYER_RATE = 0.005;
const LAWYER_FLOOR = 5_000;
const VAT = 0.18;

function marginal(price: number, brackets: Bracket[]): number {
  let tax = 0;
  let from = 0;
  for (const bracket of brackets) {
    const slice = Math.min(price, bracket.upTo) - from;
    if (slice > 0) tax += slice * bracket.rate;
    if (price <= bracket.upTo) break;
    from = bracket.upTo;
  }
  return Math.round(tax);
}

/** Purchase tax on a residential apartment, in shekels, for the buyer the bank is treating. */
export function purchaseTax(price: number, buyer: BuyerKind): number {
  if (price <= 0) return 0;
  const brackets = buyer === 'investor' ? ADDITIONAL_APARTMENT : SINGLE_APARTMENT;
  return marginal(price, brackets);
}

/** What a buyer should expect to pay a lawyer, VAT included. An estimate, not an engagement. */
export function lawyerEstimate(price: number): number {
  if (price <= 0) return 0;
  const beforeVat = Math.max(price * LAWYER_RATE, LAWYER_FLOOR);
  return Math.round(beforeVat * (1 + VAT));
}
