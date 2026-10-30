import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { IsString, MaxLength } from 'class-validator';
import { Public } from '../auth/decorators/public.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { Principal } from '../auth/types/principal.js';
import { ListingsService } from '../listings/listings.service.js';
import { SavesService, type SaveOwner } from './saves.service.js';
import { VISITOR_COOKIE, VisitorService, setVisitorCookie } from '../visitor/visitor.service.js';

export class SaveListingDto {
  @IsString() @MaxLength(40) listingId!: string;
}

/**
 * Saving a listing, with or without an account.
 *
 * Public, because requiring a sign-up before someone can keep track of a flat they
 * liked is how you lose both the flat and the sign-up.
 */
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('saves')
export class SavesController {
  private readonly isProduction: boolean;

  constructor(
    private readonly saves: SavesService,
    private readonly visitors: VisitorService,
    private readonly listings: ListingsService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('app.nodeEnv') === 'production';
  }

  /**
   * Who is saving — and, for a signed-out browser, a cookie if it does not have one.
   *
   * Issued on a save and on opening a listing, and nowhere else. Both are something the
   * person deliberately did to one property; loading a page of search results is not,
   * and does not mint anything.
   */
  private async ownerFor(
    req: Request,
    res: Response | null,
    principal: Principal | null,
  ): Promise<SaveOwner | null> {
    if (principal?.userId) return this.saves.profileFor(principal.userId);

    const cookies = req.cookies as Record<string, string> | undefined;
    const existing = await this.visitors.existing(cookies?.[VISITOR_COOKIE]);
    if (existing) return existing;

    // No response to write to means this is a read: do not mint an identity for someone
    // who is only looking.
    if (!res) return null;

    const visitor = await this.visitors.create();
    setVisitorCookie(res, visitor.visitorId, this.isProduction);

    return visitor;
  }

  /** Everything the caller has saved — their own list, account or not. */
  @Get()
  async list(@Req() req: Request, @CurrentUser() principal: Principal | null) {
    const owner = await this.ownerFor(req, null, principal);
    if (!owner) return { items: [] };

    return { items: await this.listings.cardsByIds(await this.saves.listIds(owner)) };
  }

  /**
   * Just the number, for the header badge.
   *
   * Separate from the list because the header asks on every page and does not need a
   * single listing to draw a count.
   */
  @Get('count')
  async count(@Req() req: Request, @CurrentUser() principal: Principal | null) {
    const owner = await this.ownerFor(req, null, principal);
    return { count: owner ? await this.saves.totalFor(owner) : 0 };
  }

  @Post()
  async save(
    @Body() dto: SaveListingDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() principal: Principal | null,
  ) {
    const owner = await this.ownerFor(req, res, principal);
    return this.saves.save(owner!, dto.listingId);
  }

  @Delete(':listingId')
  async unsave(
    @Param('listingId') listingId: string,
    @Req() req: Request,
    @CurrentUser() principal: Principal | null,
  ) {
    const owner = await this.ownerFor(req, null, principal);
    if (!owner) return { saved: false, savedCount: 0 };
    return this.saves.unsave(owner, listingId);
  }

  /** Which of these the caller has saved — one request for a whole page of results. */
  @Get('among')
  async among(
    @Query('ids') ids: string | undefined,
    @Req() req: Request,
    @CurrentUser() principal: Principal | null,
  ) {
    const listingIds = (ids ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200);
    const owner = await this.ownerFor(req, null, principal);
    return { saved: await this.saves.savedAmong(owner, listingIds) };
  }
}
