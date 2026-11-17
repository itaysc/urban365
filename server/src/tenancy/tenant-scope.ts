import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Principal } from '../auth/types/principal.js';
import type { TenantClsStore } from './cls.store.js';
import { TENANT_TX, TenantPrismaService } from './tenant-prisma.service.js';

export interface TenantScopeOptions {
  /**
   * An assistant call never inherits platform-admin privileges. The session may be an
   * admin looking at an agency; the tools still see only that agency.
   */
  asAgent?: boolean;
}

/**
 * One short tenant transaction: principal in CLS, `SET LOCAL` on the connection, then
 * the work. Shared by the HTTP interceptor and by agency agent tools, which cannot
 * hold a transaction for a whole chat turn.
 */
@Injectable()
export class TenantScope {
  constructor(
    private readonly cls: ClsService<TenantClsStore & { [TENANT_TX]?: unknown }>,
    private readonly prisma: TenantPrismaService,
  ) {}

  async run<T>(principal: Principal | undefined, work: () => Promise<T>, options: TenantScopeOptions = {}): Promise<T> {
    return this.cls.run(async () => {
      this.cls.set('principal', principal);
      this.cls.set('agencyId', principal?.agencyId ?? undefined);

      if (!principal) return work();

      return this.prisma.root.$transaction(
        async (tx) => {
          const adminOn =
            !options.asAgent && principal.platformRole === 'admin' ? 'on' : 'off';

          // set_config parameterises; `SET LOCAL x = $1` is not valid SQL.
          await tx.$executeRaw`SELECT set_config('app.current_agency_id', ${principal.agencyId ?? ''}, true)`;
          await tx.$executeRaw`SELECT set_config('app.current_user_id', ${principal.userId}, true)`;
          await tx.$executeRaw`SELECT set_config('app.current_role', ${principal.role ?? ''}, true)`;
          await tx.$executeRaw`SELECT set_config('app.is_platform_admin', ${adminOn}, true)`;

          this.cls.set(TENANT_TX, tx);
          return work();
        },
        { timeout: 20_000, maxWait: 5_000 },
      );
    });
  }
}
