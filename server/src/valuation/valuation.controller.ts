import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { Principal } from '../auth/types/principal.js';

import { ValuePropertyDto, type AttributesDto } from './dto/value-property.dto.js';
import { ValuationService, type ValuationRequest } from './valuation.service.js';
import { MarketContextService } from './market-context.service.js';
import { PlaceService } from './place.service.js';
import type { Subject as Attributes } from './adjustments.js';

/**
 * The valuation endpoint.
 *
 * Behind a sign-in, deliberately. One request does real work — a radius query over the
 * deals table, a comp set, and a row written for every answer including the refusals —
 * and every answer is an estimate of someone's home that we keep, so it belongs to an
 * account rather than to an anonymous session. The throttles below are the second line
 * rather than the first.
 *
 * What it returns is the range, the market context and the workings. It deliberately
 * does **not** return a single headline number without its range attached: a point
 * estimate travels further than its own caveats, and a seller who screenshots one
 * will hold us to it.
 */
@Controller('valuation')
export class ValuationController {
  constructor(
    private readonly valuation: ValuationService,
    private readonly context: MarketContextService,
    private readonly places: PlaceService,
  ) {}

  /**
   * Where to open the map, and which settlement the registry files this town under.
   *
   * The form asks for a town and the estimate needs a point; this is the join. It
   * comes out of our own deals table rather than a geocoder, so it costs a query
   * and no outside request.
   */
  @Get('place')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async place(@Query('city') city?: string) {
    if (!city || city.trim() === '') throw new BadRequestException('city is required');

    const place = await this.places.find(city);
    // A town we have never recorded a sale in is a town we cannot value.
    return place ?? { settlementCode: null };
  }

  /**
   * Where a street is, so choosing one can move the map to it.
   *
   * Answers only for streets in the register and remembers what it learns, which is
   * what keeps the geocoder behind it inside its terms — `PlaceService.locateStreet`
   * has the argument. A street it cannot place is not an error: the map stays where
   * it was and the person moves the pin themselves, which they have to do anyway.
   */
  @Get('street')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async street(@Query('city') city?: string, @Query('street') street?: string) {
    if (!city?.trim() || !street?.trim()) {
      throw new BadRequestException('city and street are required');
    }

    const point = await this.places.locateStreet(city, street);
    return point ?? { latitude: null, longitude: null };
  }

  /**
   * Throttled harder than a search: this is the expensive route on the site, and
   * nobody legitimately values twelve flats a minute.
   */
  @Post()
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  async value(@Body() dto: ValuePropertyDto, @CurrentUser() principal?: Principal) {
    const market = await this.context.stateFor(dto.city, dto.latitude, dto.longitude, dto.rooms);

    const request: ValuationRequest = {
      city: dto.city,
      latitude: dto.latitude,
      longitude: dto.longitude,
      gush: dto.gush ?? null,
      chelka: dto.chelka ?? null,
      settlementCode: dto.settlementCode ?? null,
      rooms: dto.rooms,
      area: dto.area,
      attributes: toAttributes(dto.attributes),
      market: market.verdict.state,
    };

    const result = await this.valuation.value(request);
    const id = await this.valuation.record(request, result, principal?.userId ?? null);

    return {
      id,
      verdict: result.verdict,
      range: result.range,
      /*
       * The comparables are computed and stored either way, and withheld here only
       * because the product chose to show the range alone for now. Returning them
       * later is a change to this object, not a rebuild — which is the whole reason
       * they are carried this far.
       */
      basis: {
        comps: result.workings.comps.length,
        effective: round(result.workings.effective),
        spread: round(result.workings.spread),
        asOf: result.workings.paramsBase,
        monthsExtrapolated: result.workings.monthsExtrapolated,
        quality: result.workings.quality?.parts ?? [],
      },
      market: {
        state: market.verdict.state,
        confident: market.verdict.confident,
        signals: market.verdict.signals,
        competing: market.competing,
      },
    };
  }
}

/**
 * The DTO's absent fields become explicit nulls.
 *
 * `adjustments.ts` distinguishes "no parking" from "did not say", and an undefined
 * arriving where it expects null would collapse the two. Writing every key out is
 * what keeps that distinction honest across the boundary.
 */
function toAttributes(dto: AttributesDto | undefined): Attributes {
  return {
    floor: dto?.floor ?? null,
    topFloor: dto?.topFloor ?? null,
    hasLift: dto?.hasLift ?? null,
    condition: dto?.condition ?? null,
    hasParking: dto?.hasParking ?? null,
    hasStorage: dto?.hasStorage ?? null,
    hasBalcony: dto?.hasBalcony ?? null,
    hasMamad: dto?.hasMamad ?? null,
    aspect: dto?.aspect ?? null,
    buildingState: dto?.buildingState ?? null,
    renewal: dto?.renewal ?? null,
  };
}

const round = (value: number): number => Math.round(value * 100) / 100;
