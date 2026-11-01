import { Module } from '@nestjs/common';
import { AlertsScheduler } from './alerts.scheduler.js';
import { AlertsService } from './alerts.service.js';
import { SavedSearchesController } from './alerts.controller.js';
import { SavedSearchesService } from './saved-searches.service.js';

@Module({
  controllers: [SavedSearchesController],
  providers: [SavedSearchesService, AlertsService, AlertsScheduler],
  exports: [AlertsService],
})
export class AlertsModule {}
