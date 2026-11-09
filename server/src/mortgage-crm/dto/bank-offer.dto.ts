import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateBankOfferDto {
  @IsString() @MaxLength(120) bankName!: string;
  @IsOptional() @IsString() @MaxLength(120) track?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) interestRate?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) monthlyPayment?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) totalRepayment?: number;
  @IsOptional() @IsDateString() receivedAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateBankOfferDto extends CreateBankOfferDto {
  @IsOptional() @IsString() @MaxLength(120) declare bankName: string;
}
