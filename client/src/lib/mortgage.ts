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
  /**
   * What the repayment is actually set to: the ceiling, or a smaller figure the
   * buyer named. Most people have a number they are willing to live on rather than
   * the largest one a bank would sign, and the budget should follow theirs.
   */
  spend: number;
  /**
   * The repayment this budget actually requires is above what a bank would approve.
   *
   * Measured on `monthly`, the payment on the loan that is really taken — not on
   * `spend`, the figure that was typed. Somebody can ask to pay 15,000 and be held to
   * a smaller flat by their deposit, and end up paying 8,769: there is nothing for a
   * bank to refuse, and warning them about the number they typed rather than the one
   * they would pay is a warning about nothing.
   */
  overCeiling: boolean;
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
   * Which rule produced that price — the repayment, or the equity the bank requires.
   * Worth saying out loud: the two want opposite things done about them, and somebody
   * held back by their deposit gains nothing from a longer term.
   *
   * `payment` rather than `income`, because the repayment is no longer necessarily
   * what the income dictates: it is whatever the buyer decided to spend.
   */
  limitedBy: 'payment' | 'equity';
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
  /**
   * What they intend to pay each month. Left out, the regulator's ceiling is used —
   * which is the most a bank would allow, not necessarily a sum anybody wants to pay.
   */
  monthly?: number;
}

/** The reverse question, and the one most buyers are really asking: how much flat? */
export function budget({
  income,
  commitments,
  equity,
  annualRate,
  years,
  buyer,
  monthly,
}: BudgetInput): Budget {
  const ceiling = Math.max(0, income * INCOME_CAP - commitments);

  /*
   * What they said they would pay, or the most a bank would allow if they said
   * nothing. A chosen figure above the ceiling is not clamped — it is reported as
   * over it. Quietly lowering somebody's number and then answering a question they
   * did not ask is worse than telling them a bank will refuse it.
   */
  const spend = monthly === undefined ? ceiling : Math.max(0, monthly);

  /*
   * Two ceilings, and the lower one is the answer.
   *
   * What the repayment buys is the equity plus the loan it carries. What the deposit
   * allows is the price at which that deposit is exactly the share the bank requires —
   * so equity / (1 - cap), which is where the LTV rule bites first for most buyers.
   */
  const byPayment = equity + loanFor(spend, annualRate, years);
  const byEquity = equity / (1 - LTV_CAP[buyer]);

  // The price is settled first and everything else is read back off it, so the three
  // figures on the screen agree with each other down to the shekel.
  const price = Math.floor(Math.min(byPayment, byEquity));
  const loan = Math.max(0, price - equity);
  const willPay = monthlyPayment(loan, annualRate, years);

  return {
    ceiling: Math.round(ceiling),
    spend: Math.round(spend),
    // A shekel over is rounding, not a breach worth a panel of its own.
    overCeiling: willPay - ceiling > 1,
    price,
    loan,
    monthly: Math.round(willPay),
    limitedBy: byEquity < byPayment ? 'equity' : 'payment',
  };
}

/* ── the mix (תמהיל) ───────────────────────────────────────────────────────────
 *
 * A mortgage here is almost never one loan. It is two to four of them taken
 * together, each with its own rate, its own term and its own kind of risk, and the
 * split between them — the תמהיל — is most of what a borrower actually decides.
 */

/**
 * The Bank of Israel's current rate, and the prime derived from it.
 *
 * Prime is the central bank's rate plus 1.5 points, by convention, so one constant
 * moves both. The committee meets every few weeks; when it moves, this is the line to
 * change, and `TRACKS.prime.rate` follows it.
 */
export const BOI_RATE = 3.25;
export const PRIME_RATE = BOI_RATE + 1.5;

export type TrackKey = 'fixed' | 'fixedLinked' | 'prime' | 'variable5' | 'variable5Linked';

export interface TrackSpec {
  label: string;
  /**
   * Whether the rate can move before the end of the term.
   *
   * This — and only this — is what the two-thirds rule counts. Index linkage is a
   * different risk and does not make a track variable: a קבועה צמודה has a rate fixed
   * for thirty years and still counts towards the fixed third.
   */
  variable: boolean;
  /** Principal and payment follow the consumer price index. */
  linked: boolean;
  /** Where the opening rate comes from, said on the row. */
  note: string;
  /** A starting point, not a quote — see RATES_ARE_ILLUSTRATIVE below. */
  rate: number;
}

