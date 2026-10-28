import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service.js';

/** Global: listings and the agency profile both upload, and neither owns the other. */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
