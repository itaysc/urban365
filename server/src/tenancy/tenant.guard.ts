import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { RequestContextService } from './request-context.service.js';

/**
 * Put on any controller whose every route is scoped to one agency. It turns "my
 * membership is still pending" into a clear 403 rather than an empty result set that
 * looks like a bug.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly context: RequestContextService) {}

  canActivate(_ctx: ExecutionContext): boolean {
    if (!this.context.getAgencyId()) {
      throw new ForbiddenException('החשבון עדיין לא משויך לסוכנות מאושרת.');
    }
    return true;
  }
}
