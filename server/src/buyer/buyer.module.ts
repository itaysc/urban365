import { Module } from '@nestjs/common';
import { BuyerController } from './buyer.controller.js';
import { BuyerService } from './buyer.service.js';

@Module({
  controllers: [BuyerController],
  providers: [BuyerService],
})
export class BuyerModule {}
