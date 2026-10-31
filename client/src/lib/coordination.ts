import type { AttendeeResponse } from '@/services/calendar';

/**
 * What each side's answer looks like, in that side's own terms.
 *
 * The two are not the same sentence: a buyer who says no is not coming, while an owner
 * who says no is saying the time does not suit — they live there. One shared label
 * would have to be vague enough to cover both, and an agent skimming a diary would
 * learn nothing from it.
 *
 * `pending` is deliberately absent: "has not answered" and "has not been asked" are
 * the same value in the column and different things on screen, and only the caller
 * knows which it is — it holds the `…AskedAt` that tells them apart.
 */
export const BUYER_RESPONSE_LABEL: Record<Exclude<AttendeeResponse, 'pending'>, string> = {
  confirmed: 'אישר',
  declined: 'ביטל',
};

export const SELLER_RESPONSE_LABEL: Record<Exclude<AttendeeResponse, 'pending'>, string> = {
  confirmed: 'אישר את המועד',
  declined: 'המועד לא מתאים',
};

export const RESPONSE_CLASS: Record<AttendeeResponse, string> = {
  confirmed: 'bg-green-50 text-green-800',
  declined: 'bg-red-50 text-red-800',
  // Amber reads as "waiting on somebody", which is exactly what it is. Grey would read
  // as "nothing to do here", and there usually is.
  pending: 'bg-amber-50 text-amber-800',
};
