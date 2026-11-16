import { Module } from '@nestjs/common';
import { AgentExclude } from '../agents/core/agent-exclude.js';
import { DemoController } from './demo.controller.js';
import { DemoService } from './demo.service.js';

@AgentExclude()
@Module({
  controllers: [DemoController],
  providers: [DemoService],
  exports: [DemoService],
})
export class DemoModule {}
