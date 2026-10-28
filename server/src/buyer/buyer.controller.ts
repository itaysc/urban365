import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { BuyerService } from './buyer.service.js';
import { SaveListingDto, UpdateBuyerProfileDto } from './dto/buyer.dto.js';

/**
 * A buyer's own data. No TenantGuard: these rows belong to a person, not an agency, and
 * a buyer has no agency at all — the row-level policies scope them by
 * `app.current_user_id`, which the interceptor sets for any authenticated request.
 */
@Controller('me')
export class BuyerController {
  constructor(private readonly buyer: BuyerService) {}

  @Get('profile')
  profile() {
    return this.buyer.profile();
  }

  @Patch('profile')
  updateProfile(@Body() dto: UpdateBuyerProfileDto) {
    return this.buyer.updateProfile(dto);
  }

  @Get('saved')
  saved() {
    return this.buyer.savedListings();
  }

  /** Which of the given ids are saved — one call for a whole page of search results. */
  @Get('saved/among')
  async among(@Query('ids') ids?: string) {
    const list = (ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    this.buyer.assertNotEmpty(list);
    return { saved: await this.buyer.savedIdsAmong(list) };
  }

  @Post('saved')
  save(@Body() dto: SaveListingDto) {
    return this.buyer.save(dto);
  }

  @Patch('saved/:listingId')
  setNote(@Param('listingId') listingId: string, @Body() body: { note?: string }) {
    return this.buyer.setNote(listingId, body.note);
  }

  @Delete('saved/:listingId')
  unsave(@Param('listingId') listingId: string) {
    return this.buyer.unsave(listingId);
  }
}
