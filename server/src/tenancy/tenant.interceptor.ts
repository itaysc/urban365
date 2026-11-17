import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { from, Observable } from 'rxjs';
import type { Principal } from '../auth/types/principal.js';
import type { TenantClsStore } from './cls.store.js';
import { TENANT_TX } from './tenant-prisma.service.js';
import { TenantScope } from './tenant-scope.js';

/**
 * Puts the caller in context and, for an authenticated request, runs the handler
 * inside one tenant transaction. Assistant routes are the exception: a chat turn
 * lasts longer than the transaction budget, so those tools open their own short
 * scopes when they need the CRM.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(
    private readonly cls: ClsService<TenantClsStore & { [TENANT_TX]?: unknown }>,
    private readonly scope: TenantScope,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();

    const req = ctx.switchToHttp().getRequest<Request & { principal?: Principal }>();
    const principal = req.principal;
    const url = req.originalUrl ?? req.url ?? '';

    // An assistant turn holds the request open for several model calls. The agent's
    // CRM tools open a TenantScope of their own; the end-user tools use the owner
    // client and name the user themselves.
    if (url.includes('/agents/')) {
      return from(
        this.cls.run(async () => {
          this.cls.set('principal', principal);
          this.cls.set('agencyId', principal?.agencyId ?? undefined);
          return firstValueOfHandler(next);
        }),
      );
    }

    // Anonymous requests need no transaction. The public search is the hot path and
    // must not pay for BEGIN/COMMIT it cannot use. A signed-in buyer still gets a
    // transaction: their own rows are scoped by `app.current_user_id`.
    return from(this.scope.run(principal, () => firstValueOfHandler(next)));
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
