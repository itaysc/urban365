import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module.js';
import { CitiesController } from './cities.controller.js';
import { CityPageService } from './city-page.service.js';
import { ListingPageService } from './listing-page.service.js';
import { SeoController } from './seo.controller.js';

@Module({
  imports: [ListingsModule],
  controllers: [SeoController, CitiesController],
  providers: [CityPageService, ListingPageService],
})
export class SeoModule {}
