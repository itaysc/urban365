/**
 * Mirrors the Prisma `AgencyVertical` enum as a validatable string union, the same way
 * `DEAL_STAGES` mirrors `DealStage` — one small source of truth for the DTOs that
 * accept it and the places that label it, without importing `@prisma/client` into
 * request validation.
 */
export const AGENCY_VERTICALS = ['real_estate', 'mortgage_broker'] as const;
export type AgencyVerticalValue = (typeof AGENCY_VERTICALS)[number];
