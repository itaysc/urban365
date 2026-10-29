import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class UpsertOfficeDto {
  @IsOptional() @IsString() @MaxLength(80) label?: string;

  @IsString() @MinLength(2) @MaxLength(80) city!: string;

  @IsOptional() @IsString() @MaxLength(120) street?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) houseNumber?: number;

  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}
