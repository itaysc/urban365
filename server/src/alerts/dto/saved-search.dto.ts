import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const SECTIONS = ['forsale', 'rent', 'commercial'] as const;

export class SaveSearchDto {
  @IsString() @MaxLength(80) name!: string;

  @IsOptional() @IsIn(SECTIONS) section?: (typeof SECTIONS)[number];

  @IsOptional() @IsArray() @IsString({ each: true }) cities?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) propertyTypes?: string[];

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minRooms?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxRooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minSquareMeter?: number;

  @IsOptional() @IsBoolean() alert?: boolean;
}

/** Only the two things worth changing after the fact. */
export class UpdateSavedSearchDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsBoolean() alert?: boolean;
}
