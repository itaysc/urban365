import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SECTIONS, type Section } from '../../yad2/yad2.types.js';

export const SORTS = [
  'newest',
  'oldest',
  'price-asc',
  'price-desc',
  'price-per-sqm-asc',
  'price-per-sqm-desc',
  'rooms-asc',
  'rooms-desc',
  'size-asc',
  'size-desc',
] as const;

export type Sort = (typeof SORTS)[number];

/** `?city=a&city=b` and `?city=a,b` both arrive as a list. */
const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : [value];
  const out = raw
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter(Boolean);
  return out.length > 0 ? out : undefined;
};

const toBool = ({ value }: { value: unknown }): boolean | undefined =>
  value === undefined || value === '' ? undefined : value === true || value === 'true' || value === '1';

export class SearchListingsDto {
  @IsOptional()
  @IsIn(SECTIONS)
  section?: Section;

  /** yad2 agency id, to scope a search to one agency. */
  @IsOptional()
  @IsString()
  agencyId?: string;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  city?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  neighborhood?: string[];

  /**
   * A region — "מרכז והשרון". Resolved to the cities it covers before the query runs,
   * so it behaves exactly like naming those cities by hand.
   */
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  district?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  propertyType?: string[];

  /** Every one listed must be present — "has a lift AND a safe room". */
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPrice?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPricePerSqm?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPricePerSqm?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minRooms?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxRooms?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minSquareMeter?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxSquareMeter?: number;

  /** Free text over description, street, city and neighbourhood. */
  @IsOptional()
  @IsString()
  q?: string;

  /**
   * Only apartments sold by the developer. Absent means every listing, new or not —
   * "all apartments" is the default rather than a third state to ask for.
   */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isNew?: boolean;

  /** Delisted listings are excluded unless this is set. */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeDelisted?: boolean;

  @IsOptional()
  @IsIn(SORTS)
  sort?: Sort;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;

  /** Adds city / property-type / amenity counts for the current filters. */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  facets?: boolean;

  // ── map viewport ──────────────────────────────────────────────────────────
  // Set only by the map. Omitted entirely, the search is unbounded as before, so the
  // list view is unaffected.
  @IsOptional() @Type(() => Number) @IsLatitude() minLat?: number;
  @IsOptional() @Type(() => Number) @IsLatitude() maxLat?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() minLng?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() maxLng?: number;
}
