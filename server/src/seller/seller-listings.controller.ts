import {
  Body, Controller, Delete, Get, Param, Patch, Post,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { Principal } from '../auth/types/principal.js';
import { CreateSellerListingDto, RemoveListingDto, SellerListingDto } from './dto/seller-listing.dto.js';
import { SellerListingsService } from './seller-listings.service.js';
import { SellerStatsService } from './seller-stats.service.js';

/**
 * A private seller's own listings.
 *
 * No `@Public()` and no `TenantGuard`: signing in is required, belonging to an agency
 * is not. The global JWT guard is what enforces the first.
 */
@Controller('me/listings')
export class SellerListingsController {
  constructor(
    private readonly listings: SellerListingsService,
    private readonly statsService: SellerStatsService,
  ) {}

  @Get()
  list(@CurrentUser() me: Principal) {
    return this.listings.list(me.userId);
  }

  /** The figures for everything this seller has published. */
  @Get('stats')
  stats(@CurrentUser() me: Principal) {
    return this.statsService.forSeller(me.userId);
  }

  @Get(':id')
  byId(@CurrentUser() me: Principal, @Param('id') id: string) {
    return this.listings.byId(me.userId, id);
  }

  // Each write geocodes, which calls a free service run by somebody else.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() me: Principal, @Body() dto: CreateSellerListingDto) {
    return this.listings.create(me.userId, dto);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Patch(':id')
  update(@CurrentUser() me: Principal, @Param('id') id: string, @Body() dto: SellerListingDto) {
    return this.listings.update(me.userId, id, dto);
  }

  /**
   * Taking it off the market, which is not deleting it — hence a POST.
   *
   * It answered `DELETE :id` until there was a real delete to put there, and the two
   * are different enough that a caller should not be able to confuse them: one is
   * reversible from the same screen, the other is not reversible at all.
   */
  @Post(':id/archive')
  archive(@CurrentUser() me: Principal, @Param('id') id: string) {
    return this.listings.archive(me.userId, id);
  }

  /** Hidden from every listing. The row stays, with the reason they gave. */
  @Post(':id/remove')
  remove(@CurrentUser() me: Principal, @Param('id') id: string, @Body() dto: RemoveListingDto) {
    return this.listings.remove(me.userId, id, dto.reason);
  }

  @Post(':id/publish')
  publish(@CurrentUser() me: Principal, @Param('id') id: string) {
    return this.listings.publish(me.userId, id);
  }

  @Post(':id/images')
  // 8 MB: a phone photo, not a raw file. The cap is here as well as in the browser
  // because the browser's is a convenience and this one is the rule.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  addImage(
    @CurrentUser() me: Principal,
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer },
    // A multipart text field, so it arrives as a string or not at all.
    @Body('position') position?: string,
  ) {
    const slot = position === undefined ? undefined : Number(position);
    return this.listings.addImage(me.userId, id, file, slot);
  }

  @Delete(':id/images/:imageId')
  removeImage(
    @CurrentUser() me: Principal,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.listings.removeImage(me.userId, id, imageId);
  }
}
