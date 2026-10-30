import { Module } from '@nestjs/common';
import { GeocodeService } from './geocode.service.js';

/**
 * Its own module because two features need it now — agency offices and listings whose
 * address arrived without coordinates — and because the rate limit it enforces only
 * works if everyone shares one instance of it.
 */
@Module({
  providers: [GeocodeService],
  exports: [GeocodeService],
})
export class GeocodeModule {}
