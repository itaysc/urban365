import { describe, expect, it } from 'vitest';
import { agreementFields } from './agreement-fields.js';

describe('agreementFields', () => {
  it('leaves every field alone when the body mentions none of them', () => {
    // Editing the brief must not quietly wipe the agreement.
    const fields = agreementFields({});

    expect(fields.agreementSignedAt).toBeUndefined();
    expect(fields.agreementCommissionPercent).toBeUndefined();
    expect(fields.agreementCommissionAmount).toBeUndefined();
    expect(fields.agreementNote).toBeUndefined();
  });

  it('turns the date it was sent into a Date', () => {
    const fields = agreementFields({ agreementSignedAt: '2026-10-01T00:00:00.000Z' });

    expect(fields.agreementSignedAt).toBeInstanceOf(Date);
    expect((fields.agreementSignedAt as Date).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('clears the date on an explicit null, which is how an agreement is withdrawn', () => {
    expect(agreementFields({ agreementSignedAt: null }).agreementSignedAt).toBeNull();
  });

  it('keeps a fee of zero, which is a term somebody agreed', () => {
    // Not falsy-checked anywhere: a waived fee is a decision, not a missing value.
    expect(agreementFields({ agreementCommissionPercent: 0 }).agreementCommissionPercent).toBe(0);
    expect(agreementFields({ agreementCommissionAmount: 0 }).agreementCommissionAmount).toBe(0);
  });

  it('lets one kind of fee be set while the other is cleared', () => {
    // The dialog always sends both, so the two can never end up disagreeing.
    const fields = agreementFields({
      agreementCommissionPercent: null,
      agreementCommissionAmount: 18_000,
    });

    expect(fields.agreementCommissionPercent).toBeNull();
    expect(fields.agreementCommissionAmount).toBe(18_000);
  });

  it('trims a note and empties one that is only spaces', () => {
    expect(agreementFields({ agreementNote: '  קלסר 2026  ' }).agreementNote).toBe('קלסר 2026');
    expect(agreementFields({ agreementNote: '   ' }).agreementNote).toBeNull();
  });
});
