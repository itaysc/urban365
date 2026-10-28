import path from 'node:path';

/** Typed view of the environment. Keep every `process.env` read in this file. */
export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  /** Origins allowed to call the API. Comma-separated in CORS_ORIGINS. */
  corsOrigins: string[];
}

export interface DatabaseConfig {
  /** Owner role: migrations, auth, admin and the scraper — queries that cross agencies. */
  url: string;
  /**
   * The `nadlan_app` role, which does not own the tables and so cannot bypass row-level
   * security. Every tenant-facing query uses it. Falls back to `url` until the RLS
   * migration lands, at which point production must have its own.
   */
  appUrl: string;
}

export interface AuthConfig {
  jwtSecret: string;
  /** Set to a shared parent domain (".nadlan.co.il") to use one cookie across subdomains. */
  cookieDomain: string;
}

export interface MailConfig {
  /** Empty means the console transport: links are logged, nothing is sent. */
  resendApiKey: string;
  from: string;
  /** The SPA, where a user lands after a link is validated. */
  appUrl: string;
  /**
   * Where the API itself is reachable. Email links point *here* first so the token is
   * validated and dropped server-side, then the user is redirected to the SPA — the
   * token never reaches browser history or a Referer header.
   */
  apiUrl: string;
}

export interface CaptchaConfig {
  /** Cloudflare Turnstile. Empty disables the check (and it is skipped outside production). */
  turnstileSecret: string;
}

export interface Yad2Config {
  /**
   * A Chrome DevTools endpoint to attach to, e.g. http://127.0.0.1:9222.
   * yad2 is behind Radware Bot Manager, which serves a challenge page to a freshly
   * launched automation browser — attaching to a Chrome that already browses yad2
   * is what makes a live scrape work.
   */
  cdpUrl: string | undefined;
  /** Pause between requests while scraping, in ms. */
  delayMs: number;
  cacheDir: string;
}

export default (): {
  app: AppConfig;
  database: DatabaseConfig;
  auth: AuthConfig;
  mail: MailConfig;
  captcha: CaptchaConfig;
  yad2: Yad2Config;
} => ({
  app: {
    nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
    port: Number(process.env.PORT ?? 5555),
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
    appUrl: process.env.APP_DATABASE_URL || (process.env.DATABASE_URL ?? ''),
  },
  auth: {
    // Dev-only fallback so a fresh checkout boots; assertBootConfig refuses it in production.
    jwtSecret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me-0123456789',
    cookieDomain: process.env.COOKIE_DOMAIN ?? '',
  },
  mail: {
    resendApiKey: process.env.RESEND_API_KEY ?? '',
    from: process.env.MAIL_FROM ?? 'Nadlan <onboarding@resend.dev>',
    appUrl: process.env.APP_URL ?? 'http://localhost:5173',
    // Defaults to the app URL, which is correct in dev where Vite proxies /api.
    apiUrl: process.env.API_URL ?? process.env.APP_URL ?? 'http://localhost:5173',
  },
  captcha: {
    turnstileSecret: process.env.TURNSTILE_SECRET ?? '',
  },
  yad2: {
    cdpUrl: process.env.YAD2_CDP_URL || undefined,
    delayMs: Number(process.env.YAD2_DELAY_MS ?? 150),
    cacheDir: process.env.YAD2_CACHE_DIR ?? path.resolve(process.cwd(), 'data/agencies'),
  },
});
