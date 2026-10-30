import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { SECTIONS, type Section } from '../../yad2/yad2.types.js';

export const CUSTOMER_KINDS = ['buyer', 'seller', 'both'] as const;
export type CustomerKindValue = (typeof CUSTOMER_KINDS)[number];

export class CreateCustomerDto {
  @IsString() @MaxLength(120) name!: string;

  /**
   * One of the two is required. A customer nobody can call is a note, not a customer —
   * the same rule the public enquiry form applies, for the same reason.
   */
  @ValidateIf((o: CreateCustomerDto) => !o.email) @IsString() @MaxLength(40) phone?: string;
  @ValidateIf((o: CreateCustomerDto) => !o.phone) @IsString() @MaxLength(200) email?: string;

  @IsOptional() @IsIn(CUSTOMER_KINDS) kind?: CustomerKindValue;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsString() assignedToId?: string;

  // ── the brief ───────────────────────────────────────────────────────────────
  // Deliberately the same shape as the public search's filters, so matching a customer
  // against what has come in is the ordinary search rather than a second implementation.

  @IsOptional() @IsIn(SECTIONS) lookingSection?: Section;

  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(80, { each: true })
  lookingCities?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(80, { each: true })
  lookingTypes?: string[];

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(30) minRooms?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(30) maxRooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minSquareMeter?: number;
}

/** Every field optional: a correction to one of them should not restate the rest. */
export class UpdateCustomerDto extends CreateCustomerDto {
  @IsOptional() @IsString() @MaxLength(120) declare name: string;
  @IsOptional() @IsString() @MaxLength(40) declare phone?: string;
  @IsOptional() @IsString() @MaxLength(200) declare email?: string;
}

export class ListCustomersQuery {
  @IsOptional() @IsIn(CUSTOMER_KINDS) kind?: CustomerKindValue;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
