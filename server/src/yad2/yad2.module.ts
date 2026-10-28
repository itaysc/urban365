import { Module } from '@nestjs/common';
import { AgencyCacheService } from './agency-cache.service.js';
import { AgencyRepository } from './agency.repository.js';
import { Yad2Controller } from './yad2.controller.js';
import { Yad2ScraperService } from './yad2-scraper.service.js';
import { Yad2Service } from './yad2.service.js';

@Module({
  controllers: [Yad2Controller],
  providers: [Yad2Service, Yad2ScraperService, AgencyCacheService, AgencyRepository],
  // The agency dashboard imports its own yad2 page through this service.
  exports: [Yad2Service],
})
export class Yad2Module {}
