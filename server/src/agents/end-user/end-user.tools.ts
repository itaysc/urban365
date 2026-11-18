import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ListingsService, type SearchListing } from '../../listings/listings.service.js';
import { FROM_A_VISIBLE_AGENCY } from '../../listings/on-the-market.js';
import { SearchListingsDto } from '../../listings/dto/search-listings.dto.js';
import { SavesService } from '../../saves/saves.service.js';
import { SellerListingsService } from '../../seller/seller-listings.service.js';
import { SaveSearchDto } from '../../alerts/dto/saved-search.dto.js';
import { cityKey } from '../../listings/city-name.js';
import { listingPath } from '../../seo/listing-slug.js';
import { blogPost } from '../../seo/blog.js';
import { HOME_GUIDE } from '../../seo/home-guide.js';
import { summarise, byRooms, median, type StatRow } from '../../seo/stats.js';
import { cellRangeWithin } from '../../cadastre/parcel-index.js';
import { metresBetween } from '../../valuation/geo.js';
import { PlaceService } from '../../valuation/place.service.js';
import { MarketContextService } from '../../valuation/market-context.service.js';
import { ValuationService, type ValuationRequest } from '../../valuation/valuation.service.js';
import type { Subject } from '../../valuation/adjustments.js';
import {
  budget,
  defaultMix,
  mix,
  mixProblems,
  MIX_PRESETS,
  type MixProblem,
  plan,
  DEFAULT_RATE,
  DEFAULT_YEARS,
  type BuyerKind,
  type MixPart,
} from '../../mortgage/mortgage-math.js';
import { advise, DEFAULT_BUFFER_SHARE, DEFAULT_COST_GROWTH, NO_OUTGOINGS } from '../../mortgage/household.js';
import { AgentTool } from '../core/agent-tool.decorator.js';
import type { AgentCard, AgentContext, ToolResult } from '../core/agent.types.js';
import {
  AffordabilityDto,
  AreaPricesDto,
  ArticleDto,
  CompareMixDto,
  DraftListingDto,
  EstimateValueDto,
  ListingIdDto,
  MortgagePlanDto,
  OpenPageDto,
  ResolvePlaceDto,
  StreetHistoryDto,
} from './end-user.dto.js';
import {
  RESIDENTIAL_GROUPS,
  STREET_HISTORY_LIMIT,
  STREET_HISTORY_RADIUS_METRES,
  STREET_HISTORY_YEARS,
  listingOnStreet,
  pickStreet,
  streetHistoryCard,
  streetHistorySummary,
  type AskingPrices,
} from './street-history.js';
import { attachMortgageCalculator } from './mortgage-link.js';
import { pageHref, PAGE_LINKS } from './pages.js';

const SEARCH_OMIT = [
  'agencyId',
  'facets',
  'minLat',
  'maxLat',
  'minLng',
  'maxLng',
  'page',
  'pageSize',
  'includeDelisted',
];

const MARKET: Record<string, string> = {
  buyers: 'שוק של קונים',
  sellers: 'שוק של מוכרים',
  balanced: 'שוק מאוזן',
};

const VERDICT: Record<string, string> = {
  good: 'טווח סביר',
  indicative: 'טווח אינדיקטיבי, מעט עסקאות דומות',
  'too-thin': 'אין מספיק עסקאות דומות',
  'out-of-scope': 'מחוץ לטווח שאפשר להעריך',
  'no-comps': 'לא נמצאו עסקאות להשוואה',
};

/**
 * What the end-user assistant can do.
 *
 * A new capability is a method with `@AgentTool`. Discovery picks it up; the agent
 * definition does not list it. The method returns a short `summary` for the model
 * and, where the screen should draw something, `cards`.
 */
@Injectable()
export class EndUserToolsService {
  constructor(
    private readonly listings: ListingsService,
    private readonly saves: SavesService,
    private readonly seller: SellerListingsService,
    private readonly places: PlaceService,
    private readonly market: MarketContextService,
    private readonly valuation: ValuationService,
    private readonly prisma: PrismaService,
  ) {}

