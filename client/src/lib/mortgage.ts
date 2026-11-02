/**
 * Mortgage arithmetic, plus the two rules that decide whether a bank would actually
 * lend the figure this page prints.
 *
 * The payment itself is the easy half, and a calculator that stops there is the reason
 * people arrive at a bank having looked at flats they were never going to be lent the
 * money for. The limits below come from Bank of Israel's directive 329, which every
 * bank here applies, so they are what turns a number into an answer.
 *
 * Nothing in this file is an offer, a quote or advice. A real rate depends on the
 * mix — prime, fixed linked, fixed unlinked — on the borrower, and on the day.
 */

/** How the buyer is treated, which is the whole of what sets the ceiling below. */
export type BuyerKind = 'first' | 'upgrader' | 'investor';

/**
 * The share of the price a bank will advance.
 *
 * A first home is financed to 75%, somebody selling one flat to buy another to 70%,
 * and a second home kept as an investment to 50%. The remainder is the הון עצמי, and
 * for most buyers it — not the interest rate — is what decides what they can look at.
 */
export const LTV_CAP: Record<BuyerKind, number> = {
  first: 0.75,
  upgrader: 0.7,
  investor: 0.5,
};

export const BUYER_LABEL: Record<BuyerKind, string> = {
  first: 'דירה ראשונה',
  upgrader: 'משפרי דיור',
  investor: 'דירה להשקעה',
};

/**
 * The most of a month's net income a bank will let the repayment take.
 *
 * The regulation forbids lending above 50% and makes anything above 40% expensive for
 * the bank to hold, so 40% is where approvals stop in practice and many banks stop at
 * a third. Treat it as the ceiling, not as a target.
 */
export const INCOME_CAP = 0.4;

/** The longest term a mortgage may run here. */
export const MAX_YEARS = 30;

/** What the fields open on, said once so the page and its teaser agree. */
export const DEFAULT_RATE = 5;
export const DEFAULT_YEARS = 25;
/** A first home at the full 75%, which is the common case and the friendliest start. */
export const DEFAULT_EQUITY_SHARE = 1 - LTV_CAP.first;

const MONTHS = 12;

/**
 * The monthly repayment on a לוח שפיצר loan — the level-payment schedule every bank
 * here quotes, where each payment is the same and only its split between interest and
 * principal moves.
 *
 * A rate of zero is not a rounding case to be divided by: it falls out of the formula
 * as 0/0, so it is answered directly.
 */
export function monthlyPayment(loan: number, annualRate: number, years: number): number {
  const months = Math.round(years * MONTHS);
  if (loan <= 0 || months <= 0) return 0;

  const rate = annualRate / 100 / MONTHS;
  if (rate === 0) return loan / months;

  return (loan * rate) / (1 - (1 + rate) ** -months);
}

/**
 * The other direction: the loan a given monthly payment can carry.
 *
 * This is what somebody actually asks — they know what they can pay each month, not
 * what they can borrow — and inverting the formula here keeps the two answers exactly
 * consistent, which iterating towards one would not.
 */
export function loanFor(monthly: number, annualRate: number, years: number): number {
  const months = Math.round(years * MONTHS);
  if (monthly <= 0 || months <= 0) return 0;

  const rate = annualRate / 100 / MONTHS;
  if (rate === 0) return monthly * months;

  return (monthly * (1 - (1 + rate) ** -months)) / rate;
}

export interface Plan {
  /** What is borrowed: the price less whatever the buyer brings. */
  loan: number;
  /** As a share of the price, which is the number the bank's rule is written in. */
  ltv: number;
  monthly: number;
  totalPaid: number;
  totalInterest: number;
  /**
   * How much more הון עצמי the buyer needs before a bank would lend this, or 0 when
   * there is enough. The reason this file exists: the payment can be comfortable and
   * the loan still be one nobody will write.
   */
  equityShortfall: number;
}

export interface PlanInput {
  price: number;
  equity: number;
  annualRate: number;
  years: number;
  buyer: BuyerKind;
}

/** What a given price costs per month, and whether it is a loan a bank would make. */
export function plan({ price, equity, annualRate, years, buyer }: PlanInput): Plan {
  // Equity above the price is somebody paying cash with change left over, not a
  // negative loan.
  const loan = Math.max(0, price - equity);
  const monthly = monthlyPayment(loan, annualRate, years);
  const totalPaid = monthly * Math.round(years * MONTHS);

  const needed = Math.ceil(price * (1 - LTV_CAP[buyer]));

  return {
    loan: Math.round(loan),
    ltv: price > 0 ? loan / price : 0,
    monthly: Math.round(monthly),
    totalPaid: Math.round(totalPaid),
    totalInterest: Math.round(totalPaid - loan),
    equityShortfall: Math.max(0, needed - equity),
  };
}

export interface Budget {
  /** The most this income will carry each month, once commitments are out. */
  ceiling: number;
  /** The most the buyer can pay for a flat. */
  price: number;
  /** What is borrowed at that price — everything above the deposit. */
  loan: number;
  /**
   * The repayment on that loan.
   *
   * The ceiling itself whenever the income is what stopped them, and less when the
   * deposit stopped them first: a buyer held back by a thin deposit is being offered
   * a smaller flat than their salary would carry, and printing the ceiling as the
   * payment would overstate what that flat costs them every month for 25 years.
   */
  monthly: number;
  /**
   * Which rule produced that price — the repayment the income carries, or the equity
   * the bank requires. Worth saying out loud: the two want opposite things done about
   * them, and somebody held back by their deposit gains nothing from a longer term.
   */
  limitedBy: 'income' | 'equity';
}

export interface BudgetInput {
  /** Net monthly household income — what arrives, not the gross on the payslip. */
  income: number;
  /** Loan and lease payments already running, which the bank counts against it. */
  commitments: number;
  equity: number;
  annualRate: number;
  years: number;
  buyer: BuyerKind;
}

/** The reverse question, and the one most buyers are really asking: how much flat? */
export function budget({
  income,
  commitments,
  equity,
  annualRate,
  years,
  buyer,
}: BudgetInput): Budget {
  const ceiling = Math.max(0, income * INCOME_CAP - commitments);

  /*
   * Two ceilings, and the lower one is the answer.
   *
   * What the repayment buys is the equity plus the loan it carries. What the deposit
   * allows is the price at which that deposit is exactly the share the bank requires —
   * so equity / (1 - cap), which is where the LTV rule bites first for most buyers.
   */
  const byIncome = equity + loanFor(ceiling, annualRate, years);
  const byEquity = equity / (1 - LTV_CAP[buyer]);

  // The price is settled first and everything else is read back off it, so the three
  // figures on the screen agree with each other down to the shekel.
  const price = Math.floor(Math.min(byIncome, byEquity));
  const loan = Math.max(0, price - equity);

  return {
    ceiling: Math.round(ceiling),
    price,
    loan,
    monthly: Math.round(monthlyPayment(loan, annualRate, years)),
    limitedBy: byEquity < byIncome ? 'equity' : 'income',
  };
}
