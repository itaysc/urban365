import { Global, Module } from '@nestjs/common';
import { RequestContextService } from './request-context.service.js';
import { TenantGuard } from './tenant.guard.js';
import { TenantPrismaService } from './tenant-prisma.service.js';

/** Global: any feature module can inject the tenant client and the context facade. */
@Global()
@Module({
  providers: [TenantPrismaService, RequestContextService, TenantGuard],
  exports: [TenantPrismaService, RequestContextService, TenantGuard],
})
export class TenancyModule {}
