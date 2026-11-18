import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import {
  MORTGAGE_CASE_STAGES,
  type MortgageCaseStageValue,
} from '../../mortgage-crm/dto/mortgage-case.dto.js';

export class FindMortgageCasesDto {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsIn(MORTGAGE_CASE_STAGES) stage?: MortgageCaseStageValue;
}

export class MortgageCaseIdDto {
  @IsString() @MaxLength(40) id!: string;
}

export class CreateMortgageCaseToolDto {
  @IsOptional() @IsIn(MORTGAGE_CASE_STAGES) stage?: MortgageCaseStageValue;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) requestedAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) propertyValue?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) equityAvailable?: number;
  @IsOptional() @IsString() @MaxLength(80) propertyCity?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(40) loanTermYears?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateMortgageCaseStageDto {
  @IsString() @MaxLength(40) id!: string;
  @IsIn(MORTGAGE_CASE_STAGES) stage!: MortgageCaseStageValue;
}

export class FindBankerContactsDto {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
}

export class CreateBankerContactToolDto {
  @IsString() @MaxLength(120) bankName!: string;
  @IsOptional() @IsString() @MaxLength(120) branch?: string;
  @IsString() @MaxLength(120) name!: string;
  @ValidateIf((o: CreateBankerContactToolDto) => !o.email) @IsString() @MaxLength(40) phone?: string;
  @ValidateIf((o: CreateBankerContactToolDto) => !o.phone) @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
