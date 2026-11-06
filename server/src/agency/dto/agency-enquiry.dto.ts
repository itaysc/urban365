import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

/** What the visitor says they are writing about. Shown as-is in the agency's inbox. */
export const ENQUIRY_REASONS = [
  'רכישת נכס',
  'השכרת נכס',
  'מכירת נכס',
  'הערכת שווי',
  'אחר',
] as const;

export type EnquiryReason = (typeof ENQUIRY_REASONS)[number];

/** Posted from an agency's public page. No session, so the agency is the one in the URL. */
export class AgencyEnquiryDto {
  @IsString() @MaxLength(120) name!: string;

  // One of the two is required: a lead with no way to reach the person is not a lead.
  @ValidateIf((o: AgencyEnquiryDto) => !o.email?.trim()) @IsString() @MaxLength(40) phone?: string;
  @ValidateIf((o: AgencyEnquiryDto) => !o.phone?.trim()) @IsString() @MaxLength(200) email?: string;

  @IsOptional() @IsString() @MaxLength(2000) message?: string;
  @IsOptional() @IsIn(ENQUIRY_REASONS) reason?: EnquiryReason;
}
