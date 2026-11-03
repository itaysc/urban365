import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import type { Aspect, BuildingState, Condition, Renewal } from '../adjustments.js';

export const CONDITIONS = ['renovated', 'good', 'fair', 'needs-renovation'] as const;
export const ASPECTS = ['open', 'ordinary', 'blocked'] as const;
export const BUILDING_STATES = ['well-kept', 'ordinary', 'neglected'] as const;
export const RENEWALS = ['approved', 'none', 'in-works'] as const;

/**
 * The parts of the data sheet that describe the flat rather than locate it.
 *
 * Every one is optional, and an omitted field is genuinely unknown — it is not read
 * as "no". The distinction reaches all the way into `adjustments.ts`, where a null
 * contributes nothing and a false costs the flat money.
 */
export class AttributesDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(-2) @Max(80)
  floor?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(80)
  topFloor?: number;

  @IsOptional() @IsBoolean() hasLift?: boolean;
  @IsOptional() @IsBoolean() hasParking?: boolean;
  @IsOptional() @IsBoolean() hasStorage?: boolean;
  @IsOptional() @IsBoolean() hasBalcony?: boolean;
  @IsOptional() @IsBoolean() hasMamad?: boolean;

  @IsOptional() @IsIn(CONDITIONS) condition?: Condition;
  @IsOptional() @IsIn(ASPECTS) aspect?: Aspect;
  @IsOptional() @IsIn(BUILDING_STATES) buildingState?: BuildingState;
  @IsOptional() @IsIn(RENEWALS) renewal?: Renewal;
}

/**
 * A request to value one flat.
 *
 * `area` is **registered** area, which the form says at the field. Registered versus
 * built versus "including the balcony" is an 8–12% difference that never looks wrong
 * on the way in and is wrong all the way through afterwards, so the convention is
 * named rather than inferred.
 */
export class ValuePropertyDto {
  @IsString() @MaxLength(80) city!: string;

  @IsOptional() @IsString() @MaxLength(120) street?: string;
  @IsOptional() @IsString() @MaxLength(120) neighborhood?: string;

  /** Supplied by the client's own place lookup, which has already geocoded the address. */
  @Type(() => Number) @IsLatitude() latitude!: number;
  @Type(() => Number) @IsLongitude() longitude!: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) gush?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) chelka?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) settlementCode?: number;

  @Type(() => Number) @IsNumber() @Min(1) @Max(15) rooms!: number;

  @Type(() => Number) @IsInt() @Min(20) @Max(400) area!: number;

  @IsOptional() @ValidateNested() @Type(() => AttributesDto)
  attributes?: AttributesDto;
}