/**
 * The tracks the banks here actually offer, in the order a mix is usually built.
 *
 * Not an exhaustive catalogue: a bank will also write a loan at other reset intervals
 * (every year, every two, every ten), a זכאות loan against a ministry certificate, and
 * currency-linked loans that almost nobody takes. These five are what a normal mix is
 * made of, and adding another is one entry here.
 *
 * **The rates are illustrative starting points, not offers.** A real rate depends on
 * the bank, the borrower, the loan-to-value and the day, and the whole point of the
 * row being editable is that the number from your own bank goes in it.
 */
export const TRACKS: Record<TrackKey, TrackSpec> = {
  fixed: {
    label: 'קבועה לא צמודה (קל״צ)',
    variable: false,
    linked: false,
    note: 'הריבית וההחזר ידועים מראש לכל התקופה. המסלול היקר ביותר, והבטוח ביותר.',
    rate: 4.9,
  },
  fixedLinked: {
    label: 'קבועה צמודה למדד',
    variable: false,
    linked: true,
    note: 'הריבית קבועה, אבל הקרן וההחזר עולים עם המדד. נחשב קבוע לעניין מגבלת השליש.',
    rate: 3.4,
  },
  prime: {
    label: 'פריים',
    variable: true,
    linked: false,
    note: `נגזר מריבית בנק ישראל (${BOI_RATE}%) בתוספת 1.5%, כלומר פריים ${PRIME_RATE}% היום. משתנה עם כל החלטת ריבית.`,
    rate: PRIME_RATE - 0.5,
  },
  variable5: {
    label: 'משתנה כל 5 שנים, לא צמודה',
    variable: true,
    linked: false,
    note: 'הריבית נקבעת מחדש כל חמש שנים לפי עוגן. נקודת יציאה ללא עמלה בכל שינוי.',
    rate: 4.6,
  },
  variable5Linked: {
    label: 'משתנה כל 5 שנים, צמודה',
    variable: true,
    linked: true,
    note: 'ריבית שמתעדכנת כל חמש שנים, וקרן שצמודה למדד. הזולה בפתיחה, והפחות צפויה.',
    rate: 3.3,
  },
};

/**
 * The one composition rule left in Proper Conduct of Banking Business Directive 329.
 *
 * Until the end of 2020 there were two: at most a third in prime, and at most
 * two-thirds variable overall. The prime limit was deleted — section 7.2 of the
 * directive — and this is what remains, so a mix of one third fixed and two thirds
 * prime is now allowed where it once was not.
 *
 * Two thirds, not the 66.66% the directive prints. That figure is the rounded form of
 * the same number, and taking it literally rejects the one mix the directive's own
 * explanatory note spells out as permitted — "at least one-third at a fixed rate, and
 * the up to two-thirds remaining at a variable rate" — because two thirds is 66.667%
 * and sits a hair above it. A rule that forbids its own worked example is the wrong
 * rule; a test for exactly that case is what found this.
 */
export const VARIABLE_CAP = 2 / 3;

export interface MixPart {
  key: TrackKey;
  amount: number;
  annualRate: number;
  years: number;
}

export interface MixSummary {
  /** What the parts add up to, which is not necessarily the loan that is needed. */
  amount: number;
  monthly: number;
  totalPaid: number;
  totalInterest: number;
  /** Of the mix, not of the price. Compared against VARIABLE_CAP. */
  variableShare: number;
  /** How much of it the index can move. Not a rule, but worth saying out loud. */
  linkedShare: number;
  /** The blended rate, for comparing one mix against another in a single number. */
  weightedRate: number;
}

