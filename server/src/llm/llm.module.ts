import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service.js';

/**
 * Global, like the Prisma module: anything may want to ask a model something, and
 * threading this import through every feature module that eventually does would be
 * noise without a decision in it.
 */
@Global()
@Module({
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
