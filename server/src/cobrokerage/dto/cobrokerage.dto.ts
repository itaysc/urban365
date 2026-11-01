import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RequestCoBrokerageDto {
  @IsString() listingId!: string;
  @IsString() customerId!: string;

  /** What the asking agent writes. The one place a human can say what a match cannot. */
  @IsOptional() @IsString() @MaxLength(1000) message?: string;

  /**
   * The share going to the agency that brought the buyer. Half by default, which is
   * the usual arrangement and the only one worth defaulting to.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(90) commissionSplit?: number;
}

export const CO_BROKERAGE_STAGES = [
  'agreed',
  'viewing',
  'negotiating',
  'signed',
  'completed',
  'fell_through',
] as const;

export type CoBrokerageStageValue = (typeof CO_BROKERAGE_STAGES)[number];

export class SetStageDto {
  @IsIn(CO_BROKERAGE_STAGES) stage!: CoBrokerageStageValue;
}

export class PostMessageDto {
  /** Long enough for the details of a deal, short enough not to be a document. */
  @IsString() @MaxLength(4000) body!: string;
}
