import {
  INCOME_CAP,
  LTV_CAP,
  TRACKS,
  lawyerEstimate,
  mix,
  monthlyPayment,
  purchaseTax,
  rebalance,
  type BuyerKind,
  type MixPart,
  type TrackKey,
} from '@/lib/mortgage';

/**
 * The household a buyer typed into the calculator, kept in this browser.
 *
 * Search does not filter on it. A for-sale card reads it and says what that
 * apartment would cost this household, and marks the card when a bank would
 * refuse the loan. Every listing stays on the page.
 */

const STORAGE_KEY = 'urban365.buyingPower';
const CHANGED = 'urban365-buying-power';

export interface BuyingPower {
  buyer: BuyerKind;
  equity: number;
  income: number;
  /**
   * False until they type an income or ask to mark listings from the budget tab.
   * The field opens on 25,000, and that placeholder is not a salary.
   */
  incomeKnown: boolean;
  commitments: number;
  /** Null means the bank's ceiling, the same convention as the calculator. */
  chosenMonthly: number | null;
  annualRate: number;
  years: number;
  /** True once they have shaped a mix. Until then a listing is priced at the single rate. */
  shaped: boolean;
  parts: MixPart[];
  /** The price on the calculator, so it reopens where they left it. A listing link overrides it. */
  price: number;
}

export type BuyingMark = 'equity' | 'income' | 'cash';

export interface ListingQuote {
  monthly: number;
  loan: number;
  equityRequired: number;
  equityShortfall: number;
  purchaseTax: number;
  lawyer: number;
  extraCash: number;
  /** What remains of their equity after the share the bank requires. Negative when that share is already short. */
  cashLeft: number;
  /** Null when they never said what they earn, so the income rule is not applied. */
  ceiling: number | null;
  marks: BuyingMark[];
}

const BUYERS = new Set<string>(['first', 'upgrader', 'investor']);
const TRACK_KEYS = new Set<string>(Object.keys(TRACKS));

function isPart(value: unknown): value is MixPart {
  if (!value || typeof value !== 'object') return false;
  const part = value as Partial<MixPart>;
  return (
    typeof part.key === 'string' &&
    TRACK_KEYS.has(part.key) &&
    typeof part.amount === 'number' &&
    Number.isFinite(part.amount) &&
    typeof part.annualRate === 'number' &&
    Number.isFinite(part.annualRate) &&
    typeof part.years === 'number' &&
    Number.isFinite(part.years)
  );
}

function isPower(value: unknown): value is BuyingPower {
  if (!value || typeof value !== 'object') return false;
  const power = value as Partial<BuyingPower>;
  const monthly = power.chosenMonthly;
  return (
    typeof power.buyer === 'string' &&
    BUYERS.has(power.buyer) &&
    typeof power.equity === 'number' &&
    Number.isFinite(power.equity) &&
    power.equity >= 0 &&
    typeof power.income === 'number' &&
    Number.isFinite(power.income) &&
    power.income >= 0 &&
    typeof power.incomeKnown === 'boolean' &&
    typeof power.commitments === 'number' &&
    Number.isFinite(power.commitments) &&
    power.commitments >= 0 &&
    (monthly === null ||
      (typeof monthly === 'number' && Number.isFinite(monthly) && monthly >= 0)) &&
    typeof power.annualRate === 'number' &&
    Number.isFinite(power.annualRate) &&
    typeof power.years === 'number' &&
    Number.isFinite(power.years) &&
    power.years > 0 &&
    typeof power.shaped === 'boolean' &&
    Array.isArray(power.parts) &&
    power.parts.every(isPart) &&
    typeof power.price === 'number' &&
    Number.isFinite(power.price) &&
    power.price >= 0
  );
}

function live(storage: Pick<Storage, 'getItem'>): boolean {
  return typeof localStorage !== 'undefined' && storage === localStorage;
}

function notify(storage: Pick<Storage, 'getItem'>): void {
  if (typeof window === 'undefined' || !live(storage)) return;
  window.dispatchEvent(new Event(CHANGED));
}

/** What this browser has kept. Anything unreadable is no household, not an error. */
export function loadBuyingPower(storage: Pick<Storage, 'getItem'> = localStorage): BuyingPower | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPower(parsed)) return null;
    return {
      ...parsed,
      buyer: parsed.buyer,
      parts: parsed.parts.map((part) => ({ ...part, key: part.key as TrackKey })),
    };
  } catch {
    return null;
  }
}

export function storeBuyingPower(
  power: BuyingPower,
  storage: Pick<Storage, 'setItem' | 'getItem'> = localStorage,
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(power));
    notify(storage);
  } catch {
    // A full or blocked store means the marks last for this visit only.
  }
}

export function clearBuyingPower(storage: Pick<Storage, 'removeItem' | 'getItem'> = localStorage): void {
  try {
    storage.removeItem(STORAGE_KEY);
    notify(storage);
  } catch {
    // Nothing to clear is the state the page already wanted.
  }
}

/** Told when this browser's household is saved or cleared, including from another tab. */
export function subscribeBuyingPower(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const sync = () => onChange();
  window.addEventListener(CHANGED, sync);
  window.addEventListener('storage', sync);
  return () => {
    window.removeEventListener(CHANGED, sync);
    window.removeEventListener('storage', sync);
  };
}

function paymentFor(power: BuyingPower, loan: number): number {
  // Nothing borrowed, nothing to repay. A mix sized to some other loan must not
  // leak its old payment onto a purchase they can make in cash.
  if (loan <= 0) return 0;
  if (power.shaped && power.parts.length > 0) return mix(rebalance(power.parts, loan)).monthly;
  return Math.round(monthlyPayment(loan, power.annualRate, power.years));
}

/**
 * What this apartment costs this household, and which of the rules it fails.
 *
 * Equity and the income cap are the bank's rules. Cash is the tax and the lawyer,
 * which the bank will not lend: it is marked only once the deposit already covers
 * the bank's share, because a short deposit is the thing to say first.
 */
export function quoteListing(power: BuyingPower, price: number): ListingQuote {
  const equityRequired = Math.ceil(price * (1 - LTV_CAP[power.buyer]));
  const loan = Math.max(0, price - power.equity);
  const monthly = paymentFor(power, loan);
  const tax = purchaseTax(price, power.buyer);
  const lawyer = lawyerEstimate(price);
  const extraCash = tax + lawyer;
  const cashLeft = power.equity - equityRequired;
  const ceiling =
    power.incomeKnown && power.income > 0
      ? Math.max(0, Math.round(power.income * INCOME_CAP - power.commitments))
      : null;

  const marks: BuyingMark[] = [];
  if (power.equity < equityRequired) marks.push('equity');
  else if (cashLeft < extraCash) marks.push('cash');
  // A shekel over is rounding, the same tolerance the budget uses.
  if (ceiling !== null && monthly - ceiling > 1) marks.push('income');

  return {
    monthly,
    loan: Math.round(loan),
    equityRequired,
    equityShortfall: Math.max(0, equityRequired - power.equity),
    purchaseTax: tax,
    lawyer,
    extraCash,
    cashLeft,
    ceiling,
    marks,
  };
}
