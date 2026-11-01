import { Module } from '@nestjs/common';
import { CityPageService } from './city-page.service.js';
import { SeoController } from './seo.controller.js';

@Module({ controllers: [SeoController], providers: [CityPageService] })
export class SeoModule {}
