import { describe, expect, it } from 'vitest';
import { agreementLabel, agreementTitle, asDateInput, commissionText, isSigned } from './agreement';
import type { CustomerAgreement } from '@/services/crm';

const agreement = (over: Partial<CustomerAgreement> = {}): CustomerAgreement => ({
  agreementSignedAt: null,
  agreementCommissionPercent: null,
  agreementCommissionAmount: null,
  agreementNote: null,
  ...over,
});

describe('isSigned', () => {
  it('is false until there is a date', () => {
    expect(isSigned(agreement())).toBe(false);
  });

  it('is true once there is one', () => {
    expect(isSigned(agreement({ agreementSignedAt: '2026-10-01T00:00:00.000Z' }))).toBe(true);
  });
});

describe('commissionText', () => {
  it('says a percentage with the VAT it excludes', () => {
    expect(commissionText(agreement({ agreementCommissionPercent: 2 }))).toBe('2% + מע״מ');
  });

  it('keeps a half per cent', () => {
    expect(commissionText(agreement({ agreementCommissionPercent: 1.5 }))).toBe('1.5% + מע״מ');
  });

  it('says a fixed fee in shekels', () => {
    expect(commissionText(agreement({ agreementCommissionAmount: 15000 }))).toContain('15,000');
  });

  it('prefers the percentage when somebody has filled in both', () => {
    const both = agreement({ agreementCommissionPercent: 2, agreementCommissionAmount: 15000 });

    expect(commissionText(both)).toBe('2% + מע״מ');
  });

  it('prints a zero rather than hiding it', () => {
    // A fee waived on purpose is a term of the agreement, not a missing value.
    expect(commissionText(agreement({ agreementCommissionPercent: 0 }))).toBe('0% + מע״מ');
  });

  it('is null when nothing has been agreed', () => {
    expect(commissionText(agreement())).toBeNull();
  });
});

describe('agreementLabel', () => {
  it('says so plainly when nobody has signed', () => {
    expect(agreementLabel(agreement())).toBe('אין הסכם');
  });

  it('carries the fee when there is one, since that is the point of the agreement', () => {
    const signed = agreement({
      agreementSignedAt: '2026-10-01T00:00:00.000Z',
      agreementCommissionPercent: 2,
    });

    expect(agreementLabel(signed)).toBe('הסכם · 2% + מע״מ');
  });

  it('still says it is signed when no fee was recorded', () => {
    expect(agreementLabel(agreement({ agreementSignedAt: '2026-10-01T00:00:00.000Z' }))).toBe(
      'הסכם חתום',
    );
  });
});

describe('agreementTitle', () => {
  it('names the date, which is the half that settles which version was signed', () => {
    const title = agreementTitle(agreement({ agreementSignedAt: '2026-10-01T00:00:00.000Z' }));

    expect(title).toContain('2026');
    expect(title).toContain('נחתם');
  });

  it('says nothing was signed, rather than leaving it blank', () => {
    expect(agreementTitle(agreement())).toBe('לא נחתם הסכם תיווך');
  });
});

describe('asDateInput', () => {
  it('cuts an ISO timestamp down to what a date field takes', () => {
    expect(asDateInput('2026-10-01T09:30:00.000Z')).toBe('2026-10-01');
  });

  it('is empty for nothing', () => {
    expect(asDateInput(null)).toBe('');
  });
});
