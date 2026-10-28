/**
 * Maps yad2's `__NEXT_DATA__` payloads to the shapes the client renders.
 * This is the only place that knows yad2's field names.
 */
import {
  SECTION_SUBCATEGORY,
  SUBCATEGORY_NAMES,
  type AgencyDump,
  type Amenity,
  type AgencyResult,
  type AgencySummary,
  type Asset,
  type RawListing,
  type Section,
  type TeamMember,
} from './yad2.types.js';

export const BASE = 'https://www.yad2.co.il';

export const agencyPageUrl = (id: string, section: Section, page = 1): string =>
  `${BASE}/realestate/agency/${id}/${section}${page > 1 ? `?page=${page}` : ''}`;

export const listingUrl = (token: string): string => `${BASE}/realestate/item/${token}`;

/**
 * Null for a listing created here rather than scraped. Building the url unconditionally
 * produced `.../realestate/item/` for every manual listing — a link to nothing, which
 * the detail modal then showed in place of the enquiry form.
 */
export const listingUrlOrNull = (token: string | null | undefined): string | null =>
  token ? listingUrl(token) : null;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || Number.isNaN(n) ? null : n;
};
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const oneLine = (v: unknown): string => str(v).replace(/\s+/g, ' ').trim();

/**
 * The ten rows yad2 always prints under "מה יש בנכס", in its order. They show even when
 * absent (greyed), so the grid reads the same on every listing.
 */
export const CANONICAL_AMENITIES: { key: string; label: string }[] = [
  { key: 'includeElevator', label: 'מעלית' },
  { key: 'isHandicapped', label: 'גישה לנכים' },
  { key: 'includeTornado', label: 'מזגן טורנדו' },
  { key: 'includeAirconditioner', label: 'מיזוג' },
  { key: 'includeBars', label: 'סורגים' },
  { key: 'includeWarehouse', label: 'מחסן' },
  { key: 'includeBoiler', label: 'דוד שמש' },
  { key: 'isRenovated', label: 'משופצת' },
  { key: 'includeSecurityRoom', label: 'ממ"ד' },
  { key: 'includeBalcony', label: 'מרפסת' },
];

/**
 * Flags yad2 holds but does not put in that grid. We append them when true rather than
 * drop them — parking is left out on purpose, since it has its own "חניות" count above.
 */
export const EXTRA_AMENITIES: { key: string; label: string }[] = [
  { key: 'includeFurniture', label: 'ריהוט' },
  { key: 'includeBuildingShelter', label: 'מקלט בניין' },
  { key: 'includeFloorShelter', label: 'מקלט קומתי' },
  { key: 'isKitchenKosher', label: 'מטבח כשר' },
  { key: 'isAssetExclusive', label: 'בלעדיות' },
  { key: 'isImmediateEntrance', label: 'כניסה מיידית' },
];

const DEAL_TYPES: Record<number, string> = { 5: 'מכירה', 6: 'השכרה', 7: 'מסחרי' };

function toAmenities(inProperty: Record<string, boolean> | undefined): Amenity[] {
  const flags = inProperty ?? {};
  return [
    ...CANONICAL_AMENITIES.map((a) => ({ ...a, present: flags[a.key] === true })),
    ...EXTRA_AMENITIES.filter((a) => flags[a.key] === true).map((a) => ({ ...a, present: true })),
  ];
}

export function toAgencySummary(dump: AgencyDump, agencyId: string, section: Section): AgencySummary {
  const d = dump.agency.details ?? {};
  const counts = dump.agency.subCategoriesAdsCount ?? {};

  return {
    agencyId,
    name: str(d.officeName),
    licenseNumber: str(d.licenseNumber),
    phone: str(d.phone),
    logoUrl: str(d.logo),
    description: str(d.description).trim(),
    openingHours: Object.entries(d.openingHours ?? {}).map(([day, v]) => ({
      day,
      open: v.openHour,
      close: v.closeHour,
    })),
    counts: {
      forSale: num(counts[SECTION_SUBCATEGORY.forsale]),
      forRent: num(counts[SECTION_SUBCATEGORY.rent]),
      commercial: num(counts[SECTION_SUBCATEGORY.commercial]),
    },
    agencyUrl: agencyPageUrl(agencyId, section),
  };
}

export function toTeam(dump: AgencyDump): TeamMember[] {
  return (dump.agency.brokers ?? []).map((b) => ({
    id: num(b.id),
    name: str(b.name).trim(),
    licenseNumber: str(b.licenseNumber),
    activeAssetsCount: num(b.count),
    specialization: str(b.specialization?.title),
    avatarUrl: str(b.avatar),
  }));
}

