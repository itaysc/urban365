import { Injectable, Logger } from '@nestjs/common';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface AddressParts {
  city: string;
  street?: string | null;
  houseNumber?: number | null;
}

/** Roughly Israel and the territories — the same box the boundary sync uses. */
const VIEWBOX = { minLng: 34.2, minLat: 29.45, maxLng: 35.95, maxLat: 33.35 };

/**
 * Nominatim asks callers for no more than one request a second, and means it.
 * Geocoding here happens when an agency saves an office — a handful of times ever — so
 * this is about being a good citizen rather than about throughput.
 */
const MIN_INTERVAL_MS = 1100;

/**
 * Turns an office address into coordinates.
 *
 * OpenStreetMap's own geocoder, for the same reason the boundaries come from OSM: no
 * key to hold, no per-request bill, and an acceptable-use policy this fits inside. It
 * is used on *write* only — an office is geocoded once when it is saved, never when a
 * map is drawn, which is the use the policy actually forbids.
 *
 * Failure is not an error. An address Nominatim cannot place still describes a real
 * office; it is stored without coordinates and left off the map.
 */
@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);
  private lastCall = 0;

  async locate(address: AddressParts): Promise<Coordinates | null> {
    const query = [
      [address.street, address.houseNumber].filter(Boolean).join(' '),
      address.city,
      'ישראל',
    ]
      .filter(Boolean)
      .join(', ');

    await this.waitForTurn();

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('accept-language', 'he');
    // Bounded and bounded strictly: without this, "הרצל 1" finds a Herzl Street in
    // another country and the office lands in the sea.
    url.searchParams.set(
      'viewbox',
      `${VIEWBOX.minLng},${VIEWBOX.maxLat},${VIEWBOX.maxLng},${VIEWBOX.minLat}`,
    );
    url.searchParams.set('bounded', '1');

    try {
      const response = await fetch(url, {
        headers: {
          // The policy requires an identifiable caller; anonymous traffic is the first
          // thing blocked.
          'User-Agent': 'nadlan/1.0 (agency office geocoding; one request per save)',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        this.logger.warn(`Nominatim answered ${response.status} for "${query}"`);
        return null;
      }

      const [hit] = (await response.json()) as { lat?: string; lon?: string }[];
      if (!hit?.lat || !hit?.lon) return null;

      const latitude = Number(hit.lat);
      const longitude = Number(hit.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

      return { latitude, longitude };
    } catch (e) {
      // Including a timeout. The office is saved either way.
      this.logger.warn(`Could not geocode "${query}": ${(e as Error).message}`);
      return null;
    }
  }

  /** Serialises callers so two saves at once cannot both fire inside the same second. */
  private async waitForTurn(): Promise<void> {
    const wait = this.lastCall + MIN_INTERVAL_MS - Date.now();
    // Claimed before awaiting, so a second caller queues behind this one rather than
    // reading the same `lastCall` and going at the same moment.
    this.lastCall = Math.max(Date.now(), this.lastCall + MIN_INTERVAL_MS);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
}
