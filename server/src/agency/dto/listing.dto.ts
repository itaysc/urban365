import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsArray,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const SECTIONS = ['forsale', 'rent', 'commercial'] as const;
const STATUSES = ['draft', 'published', 'archived'] as const;

/**
 * The agency-editable surface of a listing — deliberately a fraction of the model. The
 * scraped fields (`token`, `raw`, `adNumber`, `lastSeenAt`, the yad2 image urls) are not
 * here and never come from a request body.
 */
export class UpsertListingDto {
  @IsIn(SECTIONS) section!: (typeof SECTIONS)[number];

  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) price?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) squareMeter?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() floor?: number;
  @IsOptional() @Type(() => Number) @IsInt() buildingTopFloor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) balconiesCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) parkingSpacesCount?: number;

  @IsOptional() @IsString() @MaxLength(80) propertyType?: string;
  @IsOptional() @IsString() @MaxLength(80) propertyCondition?: string;

  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) neighborhood?: string;
  @IsOptional() @IsString() @MaxLength(120) street?: string;
  @IsOptional() @Type(() => Number) @IsInt() houseNumber?: number;
  @IsOptional() @Type(() => Number) @IsLatitude() latitude?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() longitude?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) @MaxLength(40, { each: true })
  amenities?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(40, { each: true })
  tags?: string[];

  /**
   * The agency holds this property exclusively. Separate from `amenities`, which
   * describes the building: this is a claim about the mandate, and the service keeps
   * the matching label in step so search still finds it.
   */
  @IsOptional() @IsBoolean() isExclusive?: boolean;

  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsString() @MaxLength(120) brokerName?: string;
  @IsOptional() @IsString() @MaxLength(40) brokerLicenseNumber?: string;

  /**
   * Set after the agency has been shown a suspected duplicate and said to add it
   * anyway. Two genuinely different units can look identical on the fields we compare,
   * so this must stay possible.
   */
  @IsOptional() @IsBoolean() allowDuplicate?: boolean;
}

/** PATCH: every field optional, including the section. */
export class UpdateListingDto extends UpsertListingDto {
  @IsOptional() @IsIn(SECTIONS) declare section: (typeof SECTIONS)[number];
}

export class ReorderImagesDto {
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true })
  imageIds!: string[];
}
