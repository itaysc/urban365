import { Module } from '@nestjs/common';
import { SavesModule } from '../saves/saves.module.js';
import { BuyerController } from './buyer.controller.js';
import { BuyerService } from './buyer.service.js';

@Module({
  imports: [SavesModule],
  controllers: [BuyerController],
  providers: [BuyerService],
})
export class BuyerModule {}
