import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ACCESS_COOKIE } from '../auth.constants.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { TokenService } from '../token.service.js';
import type { Principal } from '../types/principal.js';

/**
 * Reads the access token from the cookie and attaches the principal. Thirty lines, which
 * is why there is no passport dependency for a single cookie strategy.
 *
 * The token is deliberately *not* checked against the database: that keeps every request
 * at zero queries, at the cost of "log out everywhere" taking up to one access-token
 * lifetime (15 minutes) to bite. Refresh checks, so the session dies at the next rotation.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    const req = ctx.switchToHttp().getRequest<Request & { principal?: Principal }>();
    const raw = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];

    if (raw) {
      const claims = this.tokens.verifyAccessToken(raw);
      // A public route still gets a principal when one is present — the public listing
      // enquiry form wants to know who you are without requiring it.
      if (claims) req.principal = claims;
    }

    if (isPublic) return true;
    if (!req.principal) throw new UnauthorizedException('נדרשת התחברות.');
    return true;
  }
}
