import { Equals, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AGENCY_VERTICALS, type AgencyVerticalValue } from '../agency-vertical.js';

/**
 * Becoming an agency on an account that already exists.
 *
 * The identity half of a signup is missing on purpose: whoever is calling this has a
 * session already. What is left is everything Google cannot tell us — which agency,
 * and a number to reach them on.
 */
export class AttachAgencyDto {
  /** Name for a brand-new agency. Ignored when `claimAgencyId` is set. */
  @IsOptional() @IsString() @MaxLength(200) agencyName?: string;

  /** An existing *unclaimed* agency to request. Admin approval decides it. */
  @IsOptional() @IsString() claimAgencyId?: string;

  /** Same rule as on `SignupDto`: ignored once an existing agency is being claimed. */
  @IsOptional() @IsIn(AGENCY_VERTICALS) vertical?: AgencyVerticalValue;

  @IsOptional() @IsString() @MaxLength(40) phone?: string;

  /**
   * Agreement to the terms and the privacy policy.
   *
   * Asked again even from an account that has already agreed: the first agreement may
   * have been given as a private buyer, and this is the point at which they become a
   * business on the platform.
   */
  @IsBoolean()
  @Equals(true, { message: 'יש לאשר את תנאי השימוש ומדיניות הפרטיות' })
  acceptedTerms!: boolean;
}
