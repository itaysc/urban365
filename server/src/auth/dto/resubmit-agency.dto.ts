import { IsEmail, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { AGENCY_VERTICALS, type AgencyVerticalValue } from '../agency-vertical.js';

/**
 * A turned-down agency asking again.
 *
 * `revise` corrects the agency they created. `reask` repeats the claim on the office
 * they already named. `switch` leaves that office and asks for a different one.
 */
export class ResubmitAgencyDto {
  @IsIn(['revise', 'reask', 'switch'])
  mode!: 'revise' | 'reask' | 'switch';

  /** Name for the agency they created, or for a brand-new one when switching. */
  @IsOptional() @IsString() @MaxLength(200) agencyName?: string;

  /** An existing unclaimed office, when they are asking for a different one. */
  @IsOptional() @IsString() claimAgencyId?: string;

  /** Only meaningful for `switch` with no `claimAgencyId`: a brand-new agency again. */
  @IsOptional() @IsIn(AGENCY_VERTICALS) vertical?: AgencyVerticalValue;

  @IsOptional() @IsString() @MaxLength(40) phone?: string;

  @ValidateIf((dto: ResubmitAgencyDto) => Boolean(dto.contactEmail?.trim()))
  @IsEmail({}, { message: 'כתובת אימייל לא תקינה' })
  @MaxLength(200)
  contactEmail?: string;

  @IsOptional() @IsString() @MaxLength(4000) description?: string;
}
