/**
 * What a mortgage case becomes on the agency's commission dashboard once it closes.
 *
 * Kept as a pure function, not inline in the service, for the same reason
 * `agreement-fields.ts` is: the rule — a signed case is a deal, and nothing else is —
 * is worth asserting on its own rather than trusting a read of the service that
 * happens to call it correctly.
 *
 * `overview.service.ts`'s commission/turnover dashboard reads `Deal`, not
 * `MortgageCase`, so this is the one place a closed case has to produce one.
 */

const TERMINAL_SIGNED = 'signed';

export interface DealFieldsFromCase {
  stage: 'closed_won';
  title: string;
  price: number | null;
  commission: number | null;
  closedAt: Date;
}

/**
 * `null` when the case is not (yet, or no longer) signed — the caller's cue to leave
 * any existing linked deal alone rather than reopen or rewrite it from a case that
 * moved back out of `signed` by mistake.
 */
export function dealFieldsFromCase(
  mortgageCase: { stage: string; requestedAmount: number | null; displayName: string },
): DealFieldsFromCase | null {
  if (mortgageCase.stage !== TERMINAL_SIGNED) return null;

  return {
    stage: 'closed_won',
    title: mortgageCase.displayName,
    price: mortgageCase.requestedAmount,
    // The case itself carries no commission figure — a mortgage broker's fee is not
    // asked for in the intake the way a brokerage's is on `Customer` — so this starts
    // null and is the deal's to fill in afterwards, same as a deal created by hand.
    commission: null,
    closedAt: new Date(),
  };
}
