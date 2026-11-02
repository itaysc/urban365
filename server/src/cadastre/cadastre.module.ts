import { Module } from '@nestjs/common';
import { CadastreBackfill } from './cadastre.backfill.js';
import { CadastreService } from './cadastre.service.js';
import { ParcelService } from './parcel.service.js';

/**
 * GovMap's cadastral lookup, and the job that stamps our listings with it.
 *
 * Its own module so the one-request-a-second limit is enforced by one shared
 * instance, the same reason `GeocodeModule` exists.
 */
@Module({
  providers: [CadastreService, CadastreBackfill, ParcelService],
  exports: [CadastreService, CadastreBackfill, ParcelService],
})
export class CadastreModule {}
