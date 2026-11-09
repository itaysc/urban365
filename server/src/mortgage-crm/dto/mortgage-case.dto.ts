import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const MORTGAGE_CASE_STAGES = [
  'new_request',
  'consultation',
  'documents',
  'sent_to_banks',
  'approved_in_principle',
  'signed',
  'lost',
] as const;
export type MortgageCaseStageValue = (typeof MORTGAGE_CASE_STAGES)[number];

export class CreateMortgageCaseDto {
  @IsOptional() @IsIn(MORTGAGE_CASE_STAGES) stage?: MortgageCaseStageValue;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() assignedToId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) requestedAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) propertyValue?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) equityAvailable?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) monthlyIncomePrimary?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) monthlyIncomeSecondary?: number;
  @IsOptional() @IsString() @MaxLength(80) employmentType?: string;
  @IsOptional() @IsString() @MaxLength(80) propertyCity?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(40) loanTermYears?: number;
  @IsOptional() @IsString() @MaxLength(80) riskPreference?: string;

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateMortgageCaseDto extends CreateMortgageCaseDto {}
