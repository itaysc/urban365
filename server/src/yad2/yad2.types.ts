/** Shapes yad2 embeds in `__NEXT_DATA__`, narrowed to the fields we read. */

export type Section = 'forsale' | 'rent' | 'commercial';

export const SECTIONS: Section[] = ['forsale', 'rent', 'commercial'];
export const SECTION_SUBCATEGORY: Record<Section, number> = { forsale: 5, rent: 6, commercial: 7 };
export const SUBCATEGORY_NAMES: Record<number, string> = { 5: 'for_sale', 6: 'for_rent', 7: 'commercial' };

export interface RawTextId { id?: number | string; text?: string; textEng?: string }

export interface RawAgencyDetails {
  customerId?: number;
  officeName?: string;
  licenseNumber?: string;
  phone?: string;
  logo?: string;
  description?: string;
  specializations?: number[];
  openingHours?: Record<string, { openHour: string; closeHour: string }>;
}

export interface RawBroker {
  id?: number;
  name?: string;
  licenseNumber?: string;
  count?: string | number;
  avatar?: string;
  specialization?: { id?: number; title?: string };
}

export interface RawListing {
  token?: string;
  adNumber?: number;
  orderId?: number;
  adType?: string;
  subcategoryId?: number;
  statusId?: number;
  price?: number;
  priceBeforeTag?: number | string;
  abovePrice?: number | string;
  furnitureInfo?: string;
  tags?: { name?: string }[];
  additionalDetails?: {
    property?: RawTextId;
    propertyGroup?: RawTextId;
    propertyCondition?: RawTextId;
    roomsCount?: number;
    squareMeter?: number;
    squareMeterBuild?: number;
    squareMeterGarden?: number;
    balconiesCount?: number;
    parkingSpacesCount?: number;
    buildingTopFloor?: number;
    isPillarBuilding?: boolean;
    entranceDate?: string;
    isEnterDateFlexible?: boolean;
  };
  inProperty?: Record<string, boolean>;
  address?: {
    region?: RawTextId;
    topArea?: RawTextId;
    area?: RawTextId;
    city?: RawTextId;
    neighborhood?: RawTextId;
    street?: RawTextId;
    house?: { floor?: number; number?: number; entrance?: string };
    coords?: { lat?: number; lon?: number };
    addressMasterId?: number;
  };
  metaData?: { coverImage?: string; images?: string[]; description?: string; shelterDistance?: number; video?: string };
  customer?: {
    name?: string;
    agencyName?: string;
    licenseNumber?: string;
    brokers?: { name?: string; licenseNumber?: string }[];
  };
  dates?: { createdAt?: string; updatedAt?: string; rebouncedAt?: string; endsAt?: string };
}

export interface RawAgencyData {
  details?: RawAgencyDetails;
  brokers?: RawBroker[];
  subCategoriesAdsCount?: Record<string, number>;
  pagination?: { total?: number; totalPages?: number };
  feed?: RawListing[];
}

/** What a collection run produces, and what the cache stores. */
export interface AgencyDump {
  agency: Omit<RawAgencyData, 'feed'>;
  feed: RawListing[];
  items: RawListing[];
  failed: string[];
}

// ---------------------------------------------------------------- API shapes

export interface AgencySummary {
  agencyId: string;
  name: string;
  licenseNumber: string;
  phone: string;
  logoUrl: string;
  description: string;
  openingHours: { day: string; open: string; close: string }[];
  counts: { forSale: number | null; forRent: number | null; commercial: number | null };
  agencyUrl: string;
}

export interface TeamMember {
  id: number | null;
  name: string;
  licenseNumber: string;
  activeAssetsCount: number | null;
  specialization: string;
  avatarUrl: string;
}

/** One row of the "מה יש בנכס" grid. Absent ones are rendered greyed, as yad2 does. */
export interface Amenity {
  key: string;
  label: string;
  present: boolean;
}

export interface Asset {
  token: string;
  adNumber: number | null;
  /** Null for listings created here: there is no yad2 page to link to. */
  listingUrl: string | null;
  listingType: string;
  price: number | null;
  priceBeforeDrop: number | null;
  /** floor(price / squareMeter) — the net area, matching the figure yad2 prints. */
  pricePerSquareMeter: number | null;
  dealType: string;
  propertyType: string;
  propertyGroup: string;
  propertyCondition: string;
  rooms: number | null;
  floor: number | null;
  buildingTopFloor: number | null;
  squareMeter: number | null;
  squareMeterBuilt: number | null;
  squareMeterGarden: number | null;
  balconiesCount: number | null;
  parkingSpacesCount: number | null;
  isOnPillars: boolean;
  entranceDate: string;
  isEntranceDateFlexible: boolean;
  city: string;
  neighborhood: string;
  street: string;
  houseNumber: number | null;
  region: string;
  area: string;
  topArea: string;
  latitude: number | null;
  longitude: number | null;
  shelterDistanceM: number | null;
  tags: string[];
  amenities: Amenity[];
  description: string;
  coverImageUrl: string;
  imageUrls: string[];
  imagesCount: number;
  videoUrl: string;
  contactName: string;
  agencyName: string;
  brokerName: string;
  brokerLicenseNumber: string;
  createdAt: string;
  updatedAt: string;
  hasFullDetails: boolean;
}

export interface AgencyResult {
  agency: AgencySummary;
  team: TeamMember[];
  assets: Asset[];
  meta: {
    agencyId: string;
    section: Section;
    total: number;
    scrapedAt: string;
    source: 'live' | 'cache';
    listingsWithoutDetails: number;
  };
}
