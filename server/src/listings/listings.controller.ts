import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator.js';
import { SearchListingsDto } from './dto/search-listings.dto.js';
import { ListingsService } from './listings.service.js';
import { SECTIONS, type Section } from '../yad2/yad2.types.js';

/** Narrow an untrusted query value, so an unknown section is ignored rather than thrown. */
const isSection = (value: unknown): value is Section =>
  typeof value === 'string' && (SECTIONS as readonly string[]).includes(value);

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
   * Pins for the map. Same filters as `search`, plus an optional viewport; returns
   * points rather than cards, since a map needs all of them at once and none of the
   * detail a card shows.
   */
  @Get('map')
  mapPoints(@Query() query: SearchListingsDto) {
    return this.listings.mapPoints(query);
  }

  /**
   * Places matching what has been typed, for the search box's dropdown.
   *
   * Declared before `:id` for the same reason `:id/phone` is — Nest matches routes in
   * declaration order, and `listings/:id` would otherwise swallow `listings/suggest`.
   *
   * Throttled, because it is called on every keystroke: generous enough that nobody
   * typing a city name will notice, tight enough that it is not a free scan of the
   * place list.
   */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('suggest')
  suggest(@Query('q') q?: string, @Query('section') section?: string) {
    return this.listings.suggest(q ?? '', isSection(section) ? section : undefined);
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
