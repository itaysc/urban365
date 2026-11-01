import { Module } from '@nestjs/common';
import { CoBrokerageController } from './cobrokerage.controller.js';
import { CoBrokerageService } from './cobrokerage.service.js';

@Module({
  controllers: [CoBrokerageController],
  providers: [CoBrokerageService],
})
export class CoBrokerageModule {}
