/**
 * One place for everything that must match between signing and verifying. The reference
 * project pins issuer, audience and algorithm in a single constant and reuses it in both
 * directions — that is what stops a token minted for one purpose validating as another.
 */
export const JWT_ISSUER = 'nadlan';
export const JWT_AUDIENCE = 'nadlan-app';
export const JWT_ALGORITHM = 'HS256' as const;

/** Short, because the access token is deliberately not checked against the DB. */
export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

export const ACCESS_COOKIE = 'nadlan_at';
export const REFRESH_COOKIE = 'nadlan_rt';

/** The refresh cookie is only ever sent to the one route that rotates it. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth/refresh';

export const MAX_FAILED_LOGINS = 10;
export const LOCKOUT_MINUTES = 15;

/**
 * Identical for an unknown email and a wrong password. Telling them apart is an account
 * enumeration oracle.
 */
export const INVALID_CREDENTIALS = 'כתובת האימייל או הסיסמה שגויים.';
