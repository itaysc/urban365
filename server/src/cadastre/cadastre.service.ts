import { Injectable, Logger } from '@nestjs/common';
import { toMercator } from './web-mercator.js';

export interface Parcel {
  gush: number;
  chelka: number;
}

/**
 * GovMap's parcel lookup.
 *
 * ⚠ **This does not currently work from a server, and is not wired into anything.**
 *
 * The endpoint is open in the sense that it needs no key — but it answers 403 to
 * every User-Agent except a browser's. An honest one naming this service is refused;
 * only `Mozilla/5.0` is served. Getting past that would mean misrepresenting what we
 * are to a government server, which is the same line as the reCAPTCHA on GovMap's
 * transaction endpoints, and we are not crossing it.
 *
 * The replacement is better anyway: data.gov.il publishes the cadastral parcels as a
 * shapefile ("חלקות shape"), so the polygons can be imported once and the lookup done
 * locally with the point-in-polygon code the listings module already has for city
 * boundaries. That is exact, offline, properly licensed, and has no runtime
 * dependency on anyone. This file is kept for `toMercator` and as the record of why
 * the obvious route was abandoned.
 */
const PARCEL_URL = 'https://www.govmap.gov.il/api/layers-catalog/apps/parcel-search/address';

/**
 * One request a second. This runs on write and in a backfill, never while a page is
 * rendering, so throughput is irrelevant and being a good guest is not.
 */
const MIN_INTERVAL_MS = 1000;

const TIMEOUT_MS = 15_000;

@Injectable()
export class CadastreService {
  private readonly logger = new Logger(CadastreService.name);
  private lastCall = 0;

  /**
   * The block and parcel at a point, or null.
   *
   * Null is an ordinary answer, not an error: a point in the sea, a settlement with no
   * registered cadastre, or GovMap simply being down. The caller records that the
   * lookup ran either way, so a listing it cannot place is not retried for ever.
   */
  async parcelAt(latitude: number, longitude: number): Promise<Parcel | null> {
    const { x, y } = toMercator(latitude, longitude);

    await this.throttle();

    try {
      const url = `${PARCEL_URL}?x=${x}&y=${y}`;
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(`GovMap parcel lookup returned ${response.status} for ${latitude},${longitude}`);
        return null;
      }

      const body = (await response.json()) as {
        properties?: { gushnumber?: unknown; parcelnumber?: unknown };
      };

      const gush = Number(body.properties?.gushnumber);
      const chelka = Number(body.properties?.parcelnumber);

      // A parcel of zero is GovMap saying "nothing here" in numbers rather than in
      // words; both fields are always present in the shape, filled or not.
      if (!Number.isFinite(gush) || !Number.isFinite(chelka) || gush <= 0 || chelka <= 0) {
        return null;
      }

      return { gush, chelka };
    } catch (error) {
      this.logger.warn(`GovMap parcel lookup failed for ${latitude},${longitude}: ${String(error)}`);
      return null;
    }
  }

  private async throttle(): Promise<void> {
    const wait = this.lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastCall = Date.now();
  }
}
