import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** What an agency may change about its own public page. */
export class UpdateAgencyProfileDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) contactEmail?: string;
  // `coverImageUrl` is deliberately absent: it is derived from the upload route and
  // points at a path this API serves, so accepting it from a request body would let a
  // client aim an agency's banner at any URL it liked. Upload replaces it; DELETE
  // /my/agency/cover clears it. `licenseNumber` is absent too — it is the regulator's
  // identifier for the agency, not a field to self-edit.
}

/** A yad2 agency id, or any link containing one. Parsed server-side. */
export class ImportYad2Dto {
  @IsString() @MaxLength(300) input!: string;
  @IsOptional() @IsIn(['forsale', 'rent', 'commercial']) section?: 'forsale' | 'rent' | 'commercial';
}
