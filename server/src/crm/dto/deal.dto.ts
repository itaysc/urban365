import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const DEAL_STAGES = [
  'qualified',
  'negotiation',
  'under_contract',
  'closed_won',
  'closed_lost',
] as const;
export type DealStageValue = (typeof DEAL_STAGES)[number];

export class CreateDealDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsIn(DEAL_STAGES) stage?: DealStageValue;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) price?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) commission?: number;
  @IsOptional() @IsDateString() expectedCloseAt?: string;
  @IsOptional() @IsString() leadId?: string;
  /** Who it is with. `''` unlinks, the way the other optional relations do. */
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() listingId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(500) lostReason?: string;
}

export class UpdateDealDto extends CreateDealDto {
  @IsOptional() @IsString() @MaxLength(200) declare title: string;
}

export class ListDealsQuery {
  @IsOptional() @IsIn(DEAL_STAGES) stage?: DealStageValue;
  /** Everything open for one person, which the customer's own page asks for. */
  @IsOptional() @IsString() customerId?: string;
}