/** `card` comes from the agency feed; `item` is the listing's own page (a superset). */
export function toAsset(card: RawListing, item: RawListing | null): Asset {
  const src = item ?? card;
  const ad = src.additionalDetails ?? {};
  const addr = src.address ?? {};
  const meta = src.metaData ?? {};
  const cust = src.customer ?? {};
  const dates = src.dates ?? {};
  const broker = cust.brokers?.[0] ?? {};

  return {
    token: str(src.token),
    adNumber: num(src.adNumber),
    listingUrl: listingUrlOrNull(src.token ? str(src.token) : null),
    listingType: SUBCATEGORY_NAMES[src.subcategoryId ?? -1] ?? '',
    price: num(src.price),
    priceBeforeDrop: num(src.priceBeforeTag),
    // yad2 divides by the net area and truncates; verified against its own rendered value.
    pricePerSquareMeter:
      src.price && ad.squareMeter ? Math.floor(src.price / ad.squareMeter) : null,
    dealType: DEAL_TYPES[src.subcategoryId ?? -1] ?? '',
    propertyType: str(ad.property?.text),
    propertyGroup: str(ad.propertyGroup?.text),
    propertyCondition: str(ad.propertyCondition?.text),
    rooms: num(ad.roomsCount),
    floor: num(addr.house?.floor),
    buildingTopFloor: num(ad.buildingTopFloor),
    squareMeter: num(ad.squareMeter),
    squareMeterBuilt: num(ad.squareMeterBuild),
    squareMeterGarden: num(ad.squareMeterGarden),
    balconiesCount: num(ad.balconiesCount),
    parkingSpacesCount: num(ad.parkingSpacesCount),
    isOnPillars: ad.isPillarBuilding === true,
    entranceDate: str(ad.entranceDate).slice(0, 10),
    isEntranceDateFlexible: ad.isEnterDateFlexible === true,
    city: str(addr.city?.text),
    neighborhood: str(addr.neighborhood?.text),
    street: str(addr.street?.text),
    houseNumber: num(addr.house?.number),
    region: str(addr.region?.text),
    area: str(addr.area?.text),
    topArea: str(addr.topArea?.text),
    latitude: num(addr.coords?.lat),
    longitude: num(addr.coords?.lon),
    shelterDistanceM: num(meta.shelterDistance),
    tags: (src.tags ?? []).map((t) => str(t.name)).filter(Boolean),
    amenities: toAmenities(src.inProperty),
    description: oneLine(meta.description),
    coverImageUrl: str(meta.coverImage),
    imageUrls: (meta.images ?? []).map(str).filter(Boolean),
    imagesCount: meta.images?.length ?? 0,
    videoUrl: meta.video ? (str(meta.video).startsWith('//') ? `https:${str(meta.video)}` : str(meta.video)) : '',
    contactName: str(cust.name).trim(),
    agencyName: str(cust.agencyName).trim(),
    brokerName: str(broker.name).trim(),
    brokerLicenseNumber: str(broker.licenseNumber),
    createdAt: str(dates.createdAt),
    updatedAt: str(dates.updatedAt),
    hasFullDetails: Boolean(item),
  };
}

export function toResult(
  dump: AgencyDump,
  agencyId: string,
  section: Section,
  source: 'live' | 'cache',
  scrapedAt: string,
): AgencyResult {
  // A listing can appear on more than one feed page while the feed re-orders; keep the first.
  const cards = new Map<string, RawListing>();
  for (const c of dump.feed) if (c.token && !cards.has(c.token)) cards.set(c.token, c);

  const details = new Map<string, RawListing>();
  for (const it of dump.items) if (it.token) details.set(it.token, it);

  const assets = [...cards.values()].map((c) => toAsset(c, details.get(str(c.token)) ?? null));

  return {
    agency: toAgencySummary(dump, agencyId, section),
    team: toTeam(dump),
    assets,
    meta: {
      agencyId,
      section,
      total: assets.length,
      scrapedAt,
      source,
      listingsWithoutDetails: assets.filter((a) => !a.hasFullDetails).length,
    },
  };
}

/** Accepts "6816047" or any yad2 agency URL. */
export function parseAgencyInput(input: string): { agencyId: string; section: Section | null } {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/agency\/(\d+)(?:\/(forsale|rent|commercial))?/);
  if (fromUrl) return { agencyId: fromUrl[1], section: (fromUrl[2] as Section) ?? null };
  if (/^\d+$/.test(trimmed)) return { agencyId: trimmed, section: null };
  throw new Error(`Could not read an agency id out of "${input}".`);
}
