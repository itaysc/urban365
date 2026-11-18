import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SECTIONS } from '../../yad2/yad2.types.js';
import { AttributesDto } from '../../valuation/dto/value-property.dto.js';

const BUYERS = ['first', 'upgrader', 'investor'] as const;
const TRACKS = ['fixed', 'fixedLinked', 'prime', 'variable5', 'variable5Linked'] as const;
const PRESETS = ['thirds', 'calm', 'prime'] as const;

export class ListingIdDto {
  @IsString() @MinLength(8) @MaxLength(40) listingId!: string;
}

export class ResolvePlaceDto {
  @IsString() @MinLength(2) @MaxLength(80) text!: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
}

export class AreaPricesDto {
  @IsString() @MinLength(2) @MaxLength(80) city!: string;
  @IsOptional() @IsString() @MaxLength(80) neighborhood?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(15) rooms?: number;
}

export class StreetHistoryDto {
  @IsString() @MinLength(2) @MaxLength(80) city!: string;
  @IsString() @MinLength(2) @MaxLength(80) street!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(15) rooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(25) years?: number;
}

export class EstimateValueDto {
  @IsString() @MinLength(2) @MaxLength(80) city!: string;
  @IsOptional() @IsString() @MaxLength(120) street?: string;
  @Type(() => Number) @IsNumber() @Min(1) @Max(15) rooms!: number;
  @Type(() => Number) @IsInt() @Min(20) @Max(400) area!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) gush?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) chelka?: number;
  @IsOptional() @ValidateNested() @Type(() => AttributesDto) attributes?: AttributesDto;
}

export class MortgagePlanDto {
  @Type(() => Number) @IsInt() @Min(1) price!: number;
  @Type(() => Number) @IsInt() @Min(0) equity!: number;
  @IsIn(BUYERS) buyer!: (typeof BUYERS)[number];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(20) rate?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) years?: number;
}

export class AffordabilityDto {
  @Type(() => Number) @IsInt() @Min(0) income!: number;
  @Type(() => Number) @IsInt() @Min(0) equity!: number;
  @IsIn(BUYERS) buyer!: (typeof BUYERS)[number];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(20) rate?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) years?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) living?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) car?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) insurance?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) education?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) debts?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) other?: number;
}

export class MixPartDto {
  @IsIn(TRACKS) key!: (typeof TRACKS)[number];
  @Type(() => Number) @IsInt() @Min(0) amount!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(20) annualRate!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(30) years!: number;
}

export class CompareMixDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) loan?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) years?: number;
  @IsOptional() @IsIn(PRESETS) preset?: (typeof PRESETS)[number];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MixPartDto) parts?: MixPartDto[];
}

export class ArticleDto {
  @IsString() @MinLength(2) @MaxLength(120) slug!: string;
}

export class OpenPageDto {
  @IsString() @MaxLength(40) kind!: string;
  @IsOptional() @IsString() @MaxLength(40) section?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) price?: number;
  @IsOptional() @IsString() @MaxLength(120) slug?: string;
}

export class DraftListingDto {
  @IsIn(SECTIONS) section!: (typeof SECTIONS)[number];
  @IsString() @MinLength(2) @MaxLength(80) city!: string;
  @Type(() => Number) @IsInt() @Min(1) price!: number;
  @Type(() => Number) @IsNumber() @Min(0) rooms!: number;
  @IsOptional() @IsString() @MaxLength(120) street?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) houseNumber?: number;
  @IsOptional() @IsString() @MaxLength(120) neighborhood?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) squareMeter?: number;
  @IsOptional() @Type(() => Number) @IsInt() floor?: number;
  @IsOptional() @IsString() @MaxLength(80) propertyType?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
