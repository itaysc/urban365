import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LlmService } from '../llm/llm.service.js';
import { PRICE_BRIEF_LLM } from '../llm/llm.defaults.js';
import { median } from '../seo/stats.js';
import { FROM_A_VISIBLE_AGENCY } from './on-the-market.js';
import { listingOnStreet } from './street-match.js';
import {
  positionAgainstAsking,
  positionAgainstSales,
  readQuestions,
  type PricePosition,
} from './price-position.js';
import { MarketContextService } from '../valuation/market-context.service.js';
import { PlaceService } from '../valuation/place.service.js';
import { ValuationService, type ValuationRequest } from '../valuation/valuation.service.js';
import type { Condition, Subject } from '../valuation/adjustments.js';

/**
 * The gap between what an ad asks and what similar flats sold for.
 *
 * One listing at a time is the valuation the rest of the site already runs. A page of
 * cards asks for several, so the answer is remembered for an hour: the sales do not
 * move in that time, and the ad's price is part of the key, so a cut is seen at once.
 *
 * The model is asked only when somebody opens the listing, and only for the questions.
 * If it is off, or it writes a number, the headline still stands. That headline is
 * `positionAgainstSales`.
 */

const CACHE_MS = 60 * 60 * 1000;
const SALES_BUDGET_MS = 8_000;
const BATCH = 36;

export interface PriceCheck extends PricePosition {
  id: string;
  questions: string[];
}

interface ListingRow {
  id: string;
  section: string;
  price: number | null;
  rooms: number | null;
  squareMeter: number | null;
  floor: number | null;
  buildingTopFloor: number | null;
  balconiesCount: number | null;
  parkingSpacesCount: number | null;
  propertyCondition: string | null;
  city: string | null;
  street: string | null;
  latitude: number | null;
  longitude: number | null;
  gush: number | null;
  chelka: number | null;
  amenities: string[];
  description: string | null;
  lastPriceDropAmount: number | null;
}

const SELECT = {
  id: true,
  section: true,
  price: true,
  rooms: true,
  squareMeter: true,
  floor: true,
  buildingTopFloor: true,
  balconiesCount: true,
  parkingSpacesCount: true,
  propertyCondition: true,
  city: true,
  street: true,
  latitude: true,
  longitude: true,
  gush: true,
  chelka: true,
  amenities: true,
  description: true,
  lastPriceDropAmount: true,
} as const;

