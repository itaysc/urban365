import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { SECTIONS, type Section } from '../yad2.types.js';

export class ScrapeAgencyDto {
  /** An agency number ("6816047") or any yad2 agency URL. */
  @IsString()
  @MinLength(1)
  input!: string;

  @IsOptional()
  @IsIn(SECTIONS)
  section?: Section;

  /** Skip the cache and scrape again. */
  @IsOptional()
  @IsBoolean()
  refresh?: boolean;
}
