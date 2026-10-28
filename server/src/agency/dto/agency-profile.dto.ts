import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** What an agency may change about its own public page. */
export class UpdateAgencyProfileDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) contactEmail?: string;
  /**
   * Cleared by sending an empty string. `licenseNumber` is deliberately absent: it is
   * the regulator's identifier for the agency, not a field to self-edit.
   */
  @IsOptional() @IsString() @MaxLength(500) coverImageUrl?: string;
}

export class PresignCoverDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
  contentType!: string;
}
