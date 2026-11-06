import { Module } from '@nestjs/common';
import { CitiesController } from './cities.controller.js';
import { CityPageService } from './city-page.service.js';
import { ListingPageService } from './listing-page.service.js';
import { ClosedSitePages } from './closed-site-pages.js';
import { SeoController } from './seo.controller.js';

@Module({
  controllers: [SeoController, CitiesController],
  providers: [CityPageService, ListingPageService, ClosedSitePages],
})
export class SeoModule {}
