import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ACCESS_COOKIE } from '../auth.constants.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cheap CSRF defence, lifted from the reference: a mutating request carrying a session
 * cookie must come from a trusted Origin **and** set `X-Requested-With`. A cross-site
 * HTML form can do neither, and `SameSite=Lax` already blocks most of it — this is the
 * second line, not the only one.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowed: string[];

  constructor(config: ConfigService) {
    this.allowed = config.get<string[]>('app.corsOrigins') ?? [];
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    // Nothing to steal without a session cookie.
    const hasSession = Boolean((req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE]);
    if (!hasSession) return true;

    if (req.get('x-requested-with') !== 'XMLHttpRequest') {
      throw new ForbiddenException('בקשה נדחתה.');
    }

    const origin = req.get('origin') ?? req.get('referer');
    if (!origin) throw new ForbiddenException('בקשה נדחתה.');

    const ok = this.allowed.some((a) => origin === a || origin.startsWith(`${a}/`));
    if (!ok) throw new ForbiddenException('בקשה נדחתה.');

    return true;
  }
}
