import { formatShekel } from '@/lib/format';
import type { CustomerAgreement } from '@/services/crm';

/**
 * Reading a brokerage agreement off a customer.
 *
 * The one question that matters is whether it was signed: under the Real Estate Agents
 * Law a fee can only be claimed where the client signed a written order, so an agency
 * that cannot produce the paper has done the work for nothing. Everything else here is
 * detail hanging off that.
 */

export const isSigned = (c: CustomerAgreement): boolean => c.agreementSignedAt !== null;

/**
 * The fee as the agreement states it, or null when nothing has been agreed.
 *
 * Per cent and fixed sum are shown as they were entered, never converted into each
 * other: working out 2% needs a price nobody has agreed at the point this is signed.
 * Both are before VAT, which is said out loud because every brokerage agreement in the
 * country is quoted that way and a figure that does not say so is ambiguous.
 *
 * Zero is a real answer — a favour somebody did on purpose — so it is printed rather
 * than treated as absent.
 */
export function commissionText(c: CustomerAgreement): string | null {
  if (c.agreementCommissionPercent !== null) {
    return `${c.agreementCommissionPercent}% + מע״מ`;
  }
  return null;
}

/** What the chip on a customer row says. */
export function agreementLabel(c: CustomerAgreement): string {
  if (!isSigned(c)) return 'אין הסכם';

  const fee = commissionText(c);
  return fee ? `הסכם · ${fee}` : 'הסכם חתום';
}

/**
 * The full sentence, for the title attribute and the dialog.
 *
 * Says the date, because "signed" without one is the half of the fact that does not
 * help when somebody asks which version was signed.
 */
export function agreementTitle(c: CustomerAgreement): string {
  if (!isSigned(c)) return 'לא נחתם הסכם תיווך';

  const when = new Date(c.agreementSignedAt as string).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const fee = commissionText(c);

  return `נחתם ב-${when}${fee ? ` · ${fee}` : ''}`;
}

/** `2026-11-01`, which is what a `<input type="date">` wants. */
export const asDateInput = (iso: string | null): string =>
  iso ? new Date(iso).toISOString().slice(0, 10) : '';
