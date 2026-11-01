import { Module } from '@nestjs/common';
import { CityPageService } from './city-page.service.js';
import { ListingPageService } from './listing-page.service.js';
import { SeoController } from './seo.controller.js';

@Module({ controllers: [SeoController], providers: [CityPageService, ListingPageService] })
export class SeoModule {}
