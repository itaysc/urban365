import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module.js';
import { SavesController } from './saves.controller.js';
import { SavesService } from './saves.service.js';

@Module({
  imports: [ListingsModule],
  controllers: [SavesController],
  providers: [SavesService],
  exports: [SavesService],
})
export class SavesModule {}
