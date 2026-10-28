import type { CookieOptions, Response } from 'express';
import {
  ACCESS_COOKIE,
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_SEC,
} from './auth.constants.js';

/**
 * `SameSite=Lax` rather than the reference's `None`. `None` is only needed when the SPA
 * and API sit on different registrable domains; served as app./api. of one domain, Lax
 * gets CSRF protection from the browser itself and the Origin check becomes a second line
 * rather than the only one.
 */
function base(isProduction: boolean, domain?: string): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    ...(domain ? { domain } : {}),
  };
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
  opts: { isProduction: boolean; domain?: string },
): void {
  const common = base(opts.isProduction, opts.domain);

  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...common,
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SEC * 1000,
  });

  // Scoped to the rotation route, so it is never attached to ordinary API calls.
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...common,
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_SEC * 1000,
  });
}

export function clearAuthCookies(res: Response, opts: { isProduction: boolean; domain?: string }): void {
  const common = base(opts.isProduction, opts.domain);
  res.clearCookie(ACCESS_COOKIE, { ...common, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...common, path: REFRESH_COOKIE_PATH });
}
