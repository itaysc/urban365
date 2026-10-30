import { Module } from '@nestjs/common';
import { SavesController } from './saves.controller.js';
import { SavesService } from './saves.service.js';

@Module({
  controllers: [SavesController],
  providers: [SavesService],
  exports: [SavesService],
})
export class SavesModule {}
