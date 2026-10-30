import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SECTIONS, type Section } from '../../yad2/yad2.types.js';

/**
 * What a person selling their own property fills in.
 *
 * Deliberately smaller than the agency form: no exclusivity, which is a mandate between
 * an owner and an agent and meaningless when they are the same person; no broker name
 * or licence; no draft status.
 */
export class SellerListingDto {
  @IsIn(SECTIONS) section!: Section;

  @IsString() @MinLength(2) @MaxLength(80) city!: string;

  @IsOptional() @IsString() @MaxLength(120) street?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) houseNumber?: number;
  @IsOptional() @IsString() @MaxLength(120) neighborhood?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) price?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) squareMeter?: number;
  @IsOptional() @Type(() => Number) @IsInt() floor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) buildingTopFloor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) balconiesCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) parkingSpacesCount?: number;

  @IsOptional() @IsString() @MaxLength(80) propertyType?: string;
  @IsOptional() @IsString() @MaxLength(80) propertyCondition?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(40, { each: true })
  amenities?: string[];

  /** The same 2,000 the form counts down from — roughly three hundred words. */
  @IsOptional() @IsString() @MaxLength(2000) description?: string;

  /** Who to call. Defaults to the name on the account when it is left out. */
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
}
