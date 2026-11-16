import { Module } from '@nestjs/common';
import { AgentExclude } from '../agents/core/agent-exclude.js';
import { CoBrokerageController } from './cobrokerage.controller.js';
import { CoBrokerageService } from './cobrokerage.service.js';

@AgentExclude()
@Module({
  controllers: [CoBrokerageController],
  providers: [CoBrokerageService],
})
export class CoBrokerageModule {}