  @AgentTool({
    name: 'search_listings',
    description: 'חיפוש נכסים שמוצגים עכשיו, לפי עיר, שכונה, מחיר, חדרים, שטח וסוג.',
    audiences: ['end-user', 'agency'],
    group: 'search',
    dto: SearchListingsDto,
    omit: SEARCH_OMIT,
  })
  async searchListings(dto: SearchListingsDto): Promise<ToolResult> {
    const page = await this.listings.search({
      ...dto,
      agencyId: undefined,
      facets: undefined,
      includeDelisted: undefined,
      minLat: undefined,
      maxLat: undefined,
      minLng: undefined,
      maxLng: undefined,
      page: 1,
      pageSize: 5,
    });

    const cards = page.items.map(listingCard);
    const href = pageHref('search', {
      section: dto.section,
      city: dto.city?.[0],
      minPrice: dto.minPrice,
      maxPrice: dto.maxPrice,
      rooms: dto.minRooms,
    });

    if (page.total === 0) return { summary: 'לא נמצאו נכסים לפי הסינון הזה.', cards: [] };

    const lines = page.items.map((row) => listingLine(row)).join('\n');
    return {
      summary: `נמצאו ${page.total}. מוצגות ${page.items.length}:\n${lines}`,
      cards: href ? [...cards, { type: 'link', href, label: `כל ${page.total} התוצאות` }] : cards,
    };
  }

