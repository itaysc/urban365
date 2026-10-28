/** Mirrors the shapes the server returns from /api/v1/yad2. */

export type Section = 'forsale' | 'rent' | 'commercial';

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

/** One row of the "מה יש בנכס" grid. Absent ones render greyed, as yad2 does. */
export interface Amenity {
  key: string;
  label: string;
  present: boolean;
}

export interface Asset {
  token: string;
  adNumber: number | null;
  listingUrl: string;
  listingType: string;
  price: number | null;
  priceBeforeDrop: number | null;
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

export interface ScrapeProgress {
  phase: 'starting' | 'feed' | 'listings' | 'done';
  pagesDone: number;
  pagesTotal: number;
  itemsDone: number;
  itemsTotal: number;
  /** Both phases combined, so the bar only ever moves forward. */
  done: number;
  total: number;
}

export type JobErrorCode = 'BOT_CHECK' | 'SCRAPE_FAILED';

export interface JobStatus {
  jobId: string;
  status: 'running' | 'done' | 'error';
  progress: ScrapeProgress;
  error: string | null;
  errorCode: JobErrorCode | null;
  result: AgencyResult | null;
}

export interface ScrapeResponse {
  status: 'done' | 'running';
  jobId: string | null;
  result: AgencyResult | null;
}
