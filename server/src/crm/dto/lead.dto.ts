import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export const LEAD_STATUSES = ['new', 'contacted', 'viewing', 'offer', 'won', 'lost'] as const;
export type LeadStatusValue = (typeof LEAD_STATUSES)[number];

/** Posted by a visitor from a listing page. No session, so no agency is taken on trust. */
export class PublicEnquiryDto {
  @IsString() @MaxLength(120) name!: string;

  // One of the two is required: a lead with no way to reach the person is not a lead.
  @ValidateIf((o: PublicEnquiryDto) => !o.email) @IsString() @MaxLength(40) phone?: string;
  @ValidateIf((o: PublicEnquiryDto) => !o.phone) @IsString() @MaxLength(200) email?: string;

  @IsOptional() @IsString() @MaxLength(2000) message?: string;
  @IsOptional() @IsString() captchaToken?: string;
}

export class CreateLeadDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() listingId?: string;
  @IsOptional() @IsIn(LEAD_STATUSES) status?: LeadStatusValue;
  @IsOptional() @IsString() assignedToId?: string;
}

export class UpdateLeadDto extends CreateLeadDto {
  @IsOptional() @IsString() @MaxLength(120) declare name: string;
}

export class ListLeadsQuery {
  @IsOptional() @IsIn(LEAD_STATUSES) status?: LeadStatusValue;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsString() listingId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class ImportLeadsDto {
  /** Raw CSV text. Parsed server-side so the column mapping lives in one place. */
  @IsString() @MaxLength(2_000_000) csv!: string;
}
