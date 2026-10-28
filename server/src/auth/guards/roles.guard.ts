import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AgencyRole } from '@prisma/client';
import type { Request } from 'express';
import { PLATFORM_ADMIN_KEY, ROLES_KEY } from '../decorators/roles.decorator.js';
import type { Principal } from '../types/principal.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const needsPlatformAdmin = this.reflector.getAllAndOverride<boolean>(PLATFORM_ADMIN_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const roles = this.reflector.getAllAndOverride<AgencyRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!needsPlatformAdmin && (!roles || roles.length === 0)) return true;

    const { principal } = ctx.switchToHttp().getRequest<Request & { principal?: Principal }>();
    if (!principal) throw new ForbiddenException('אין הרשאה.');

    if (needsPlatformAdmin) {
      if (principal.platformRole !== 'admin') throw new ForbiddenException('נדרשת הרשאת מנהל מערכת.');
      return true;
    }

    // Platform admins pass any agency role check.
    if (principal.platformRole === 'admin') return true;
    if (!principal.role || !roles!.includes(principal.role)) {
      throw new ForbiddenException('אין הרשאה לפעולה הזו.');
    }
    return true;
  }
}
