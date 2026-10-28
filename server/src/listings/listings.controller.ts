import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator.js';
import { SearchListingsDto } from './dto/search-listings.dto.js';
import { ListingsService } from './listings.service.js';

/** The public storefront: searchable without an account. */
@Public()
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  /** Faceted search across every agency we hold. */
  @Get('search')
  search(@Query() query: SearchListingsDto) {
    return this.listings.search(query);
  }

  /**
   * The contact number, revealed on request rather than shipped with the listing.
   *
   * Throttled: this is the one route that hands out a phone number, so it is the one
   * worth walking. Twenty a minute is far more than a person clicking "show number"
   * and far less than a useful harvest.
   *
   * Declared before `:id` — Nest matches in declaration order, and `listings/:id`
   * would otherwise swallow it.
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':id/phone')
  async phone(@Param('id') id: string) {
    const result = await this.listings.phoneFor(id);
    if (!result) throw new NotFoundException('לא נמצא מספר טלפון לנכס הזה.');
    return result;
  }

  /** Accepts our listing id, and for one release yad2's token, so old links survive. */
  @Get(':id')
  async byId(@Param('id') id: string) {
    const listing = await this.listings.findById(id);
    if (!listing) throw new NotFoundException(`No listing ${id}.`);
    return listing;
  }
}
