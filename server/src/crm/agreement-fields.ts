/**
 * Turning what the agreement form sent into what Prisma should write.
 *
 * Three states, not two, and the difference matters on every field: `undefined` means
 * the body did not mention it, so leave what is stored; `null` means clear it; anything
 * else is a new value. A form that saves one field without restating the others relies
 * on the first, and "they never actually signed" relies on the second — collapsing the
 * two would make an unsigned agreement indistinguishable from an unedited one.
 */
export interface AgreementInput {
  agreementSignedAt?: string | null;
  agreementCommissionPercent?: number | null;
  agreementCommissionAmount?: number | null;
  agreementNote?: string;
}

export interface AgreementFields {
  agreementSignedAt?: Date | null;
  agreementCommissionPercent?: number | null;
  agreementCommissionAmount?: number | null;
  agreementNote?: string | null;
}

export function agreementFields(dto: AgreementInput): AgreementFields {
  return {
    /*
     * Parsed here rather than passed through: the DTO has checked it is a date, and
     * Prisma wants a Date rather than the string it arrived as.
     */
    agreementSignedAt:
      dto.agreementSignedAt === undefined
        ? undefined
        : dto.agreementSignedAt === null
          ? null
          : new Date(dto.agreementSignedAt),
    agreementCommissionPercent: dto.agreementCommissionPercent,
    agreementCommissionAmount: dto.agreementCommissionAmount,
    // An emptied text box means empty, like every other text field on a customer.
    agreementNote:
      dto.agreementNote === undefined
        ? undefined
        : dto.agreementNote.trim() === ''
          ? null
          : dto.agreementNote.trim(),
  };
}