@Injectable()
export class PriceCheckService {
  private readonly logger = new Logger(PriceCheckService.name);
  private readonly cache = new Map<string, { at: number; value: PriceCheck | null }>();
  private readonly briefs = new Map<string, { at: number; questions: string[] }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly valuation: ValuationService,
    private readonly market: MarketContextService,
    private readonly places: PlaceService,
    private readonly llm: LlmService,
  ) {}

  async forIds(ids: string[]): Promise<PriceCheck[]> {
    const unique = [...new Set(ids)].slice(0, BATCH);
    const out: PriceCheck[] = [];
    let cursor = 0;

    const worker = async () => {
      while (cursor < unique.length) {
        const id = unique[cursor++];
        const check = await this.forId(id, false).catch(() => null);
        if (check) out.push(check);
      }
    };

    await Promise.all(Array.from({ length: Math.min(3, unique.length) }, worker));
    const order = new Map(unique.map((id, index) => [id, index]));
    return out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  async forId(id: string, brief: boolean): Promise<PriceCheck | null> {
    const row = await this.load(id);
    if (!row) return null;

    const key = `${row.id}:${row.price}:${row.rooms}:${row.squareMeter}`;
    const hit = this.cache.get(key);
    const fresh = hit && Date.now() - hit.at < CACHE_MS ? hit.value : undefined;
    const check = fresh !== undefined ? fresh : await this.compute(row, key);
    if (!check) return null;
    if (!brief) return { ...check, questions: [] };

    const remembered = this.briefs.get(key);
    if (remembered && Date.now() - remembered.at < CACHE_MS) {
      return { ...check, questions: remembered.questions };
    }
    const questions = await this.questions(row, check);
    this.briefs.set(key, { at: Date.now(), questions });
    return { ...check, questions };
  }

  private async load(id: string): Promise<ListingRow | null> {
    return this.prisma.listing.findFirst({
      where: {
        id,
        status: 'published',
        delistedAt: null,
        section: 'forsale',
        AND: [FROM_A_VISIBLE_AGENCY],
      },
      select: SELECT,
    });
  }

  private async compute(row: ListingRow, key: string): Promise<PriceCheck | null> {
    const sales = await this.sales(row);
    if (sales) {
      const check = { id: row.id, ...sales, questions: [] };
      this.cache.set(key, { at: Date.now(), value: check });
      return check;
    }

    const asking = await this.asking(row);
    const check = asking ? { id: row.id, ...asking, questions: [] } : null;
    // A timed-out valuation is not "no sales". Remembering the ads in its place would
    // hide the sales for an hour.
    if (sales !== undefined) this.cache.set(key, { at: Date.now(), value: check });
    return check;
  }

  /**
   * The sale range, or `null` when there isn't one.
   *
   * `undefined` means we stopped waiting. The caller can still show the ads, and the
   * next open tries the sales again.
   */
  private async sales(row: ListingRow): Promise<PricePosition | null | undefined> {
    if (!row.city || row.latitude === null || row.longitude === null) return null;
    if (row.rooms === null || row.rooms <= 0 || row.squareMeter === null || row.squareMeter <= 0) return null;
    if (row.price === null || row.price <= 0) return null;

    const priced = row.price;
    const attempt = this.saleRange(row, priced).then(
      (position) => ({ position, giveUp: false as const }),
      (error: Error) => {
        this.logger.warn(`Price check for ${row.id} failed: ${error.message}`);
        return { position: null, giveUp: true as const };
      },
    );
    const winner = await Promise.race([
      attempt,
      new Promise<{ position: null; giveUp: true }>((resolve) =>
        setTimeout(() => resolve({ position: null, giveUp: true }), SALES_BUDGET_MS),
      ),
    ]);

    // A timeout or a failure is not "no sales". The ads can still be shown, and the
    // next open tries the sales again rather than remembering the miss.
    if (winner.giveUp) return undefined;
    return winner.position;
  }

  private async saleRange(row: ListingRow, asking: number): Promise<PricePosition | null> {
    const city = row.city as string;
    const place = await this.places.find(city);
    const context = await this.market.stateFor(city, row.latitude as number, row.longitude as number, row.rooms as number);

    const request: ValuationRequest = {
      city,
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      gush: row.gush,
      chelka: row.chelka,
      settlementCode: place?.settlementCode ?? null,
      rooms: row.rooms as number,
      area: row.squareMeter as number,
      attributes: attributesOf(row),
      market: context.verdict.state,
    };

    const result = await this.valuation.value(request);
    if (!result.range) return null;

    return positionAgainstSales(asking, {
      low: result.range.low,
      high: result.range.high,
      expected: result.range.expected,
      count: result.workings.comps.length,
      thin: result.verdict === 'indicative',
    });
  }

  /** Other ads on this street, once the sales cannot answer. */
  private async asking(row: ListingRow): Promise<PricePosition | null> {
    if (!row.city || !row.street || row.price === null || row.price <= 0) return null;

    const rooms =
      row.rooms !== null && row.rooms > 0
        ? { gte: row.rooms - 0.5, lte: row.rooms + 0.5 }
        : undefined;

    const rows = await this.prisma.listing.findMany({
      where: {
        status: 'published',
        delistedAt: null,
        section: 'forsale',
        city: { equals: row.city, mode: 'insensitive' },
        price: { gt: 0 },
        id: { not: row.id },
        ...(rooms ? { rooms } : {}),
        AND: [FROM_A_VISIBLE_AGENCY],
      },
      select: { street: true, price: true },
      take: 400,
    });

    const prices = rows
      .filter((other) => other.street && other.price && listingOnStreet(other.street, row.street as string))
      .map((other) => other.price as number);

    const mid = median(prices);
    if (mid === null) return null;
    return positionAgainstAsking(row.price, mid, prices.length);
  }

  private async questions(row: ListingRow, check: PriceCheck): Promise<string[]> {
    if (!this.llm.isConfigured()) return [];

    const known = new Set(row.amenities.map(fold));
    const missing = [
      row.parkingSpacesCount ? null : 'חניה',
      known.has(fold('ממ"ד')) ? null : 'ממ"ד',
      known.has(fold('מרפסת')) || (row.balconiesCount ?? 0) > 0 ? null : 'מרפסת',
      known.has(fold('מעלית')) ? null : 'מעלית',
      row.propertyCondition ? null : 'מצב הדירה',
    ].filter((item): item is string => item !== null);

    try {
      const response = await this.llm.ask({
        ...PRICE_BRIEF_LLM,
        systemMsg: [
          'אתה עוזר לקונה לפני ביקור בדירה.',
          'החזר JSON בלבד: {"questions": ["...","..."]}.',
          'שתיים או שלוש שאלות קצרות לסוכן, בעברית, על מה שהמודעה לא אומרת.',
          'אסור לציין מחיר, אחוז, שקלים או ספרה. אסור להמציא פרט שלא מופיע.',
        ].join('\n'),
        prompt: JSON.stringify({
          comparison: check.basis === 'sales' ? 'יש השוואה לעסקאות' : 'אין מספיק עסקאות, ההשוואה היא למודעות',
          stance: check.stance,
          groundFloor: row.floor !== null && row.floor <= 1,
          missing,
          priceWasCut: row.lastPriceDropAmount !== null && row.lastPriceDropAmount > 0,
          description: (row.description ?? '').replace(/\s+/gu, ' ').trim().slice(0, 500),
        }),
      });
      return readQuestions(response.data);
    } catch (error) {
      this.logger.warn(`Price brief failed: ${(error as Error).message}`);
      return [];
    }
  }
}

function fold(value: string): string {
  return value.replace(/[״"]/gu, '"').trim();
}

function conditionOf(row: ListingRow): Condition | null {
  const text = `${row.propertyCondition ?? ''} ${row.amenities.join(' ')}`;
  if (/משופצ/u.test(text)) return 'renovated';
  if (/שיפוץ/u.test(text) && /דרוש|נדרש|יסוד/u.test(text)) return 'needs-renovation';
  return null;
}

/**
 * Only what the ad actually says.
 *
 * An amenity that is absent from the list was not denied. Sending `false` would
 * mark every scraped flat as having no lift, which the valuation then prices.
 */
function attributesOf(row: ListingRow): Subject {
  const known = new Set(row.amenities.map(fold));
  const said = (label: string): boolean | null => (known.has(fold(label)) ? true : null);

  return {
    floor: row.floor,
    topFloor: row.buildingTopFloor,
    hasLift: said('מעלית'),
    condition: conditionOf(row),
    hasParking: row.parkingSpacesCount !== null && row.parkingSpacesCount > 0 ? true : null,
    hasStorage: said('מחסן'),
    hasBalcony: said('מרפסת') === true || (row.balconiesCount ?? 0) > 0 ? true : null,
    hasMamad: said('ממ"ד'),
    aspect: null,
    buildingState: null,
    renewal: null,
  };
}
