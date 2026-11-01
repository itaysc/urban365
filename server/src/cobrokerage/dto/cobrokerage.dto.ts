import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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
