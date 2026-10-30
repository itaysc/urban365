import { BadRequestException, Controller, Get, NotFoundException, Param, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { SearchListingsDto } from './dto/search-listings.dto.js';
import { ListingsService } from './listings.service.js';
import { EngagementService } from '../seller/engagement.service.js';
import { ConfigService } from '@nestjs/config';
import { VISITOR_COOKIE, VisitorService, setVisitorCookie } from '../visitor/visitor.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { Principal } from '../auth/types/principal.js';
import { SECTIONS, type Section } from '../yad2/yad2.types.js';

/** Narrow an untrusted query value, so an unknown section is ignored rather than thrown. */
const isSection = (value: unknown): value is Section =>
  typeof value === 'string' && (SECTIONS as readonly string[]).includes(value);

/** The public storefront: searchable without an account. */
@Public()
@Controller('listings')
export class ListingsController {
  private readonly isProduction: boolean;

  constructor(
    private readonly listings: ListingsService,
    private readonly engagement: EngagementService,
    private readonly visitors: VisitorService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('app.env') === 'production';
  }

  /**
   * Who is looking, as far as we can tell — for counting, never for identifying.
   *
   * A signed-out browser with no identifier is given one here, because the figure the
   * seller is shown is "people", and without an identifier there is no way to tell one
   * person opening a flat four times from four people opening it once. The line is
   * drawn at opening a particular property: that is something the person did on
   * purpose. Loading a page of search results mints nothing.
   */
  private async viewer(req: Request, res: Response, principal: Principal | null) {
    if (principal?.userId) return { userId: principal.userId, visitorId: null };

    const existing = (req.cookies as Record<string, string> | undefined)?.[VISITOR_COOKIE];
    if (await this.visitors.existing(existing)) return { userId: null, visitorId: existing };

    const visitor = await this.visitors.create();
    setVisitorCookie(res, visitor.visitorId, this.isProduction);
    return { userId: null, visitorId: visitor.visitorId };
  }

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
   * The city a coordinate falls in, so "near my location" can turn a browser's position
   * into the same search as picking that city by hand.
   *
   * Declared before `:id`, like the two above it.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('city-at')
  async cityAt(@Query('lat') lat?: string, @Query('lng') lng?: string) {
    const latitude = Number(lat);
    const longitude = Number(lng);

    // A coordinate off the planet is a caller mistake, not an empty answer.
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) {
      throw new BadRequestException('קו רוחב לא תקין.');
    }
    if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) {
      throw new BadRequestException('קו אורך לא תקין.');
    }

    return { city: await this.listings.cityAt(latitude, longitude) };
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
  async phone(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() principal: Principal | null,
  ) {
    const result = await this.listings.phoneFor(id);
    if (!result) throw new NotFoundException('לא נמצא מספר טלפון לנכס הזה.');

    // Counted after the number was actually found, so a miss does not register as
    // interest in a listing that never answered.
    await this.engagement.record(id, 'phone', await this.viewer(req, res, principal));
    return result;
  }

  /**
   * Streets inside one city, for the address box on both editors.
   *
   * Declared before `:id` — Nest matches in declaration order.
   */
  @Get('streets')
  streets(@Query('city') city: string | undefined, @Query('q') q: string | undefined) {
    if (!city?.trim()) return [];
    return this.listings.streetsIn(city, q ?? '');
  }

  /**
   * Neighbourhoods inside one city, for the box on the publish form.
   *
   * Declared before `:id` — Nest matches in declaration order.
   */
  @Get('neighborhoods')
  neighborhoods(@Query('city') city: string | undefined, @Query('q') q: string | undefined) {
    if (!city?.trim()) return [];
    return this.listings.neighborhoodsIn(city, q ?? '');
  }

  /** Accepts our listing id, and for one release yad2's token, so old links survive. */
  @Get(':id')
  async byId(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() principal: Principal | null,
  ) {
    const listing = await this.listings.findById(id);
    if (!listing) throw new NotFoundException(`No listing ${id}.`);

    // This route is what opening a listing calls, so it is where a view happens.
    await this.engagement.record(listing.id, 'view', await this.viewer(req, res, principal));
    return listing;
  }
}
