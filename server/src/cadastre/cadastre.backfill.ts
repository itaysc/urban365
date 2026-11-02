import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ParcelService } from './parcel.service.js';

export interface BackfillResult {
  considered: number;
  resolved: number;
  unplaced: number;
}

/**
 * Puts a block and parcel on every listing we have coordinates for.
 *
 * Runs once over the back catalogue and then only over whatever arrives without one.
 * It is deliberately a batch job and not something a request triggers: GovMap is
 * somebody else's server, we call it once a second, and a listing's parcel does not
 * change — it is a property of the ground, not of the advert.
 */
@Injectable()
export class CadastreBackfill {
  private readonly logger = new Logger(CadastreBackfill.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parcels: ParcelService,
  ) {}

  async run(limit: number, retryUnplaced = false): Promise<BackfillResult> {
    /*
     * Nothing to match against means nothing to do — and stamping every listing
     * "could not place" against an empty table would poison the whole catalogue in
     * one run, since `cadastreAt` is what stops a listing being retried.
     */
    if ((await this.parcels.count()) === 0) {
      this.logger.warn('No parcels imported yet; skipping. Run the parcels import first.');
      return { considered: 0, resolved: 0, unplaced: 0 };
    }

    const listings = await this.prisma.listing.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
        gush: null,
        /*
         * `cadastreAt` is how a listing we could not place stops being asked
         * about on every run. Without it the job would spend its whole budget each
         * night on the same handful of points in the sea.
         */
        ...(retryUnplaced ? {} : { cadastreAt: null }),
      },
      select: { id: true, latitude: true, longitude: true },
      take: limit,
    });

    const result: BackfillResult = { considered: listings.length, resolved: 0, unplaced: 0 };

    for (const listing of listings) {
      const parcel = await this.parcels.parcelAt(listing.latitude!, listing.longitude!);

      await this.prisma.listing.update({
        where: { id: listing.id },
        // Stamped either way: "we looked and found nothing" is a result worth keeping.
        data: { gush: parcel?.gush ?? null, chelka: parcel?.chelka ?? null, cadastreAt: new Date() },
      });

      if (parcel) result.resolved += 1;
      else result.unplaced += 1;
    }

    this.logger.log(
      `Cadastre backfill: ${result.resolved} placed, ${result.unplaced} not placed, ` +
        `out of ${result.considered} considered.`,
    );

    return result;
  }

  /** How much is left, so a run can say whether another is needed. */
  async remaining(): Promise<{ withParcel: number; waiting: number; unplaceable: number }> {
    const [withParcel, waiting, unplaceable] = await Promise.all([
      this.prisma.listing.count({ where: { gush: { not: null } } }),
      this.prisma.listing.count({
        where: { latitude: { not: null }, gush: null, cadastreAt: null },
      }),
      this.prisma.listing.count({
        where: { latitude: { not: null }, gush: null, cadastreAt: { not: null } },
      }),
    ]);

    return { withParcel, waiting, unplaceable };
  }
}
