import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { from, Observable } from 'rxjs';
import type { Principal } from '../auth/types/principal.js';
import type { TenantClsStore } from './cls.store.js';
import { TENANT_TX, TenantPrismaService } from './tenant-prisma.service.js';

/**
 * Puts the caller in context and, for an authenticated request with an agency, runs the
 * whole handler inside one transaction with `app.current_agency_id` set on it.
 *
 * The handler has to run *inside* the transaction callback: `SET LOCAL` lives on a single
 * connection, so a query issued on the pool outside it would not be scoped at all.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantInterceptor.name);

  constructor(
    private readonly cls: ClsService<TenantClsStore & { [TENANT_TX]?: unknown }>,
    private readonly prisma: TenantPrismaService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();

    const req = ctx.switchToHttp().getRequest<Request & { principal?: Principal }>();
    const principal = req.principal;

    return from(
      this.cls.run(async () => {
        this.cls.set('principal', principal);
        this.cls.set('agencyId', principal?.agencyId ?? undefined);

        // Anonymous and agency-less requests need no transaction. The public search is
        // the hot path and must not pay for BEGIN/COMMIT it cannot use.
        if (!principal?.agencyId) {
          return firstValueOfHandler(next);
        }

        return this.prisma.root.$transaction(
          async (tx) => {
            // set_config parameterises; `SET LOCAL x = $1` is not valid SQL, which is
            // how this ends up as string interpolation and then as an injection.
            await tx.$executeRaw`SELECT set_config('app.current_agency_id', ${principal.agencyId}, true)`;
            await tx.$executeRaw`SELECT set_config('app.current_user_id', ${principal.userId}, true)`;
            await tx.$executeRaw`SELECT set_config('app.current_role', ${principal.role ?? ''}, true)`;
            await tx.$executeRaw`SELECT set_config('app.is_platform_admin', ${
              principal.platformRole === 'admin' ? 'on' : 'off'
            }, true)`;

            this.cls.set(TENANT_TX, tx);
            return firstValueOfHandler(next);
          },
          { timeout: 20_000, maxWait: 5_000 },
        );
      }),
    );
  }
}

/** Bridges the interceptor's promise world back to Nest's observable one. */
function firstValueOfHandler(next: CallHandler): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    next.handle().subscribe({
      next: (v) => {
        settled = true;
        resolve(v);
      },
      error: reject,
      complete: () => {
        if (!settled) resolve(undefined);
      },
    });
  });
}
