import { Type } from 'class-transformer';
import { IsIn, IsInt } from 'class-validator';
import { LISTING_PACKAGES, type PackageSize } from '../listing-packages.js';

const SIZES = LISTING_PACKAGES.map((pack) => pack.size);

export class BuyListingPackageDto {
  @Type(() => Number)
  @IsInt()
  @IsIn(SIZES)
  size!: PackageSize;
}