  @AgentTool({
    name: 'get_listing',
    description: 'פרטי נכס אחד שמוצג, כולל היסטוריית מחיר קצרה. בלי מספר טלפון.',
    audiences: ['end-user'],
    group: 'search',
    dto: ListingIdDto,
  })
  async getListing(dto: ListingIdDto): Promise<ToolResult> {
    const [card] = await this.listings.cardsByIds([dto.listingId]);
    if (!card) return { summary: 'הנכס לא נמצא, או שאינו מוצג.' };

    const detail = await this.prisma.listing.findUnique({
      where: { id: card.id },
      select: {
        description: true,
        priceChanges: {
          orderBy: { changedAt: 'desc' },
          take: 5,
          select: { previous: true, price: true, changedAt: true },
        },
      },
    });

    const history = (detail?.priceChanges ?? [])
      .map((change) => `${change.previous ?? '—'} → ${change.price} (${change.changedAt.toISOString().slice(0, 10)})`)
      .join('; ');
    const description = redactPhones(detail?.description ?? '').slice(0, 400);

    return {
      summary: [
        listingLine(card),
        description ? `תיאור: ${description}` : '',
        history ? `שינויי מחיר: ${history}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      cards: [listingCard(card)],
    };
  }

  @AgentTool({
    name: 'resolve_place',
    description:
      'מאתר את שם העיר, השכונה או הרחוב כפי שהם רשומים. רחוב נמצא גם כשסדר המילים הפוך, וגם עם מספר בית כמו ישראל נג׳ארה 9. השתמש לפני חיפוש, והמשך עם השם שהוחזר.',
    audiences: ['end-user'],
    group: 'search',
    dto: ResolvePlaceDto,
  })
  async resolvePlace(dto: ResolvePlaceDto): Promise<ToolResult> {
    const suggested = await this.listings.suggest(dto.text.trim());
    const streets = dto.city ? await this.namedStreets(dto.city, dto.text) : [];
    const neighborhoods = dto.city ? await this.listings.neighborhoodsIn(dto.city, dto.text) : [];

    const cities = suggested.cities.map((city) => city.value).join(', ') || 'אין';
    const hoods =
      [...suggested.neighborhoods.map((hood) => `${hood.value} (${hood.city})`), ...neighborhoods].slice(0, 8).join(', ') ||
      'אין';
    const districts = suggested.districts?.map((district) => district.value).join(', ') || 'אין';

    return {
      summary: `ערים: ${cities}\nשכונות: ${hoods}\nמחוזות: ${districts}\nרחובות: ${streets.join(', ') || 'אין'}`,
    };
  }

  @AgentTool({
    name: 'area_prices',
    description: 'מחיר אופייני למכירה בעיר או בשכונה, לפי המודעות שמוצגות עכשיו. לא רחוב ולא מחיר עסקה.',
    audiences: ['end-user', 'agency'],
    group: 'pricing',
    dto: AreaPricesDto,
  })
  async areaPrices(dto: AreaPricesDto): Promise<ToolResult> {
    const where: Prisma.ListingWhereInput = {
      status: 'published',
      delistedAt: null,
      section: 'forsale',
      city: dto.city,
      ...(dto.neighborhood ? { neighborhood: dto.neighborhood } : {}),
      ...(dto.rooms !== undefined ? { rooms: dto.rooms } : {}),
      AND: [FROM_A_VISIBLE_AGENCY],
    };

    const rows = await this.prisma.listing.findMany({
      where,
      select: {
        price: true,
        squareMeter: true,
        pricePerSquareMeter: true,
        rooms: true,
        neighborhood: true,
        propertyType: true,
      },
      take: 400,
    });

    const stats = summarise(rows);
    const bands = byRooms(rows).slice(0, 4);
    const place = await this.places.find(dto.city);
    const market = place
      ? MARKET[(await this.market.stateFor(dto.city, place.latitude, place.longitude, dto.rooms ?? 4)).verdict.state]
      : null;

    if (stats.priced === 0) return { summary: `אין מודעות עם מחיר עבור ${dto.city}.` };

    const whereText = [dto.city, dto.neighborhood, dto.rooms ? `${dto.rooms} חדרים` : ''].filter(Boolean).join(', ');
    const bandText = bands
      .map((band) => `${band.label}: חציון ${shekel(band.medianPrice)}, ${band.count} מודעות`)
      .join('\n');

    return {
      summary: [
        `מחירי ביקוש למכירה ב${whereText}, לפי ${stats.priced} מודעות (לא מחירי עסקה).`,
        `חציון ${shekel(stats.medianPrice)}, למ"ר ${shekel(stats.medianPricePerSqm)}.`,
        stats.typicalRange ? `הטווח המרכזי ${shekel(stats.typicalRange.low)}–${shekel(stats.typicalRange.high)}.` : '',
        market ? `מצב השוק באזור: ${market}.` : '',
        bandText,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  @AgentTool({
    name: 'street_price_history',
    description:
      'מחיר ברחוב: חציון שנתי של עסקאות שנרשמו ליד הרחוב, וגם חציון המודעות שמוצגות עכשיו. להיסטוריה ולשאלה על מחיר ממוצע לדירת מספר חדרים ברחוב. העבר rooms כשצוינו חדרים. מספר בית בסוף השם, כמו 9, הוא אותו רחוב.',
    audiences: ['end-user', 'agency'],
    group: 'pricing',
    dto: StreetHistoryDto,
  })
  async streetPriceHistory(dto: StreetHistoryDto): Promise<ToolResult> {
    const picked = await this.pickRegisteredStreet(dto.city, dto.street);
    const asked = dto.street.trim();
    if (!('name' in picked)) {
      const list = picked.choices.join(', ');
      return {
        summary: list
          ? `כמה רחובות מתאימים ב${dto.city}: ${list}. צריך את השם המדויק.`
          : `אין רחוב בשם ${asked} ב${dto.city} ברשימת הרחובות.`,
      };
    }

    const place = await this.places.find(dto.city);
    if (!place) return { summary: `לא מצאתי את ${dto.city} במרשם העסקאות.` };

    const point = await this.places.locateStreet(dto.city, picked.name);
    if (!point) {
      return { summary: `הרחוב ${picked.name} ב${dto.city} קיים, אבל אין לו נקודה, אז אי אפשר לבחור את העסקאות שסביבו.` };
    }

    const years = dto.years ?? STREET_HISTORY_YEARS;
    const since = new Date();
    since.setUTCFullYear(since.getUTCFullYear() - years);

    const cells = cellRangeWithin(point.latitude, point.longitude, STREET_HISTORY_RADIUS_METRES);
    const latSpan = STREET_HISTORY_RADIUS_METRES / 111_320;
    const lngSpan =
      STREET_HISTORY_RADIUS_METRES / (111_320 * Math.max(0.1, Math.cos((point.latitude * Math.PI) / 180)));

    const rows = await this.prisma.marketDeal.findMany({
      where: {
        settlementCode: place.settlementCode,
        cellLat: { gte: cells.minCellLat, lte: cells.maxCellLat },
        cellLng: { gte: cells.minCellLng, lte: cells.maxCellLng },
        latitude: { gte: point.latitude - latSpan, lte: point.latitude + latSpan },
        longitude: { gte: point.longitude - lngSpan, lte: point.longitude + lngSpan },
        dealDate: { gte: since },
        propertyGroup: { in: [...RESIDENTIAL_GROUPS] },
        inStats: true,
        isFullDeal: true,
        ...(dto.rooms !== undefined ? { rooms: dto.rooms } : {}),
      },
      orderBy: { dealDate: 'desc' },
      take: STREET_HISTORY_LIMIT,
      select: {
        dealDate: true,
        dealAmount: true,
        rooms: true,
        area: true,
        pricePerSqm: true,
        latitude: true,
        longitude: true,
      },
    });

    const deals = rows
      .filter(
        (row) =>
          row.latitude !== null &&
          row.longitude !== null &&
          metresBetween(point, { latitude: row.latitude, longitude: row.longitude }) <= STREET_HISTORY_RADIUS_METRES,
      )
      .map((row) => ({
        dealDate: row.dealDate,
        amount: Number(row.dealAmount),
        rooms: row.rooms,
        area: row.area,
        pricePerSqm: row.pricePerSqm,
      }));

    const asking = await this.askingOnStreet(place.settlement, dto.city, picked.name, dto.rooms);
    const history = {
      city: place.settlement,
      street: picked.name,
      years,
      deals,
      truncated: rows.length === STREET_HISTORY_LIMIT,
      rooms: dto.rooms,
      asking,
    };
    const card = streetHistoryCard(history);
    return {
      summary: streetHistorySummary(history),
      ...(card ? { cards: [card] } : {}),
    };
  }

  /**
   * The register's spelling of a street someone named.
   *
   * The same test the address box uses: exact, then the same words in any order,
   * so `ישראל נג'ארה` is the row stored as `נג'ארה ישראל`.
   */
  private async pickRegisteredStreet(city: string, street: string) {
    const names = await this.prisma.street.findMany({
      where: { cityKey: cityKey(city) },
      select: { name: true },
    });
    return pickStreet(street, names.map((row) => row.name));
  }

  /** One registered street, or the few the name could still be. */
  private async namedStreets(city: string, text: string): Promise<string[]> {
    const picked = await this.pickRegisteredStreet(city, text);
    return 'name' in picked ? [picked.name] : picked.choices;
  }

  /** Published for-sale listings on this street, matched the way a person names it. */
  private async askingOnStreet(
    settlement: string,
    city: string,
    street: string,
    rooms?: number,
  ): Promise<AskingPrices | null> {
    const cities = [...new Set([settlement.trim(), city.trim()].filter((name) => name.length > 0))];
    const rows = await this.prisma.listing.findMany({
      where: {
        status: 'published',
        delistedAt: null,
        section: 'forsale',
        OR: cities.map((name) => ({ city: { equals: name, mode: 'insensitive' as const } })),
        price: { gt: 0 },
        ...(rooms !== undefined ? { rooms } : {}),
        AND: [FROM_A_VISIBLE_AGENCY],
      },
      select: { street: true, price: true, pricePerSquareMeter: true },
      take: 400,
    });

    const onStreet = rows.filter(
      (row) => row.street && row.price !== null && row.price > 0 && listingOnStreet(row.street, street),
    );
    if (onStreet.length === 0) return null;

    const perSqm = onStreet
      .map((row) => row.pricePerSquareMeter)
      .filter((value): value is number => value !== null && value > 0);
    return {
      count: onStreet.length,
      median: median(onStreet.map((row) => row.price as number)) ?? 0,
      perSqm: perSqm.length > 0 ? median(perSqm) : null,
    };
  }

  @AgentTool({
    name: 'estimate_value',
    description: 'טווח שווי לדירה לפי עסקאות דומות. מחזיר טווח, לא מספר אחד, ואינו שמאות. דורש התחברות.',
    audiences: ['end-user'],
    group: 'pricing',
    auth: true,
    dto: EstimateValueDto,
  })
  async estimateValue(dto: EstimateValueDto, ctx: AgentContext): Promise<ToolResult> {
    const place = await this.places.find(dto.city);
    const registered = dto.street ? await this.pickRegisteredStreet(dto.city, dto.street) : null;
    const streetName = registered && 'name' in registered ? registered.name : dto.street;
    const street = streetName ? await this.places.locateStreet(dto.city, streetName) : null;
    const latitude = street?.latitude ?? place?.latitude;
    const longitude = street?.longitude ?? place?.longitude;
    if (latitude === undefined || longitude === undefined) {
      return { summary: `לא הצלחתי למקם את ${dto.city}. בלי נקודה אין הערכת שווי.` };
    }

    const context = await this.market.stateFor(dto.city, latitude, longitude, dto.rooms);
    const request: ValuationRequest = {
      city: dto.city,
      latitude,
      longitude,
      gush: null,
      chelka: null,
      settlementCode: place?.settlementCode ?? null,
      rooms: dto.rooms,
      area: dto.area,
      attributes: toSubject(dto.attributes),
      market: context.verdict.state,
    };

    const result = await this.valuation.value(request);
    await this.valuation.record(request, result, ctx.principal?.userId ?? null);

    const range = result.range;
    return {
      summary: range
        ? `טווח שווי ב${dto.city}: ${shekel(range.low)}–${shekel(range.high)} (${VERDICT[result.verdict] ?? result.verdict}). זו אינה שמאות.`
        : `אין טווח שווי: ${VERDICT[result.verdict] ?? result.verdict}.`,
      cards: [
        {
          type: 'valuation',
          low: range?.low ?? null,
          high: range?.high ?? null,
          verdict: result.verdict,
          city: dto.city,
        },
      ],
    };
  }

  @AgentTool({
    name: 'mortgage_plan',
    description:
      'החזר חודשי לפי תמהיל השלישים (שליש קבועה, שליש פריים, שליש משתנה), גודל ההלוואה ותקרת המימון. חישוב להמחשה, לא הצעה.',
    audiences: ['end-user', 'agency'],
    group: 'mortgage',
    dto: MortgagePlanDto,
  })
  mortgagePlan(dto: MortgagePlanDto, ctx: AgentContext): ToolResult {
    const years = dto.years ?? DEFAULT_YEARS;
    const result = plan({
      price: dto.price,
      equity: dto.equity,
      annualRate: dto.rate ?? DEFAULT_RATE,
      years,
      buyer: dto.buyer,
    });
    // The same opening mix the mortgage page starts from. The single rate above
    // only checks the financing cap; the payment the person is shown is this mix.
    const preset = MIX_PRESETS[0];
    const priced = mix(preset.build(result.loan, years));
    const monthly = Math.round(priced.monthly);

    return attachMortgageCalculator(
      [
        `הלוואה ${shekel(result.loan)}, החזר ${shekel(monthly)} לחודש ל-${years} שנים.`,
        `התמהיל: ${preset.name} — ${preset.blurb}.`,
        result.equityShortfall > 0
          ? `חסרים ${shekel(result.equityShortfall)} הון עצמי כדי לעמוד בתקרת המימון ל${buyerLabel(dto.buyer)}.`
          : '',
        'חישוב להמחשה לפי לוח שפיצר. אינו הצעת משכנתא.',
      ]
        .filter(Boolean)
        .join(' '),
      [
        {
          type: 'mortgage',
          monthly,
          loan: result.loan,
          years,
          note: `תמהיל ${preset.name}: ${preset.blurb}. להמחשה, לא הצעה`,
        },
      ],
      ctx.recentCards,
      dto.price,
    );
  }

  @AgentTool({
    name: 'affordability',
    description: 'איזו דירה ההכנסה וההון העצמי מאפשרים, לפי תקרת בנק ישראל ולפי מה שנשאר בבית.',
    audiences: ['end-user'],
    group: 'mortgage',
    dto: AffordabilityDto,
  })
  affordability(dto: AffordabilityDto, ctx: AgentContext): ToolResult {
    const years = dto.years ?? DEFAULT_YEARS;
    const rate = dto.rate ?? DEFAULT_RATE;
    const priced = budget({
      income: dto.income,
      commitments: dto.debts ?? 0,
      equity: dto.equity,
      annualRate: rate,
      years,
      buyer: dto.buyer,
    });
    const household = advise({
      netIncome: dto.income,
      outgoings: {
        ...NO_OUTGOINGS,
        living: dto.living ?? 0,
        car: dto.car ?? 0,
        insurance: dto.insurance ?? 0,
        education: dto.education ?? 0,
        debts: dto.debts ?? 0,
        other: dto.other ?? 0,
      },
      childAges: [],
      plannedChildIn: null,
      plannedChildCost: 0,
      salaryGrowth: 0,
      costGrowth: DEFAULT_COST_GROWTH,
      bufferShare: DEFAULT_BUFFER_SHARE,
    });

    return attachMortgageCalculator(
      [
        `לפי תקרת המימון, דירה של עד ${shekel(priced.price)} (הלוואה ${shekel(priced.loan)}, החזר ${shekel(priced.monthly)}).`,
        `אחרי הוצאות הבית נשאר להחזר כ-${shekel(household.recommended)} לחודש. זה חישוב, לא אישור עקרוני.`,
      ].join(' '),
      [
        {
          type: 'mortgage',
          monthly: priced.monthly,
          loan: priced.loan,
          years,
          note: `דירה עד ${shekel(priced.price)}`,
        },
      ],
      ctx.recentCards,
      priced.price,
    );
  }

  @AgentTool({
    name: 'compare_mix',
    description: 'משווה תמהיל משכנתא: preset של thirds, calm או prime, או חלקים שנמסרו. הריביות להמחשה.',
    audiences: ['end-user'],
    group: 'mortgage',
    dto: CompareMixDto,
  })
  compareMix(dto: CompareMixDto, ctx: AgentContext): ToolResult {
    const years = dto.years ?? DEFAULT_YEARS;
    const preset = dto.preset ? MIX_PRESETS.find((item) => item.id === dto.preset) : undefined;

    if (!dto.parts?.length && !(preset && dto.loan)) {
      const list = MIX_PRESETS.map((item) => `${item.id}: ${item.name} — ${item.blurb}`).join('\n');
      return attachMortgageCalculator(`אין מה להשוות עדיין. תמהילים מוכנים:\n${list}`, [], ctx.recentCards);
    }

    const parts: MixPart[] = dto.parts?.length
      ? dto.parts
      : (preset?.build(dto.loan ?? 0, years) ?? defaultMix(dto.loan ?? 0, years));
    const summary = mix(parts);
    const problems = mixProblems(parts, dto.loan ?? summary.amount);

    return attachMortgageCalculator(
      [
        `תמהיל ${preset?.name ?? 'מותאם'}${preset ? ` — ${preset.blurb}` : ''}.`,
        `החזר ${shekel(Math.round(summary.monthly))} לחודש, סה״כ ריבית ${shekel(Math.round(summary.totalInterest))}.`,
        `חלק משתנה ${(summary.variableShare * 100).toFixed(0)}%, חלק צמוד ${(summary.linkedShare * 100).toFixed(0)}%.`,
        problems.length ? `חריגות: ${problems.map(describeProblem).join(', ')}.` : 'עומד בכללי התמהיל.',
        'הריביות להמחשה ואינן הצעה.',
      ].join(' '),
      [
        {
          type: 'mortgage',
          monthly: Math.round(summary.monthly),
          loan: summary.amount,
          years,
          note: preset?.name ?? 'תמהיל',
        },
      ],
      ctx.recentCards,
    );
  }

  @AgentTool({
    name: 'get_article',
    description: 'מביא מאמר או מדריך מהאתר לפי slug מהרשימה שבהנחיה.',
    audiences: ['end-user'],
    group: 'knowledge',
    dto: ArticleDto,
  })
  getArticle(dto: ArticleDto): ToolResult {
    if (dto.slug === 'home') {
      const text = HOME_GUIDE.flatMap((section) => [section.heading, ...section.paragraphs]).join('\n');
      return { summary: text.slice(0, 1500), cards: [{ type: 'link', href: '/', label: 'דף הבית' }] };
    }

    const post = blogPost(dto.slug);
    if (!post) return { summary: 'אין מאמר כזה. השתמש ב-slug מהרשימה.' };

    const text = [...post.paragraphs, ...(post.points ?? []), ...(post.after ?? [])].join('\n').slice(0, 1500);
    return { summary: `${post.title}\n${text}`, cards: [{ type: 'link', href: post.cta.href, label: post.cta.label }] };
  }

  @AgentTool({
    name: 'save_listing',
    description: 'שומר נכס לרשימה של המשתמש. דורש התחברות.',
    audiences: ['end-user'],
    group: 'account',
    auth: true,
    dto: ListingIdDto,
  })
  async saveListing(dto: ListingIdDto, ctx: AgentContext): Promise<ToolResult> {
    const owner = await this.saves.profileFor(requireUser(ctx));
    await this.saves.save(owner, dto.listingId);
    return { summary: 'הנכס נשמר.', cards: [{ type: 'link', href: '/saved', label: 'הנכסים השמורים' }] };
  }

  @AgentTool({
    name: 'unsave_listing',
    description: 'מסיר נכס מהרשימה השמורה. דורש התחברות.',
    audiences: ['end-user'],
    group: 'account',
    auth: true,
    dto: ListingIdDto,
  })
  async unsaveListing(dto: ListingIdDto, ctx: AgentContext): Promise<ToolResult> {
    const owner = await this.saves.profileFor(requireUser(ctx));
    await this.saves.unsave(owner, dto.listingId);
    return { summary: 'הנכס הוסר מהשמורים.' };
  }

  @AgentTool({
    name: 'list_saved',
    description: 'הנכסים שהמשתמש שמר. דורש התחברות.',
    audiences: ['end-user'],
    group: 'account',
    auth: true,
  })
  async listSaved(_dto: undefined, ctx: AgentContext): Promise<ToolResult> {
    const owner = await this.saves.profileFor(requireUser(ctx));
    const ids = (await this.saves.listIds(owner)).slice(0, 8);
    const cards = await this.listings.cardsByIds(ids);
    if (cards.length === 0) return { summary: 'אין נכסים שמורים.' };
    return {
      summary: cards.map((row) => listingLine(row)).join('\n'),
      cards: cards.map(listingCard),
    };
  }

  @AgentTool({
    name: 'create_saved_search',
    description: 'שומר חיפוש ושולח התראה כשמודעה חדשה מתאימה. דורש התחברות.',
    audiences: ['end-user'],
    group: 'account',
    auth: true,
    dto: SaveSearchDto,
  })
  async createSavedSearch(dto: SaveSearchDto, ctx: AgentContext): Promise<ToolResult> {
    const created = await this.prisma.savedSearch.create({
      data: {
        userId: requireUser(ctx),
        name: dto.name.trim(),
        section: dto.section,
        cities: dto.cities ?? [],
        propertyTypes: dto.propertyTypes ?? [],
        minRooms: dto.minRooms,
        maxRooms: dto.maxRooms,
        minPrice: dto.minPrice,
        maxPrice: dto.maxPrice,
        minSquareMeter: dto.minSquareMeter,
        alert: dto.alert ?? true,
        notifiedUpTo: new Date(),
      },
      select: { id: true, name: true },
    });

    return {
      summary: `החיפוש "${created.name}" נשמר, והתראות על מודעות חדשות פעילות.`,
      cards: [{ type: 'link', href: '/alerts', label: 'החיפושים השמורים' }],
    };
  }

  @AgentTool({
    name: 'draft_listing',
    description: 'שומר טיוטת מודעה, לא מפרסם. קרא רק אחרי שהמשתמש אישר את הפרטים. דורש התחברות.',
    audiences: ['end-user'],
    group: 'account',
    auth: true,
    dto: DraftListingDto,
  })
  async draftListing(dto: DraftListingDto, ctx: AgentContext): Promise<ToolResult> {
    const created = await this.seller.create(requireUser(ctx), { ...dto, acceptedTerms: true });
    const href = `/sell/${created.id}`;
    return {
      summary: `נשמרה טיוטה ב${dto.city}, עדיין לא מפורסמת. חסרות לה תמונות, והפרסום נעשה בדף העריכה.`,
      cards: [{ type: 'link', href, label: 'להשלמת המודעה' }],
    };
  }

  @AgentTool({
    name: 'open_page',
    description: `פותח דף באתר. kind הוא אחד מ: ${Object.keys(PAGE_LINKS).join(', ')}.`,
    audiences: ['end-user'],
    group: 'navigation',
    dto: OpenPageDto,
  })
  openPage(dto: OpenPageDto): ToolResult {
    const href = pageHref(dto.kind, dto);
    if (!href) return { summary: `אין דף בשם ${dto.kind}. האפשרויות: ${Object.keys(PAGE_LINKS).join(', ')}.` };
    return { summary: `קישור: ${href}`, cards: [{ type: 'link', href, label: dto.kind }] };
  }
}

function requireUser(ctx: AgentContext): string {
  if (!ctx.principal) throw new Error('נדרשת התחברות.');
  return ctx.principal.userId;
}

function listingCard(row: SearchListing): AgentCard {
  return {
    type: 'listing',
    id: row.id,
    href: listingPath(row.id, row),
    title: [row.street, row.houseNumber, row.city].filter(Boolean).join(' ') || row.city || 'נכס',
    price: row.price,
    rooms: row.rooms,
    sqm: row.squareMeter,
    city: row.city,
  };
}

function listingLine(row: SearchListing): string {
  return [
    row.id,
    [row.street, row.city].filter(Boolean).join(' '),
    row.rooms !== null ? `${row.rooms} חד'` : '',
    row.squareMeter !== null ? `${row.squareMeter} מ"ר` : '',
    shekel(row.price),
    row.pricePerSquareMeter ? `${shekel(row.pricePerSquareMeter)} למ"ר` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

function shekel(value: number | null): string {
  if (value === null) return 'בלי מחיר';
  return `${Math.round(value).toLocaleString('he-IL')} ₪`;
}

function describeProblem(problem: MixProblem): string {
  if (problem.kind === 'variable-over-cap') return `חלק משתנה גבוה מהמותר (${Math.round(problem.share * 100)}%)`;
  if (problem.kind === 'short') return `חסרים ${shekel(problem.by)}`;
  return `עודף של ${shekel(problem.by)}`;
}

function buyerLabel(buyer: BuyerKind): string {
  if (buyer === 'first') return 'דירה ראשונה';
  if (buyer === 'upgrader') return 'משפרי דיור';
  return 'דירה להשקעה';
}

function toSubject(dto: EstimateValueDto['attributes']): Subject {
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

function redactPhones(text: string): string {
  return text.replace(/0\d[\d\-\s]{7,}/g, '[טלפון הוסר]');
}
