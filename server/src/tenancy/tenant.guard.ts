import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { Principal } from '../auth/types/principal.js';

/**
 * Put on any controller whose every route is scoped to one agency. It turns "my
 * membership is still pending" into a clear 403 rather than an empty result set that
 * looks like a bug.
 *
 * It reads the principal off the request, **not** from CLS: Nest runs guards before
 * interceptors, so the tenant context does not exist yet at this point in the lifecycle.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const { principal } = ctx.switchToHttp().getRequest<Request & { principal?: Principal }>();

    if (!principal?.agencyId) {
      throw new ForbiddenException('החשבון עדיין לא משויך לסוכנות מאושרת.');
    }
    return true;
  }
}
