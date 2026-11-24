import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** A street's recorded sales. Rooms and the year narrow the list; they are not required. */
export class MarketHistoryQueryDto {
  @IsString() @MinLength(2) @MaxLength(80) city!: string;
  @IsString() @MinLength(2) @MaxLength(80) street!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(15) rooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(25) years?: number;
  /** One calendar year of the sales list. The yearly medians stay for the whole window. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1990) @Max(2100) year?: number;
}
