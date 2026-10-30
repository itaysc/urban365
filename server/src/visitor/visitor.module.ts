import { Module } from '@nestjs/common';
import { VisitorService } from './visitor.service.js';

@Module({
  providers: [VisitorService],
  exports: [VisitorService],
})
export class VisitorModule {}
