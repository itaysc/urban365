import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { cellRange, pickParcel, type ParcelShape } from './parcel-index.js';

export interface Parcel {
  gush: number;
  chelka: number;
}

/**
 * Which cadastral parcel a point sits on, from our own imported copy.
 *
 * No network call: the parcels layer is open data, imported once, and this is a
 * nine-cell index read followed by ray casting on the handful that come back. That
 * matters beyond speed — it is the difference between a lookup we own and one that
 * depends on a government server agreeing to answer us, which GovMap's does not.
 */
@Injectable()
export class ParcelService {
  constructor(private readonly prisma: PrismaService) {}

  async parcelAt(latitude: number, longitude: number): Promise<Parcel | null> {
    const { minCellLat, maxCellLat, minCellLng, maxCellLng } = cellRange(latitude, longitude);

    const candidates = await this.prisma.parcel.findMany({
      where: {
        cellLat: { gte: minCellLat, lte: maxCellLat },
        cellLng: { gte: minCellLng, lte: maxCellLng },
        // The box test again in SQL, so the rows crossing the wire are only the ones
        // that could possibly contain the point rather than the whole nine cells.
        minLat: { lte: latitude },
        maxLat: { gte: latitude },
        minLng: { lte: longitude },
        maxLng: { gte: longitude },
      },
      select: {
        gush: true,
        chelka: true,
        geometry: true,
        minLat: true,
        maxLat: true,
        minLng: true,
        maxLng: true,
      },
      // A point should fall in exactly one parcel; more than a few means overlapping
      // geometry in the source, and taking the first is as good an answer as exists.
      take: 25,
    });

    const hit = pickParcel(candidates as unknown as ParcelShape[], latitude, longitude);
    return hit ? { gush: hit.gush, chelka: hit.chelka } : null;
  }

  /** Whether the layer has been imported at all, for a job that would otherwise no-op. */
  async count(): Promise<number> {
    return this.prisma.parcel.count();
  }
}