/** Each part priced on its own, then added — which is exactly what a bank does. */
export function mix(parts: MixPart[]): MixSummary {
  const amount = parts.reduce((sum, p) => sum + p.amount, 0);

  let monthly = 0;
  let totalPaid = 0;
  let variable = 0;
  let linked = 0;
  let rateWeighted = 0;

  for (const part of parts) {
    const pay = monthlyPayment(part.amount, part.annualRate, part.years);
    monthly += pay;
    totalPaid += pay * Math.round(part.years * MONTHS);

    if (TRACKS[part.key].variable) variable += part.amount;
    if (TRACKS[part.key].linked) linked += part.amount;
    rateWeighted += part.annualRate * part.amount;
  }

  return {
    amount: Math.round(amount),
    monthly: Math.round(monthly),
    totalPaid: Math.round(totalPaid),
    totalInterest: Math.round(totalPaid - amount),
    // An empty mix divides by zero, and "nothing is variable" is the honest answer.
    variableShare: amount > 0 ? variable / amount : 0,
    linkedShare: amount > 0 ? linked / amount : 0,
    weightedRate: amount > 0 ? rateWeighted / amount : 0,
  };
}

export type MixProblem =
  /** More than two thirds of it can move. No bank here may write this. */
  | { kind: 'variable-over-cap'; share: number }
  /** The parts do not add up to the loan the purchase needs. */
  | { kind: 'short'; by: number }
  | { kind: 'over'; by: number };

/**
 * What is wrong with this mix, in the order worth saying it.
 *
 * The arithmetic problem comes first: a mix that does not add up to the loan is not
 * yet a mix, and its two-thirds share is a share of the wrong total.
 */
export function mixProblems(parts: MixPart[], loan: number): MixProblem[] {
  const summary = mix(parts);
  const problems: MixProblem[] = [];

  // A shekel either way is rounding, not a mistake the reader should be told about.
  const gap = loan - summary.amount;
  if (gap > 1) problems.push({ kind: 'short', by: gap });
  if (gap < -1) problems.push({ kind: 'over', by: -gap });

  // A hair of float noise is not a breach: a third of 1,000,000 as three amounts that
  // add back up can land a few parts in 10^16 over the line.
  if (summary.variableShare - VARIABLE_CAP > 1e-9) {
    problems.push({ kind: 'variable-over-cap', share: summary.variableShare });
  }

  return problems;
}

/** A sensible opening mix for a loan: the regulator's minimum third fixed, the rest split. */
export function defaultMix(loan: number, years: number): MixPart[] {
  // A third, a third, a third — the shape most brokers start a conversation from, and
  // the one that satisfies the rule with room to spare.
  const third = Math.round(loan / 3);
  return [
    { key: 'fixed', amount: loan - 2 * third, annualRate: TRACKS.fixed.rate, years },
    { key: 'prime', amount: third, annualRate: TRACKS.prime.rate, years },
    { key: 'variable5', amount: third, annualRate: TRACKS.variable5.rate, years },
  ];
}

/**
 * The same shape of mix, resized to a different loan.
 *
 * Changing the price changes what has to be borrowed, and the mix underneath stops
 * adding up. Rebuilding it from scratch would throw away the split the borrower
 * chose; scaling each part by the same factor keeps their shape and fixes the sum.
 *
 * The rounding remainder goes on the largest part, where a few shekels are least
 * visible — and it has to go somewhere, or the total is off by one and the page
 * reports a problem nobody can see.
 */
export function rebalance(parts: MixPart[], loan: number): MixPart[] {
  const total = parts.reduce((sum, p) => sum + p.amount, 0);
  if (parts.length === 0 || loan <= 0) return parts;

  // No shape to preserve: split what is there evenly rather than divide by zero.
  const scaled = parts.map((p) => ({
    ...p,
    amount: total > 0 ? Math.round((p.amount * loan) / total) : Math.round(loan / parts.length),
  }));

  const drift = loan - scaled.reduce((sum, p) => sum + p.amount, 0);
  if (drift !== 0) {
    const biggest = scaled.reduce((at, p, i) => (p.amount > scaled[at].amount ? i : at), 0);
    scaled[biggest] = { ...scaled[biggest], amount: scaled[biggest].amount + drift };
  }

  return scaled;
}

/**
 * What another shekel of deposit is worth to a buyer the LTV rule is holding back.
 *
 * It is `extra / (1 - cap)`: at 75% financing a shekel of equity unlocks three more of
 * loan, so four of price. Worth saying in shekels rather than as a multiplier — "it
 * widens your budget by 4" answers a question nobody asked, in units nobody can name.
 */
export function extraBudgetFor(buyer: BuyerKind, extraEquity: number): number {
  return extraEquity / (1 - LTV_CAP[buyer]);
}
