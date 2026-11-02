import { Module } from '@nestjs/common';
import { CadastreModule } from '../cadastre/cadastre.module.js';
import { DealsSyncService } from './deals.sync.js';

/**
 * Our copy of the national transaction registry, and the job that keeps it current.
 *
 * Nothing here is called while a page renders: the sync writes `MarketDeal` on a
 * schedule and everything else reads our own tables.
 */
@Module({
  imports: [CadastreModule],
  providers: [DealsSyncService],
  exports: [DealsSyncService],
})
export class DealsModule {}
