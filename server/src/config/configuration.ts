import path from 'node:path';

const splitList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * `AGENT_END_USER_ACCESS=signed-in` and `AGENT_END_USER_EXCLUDED_MODULES=CrmModule`.
 *
 * The id in the env name is the agent id with hyphens turned to underscores, so a new
 * agent picks the same switch up without a new config key. Unset means the agent's
 * own default, which for the end-user assistant is anonymous.
 */
function agentsFromEnv(): AgentsConfig {
  const byAgent: Record<string, AgentOverride> = {};

  const override = (id: string): AgentOverride => {
    byAgent[id] ??= { access: 'anonymous', excludedModules: [] };
    return byAgent[id];
  };

  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;

    const access = /^AGENT_([A-Z0-9_]+)_ACCESS$/.exec(key);
    if (
      access &&
      (value === 'anonymous' || value === 'signed-in' || value === 'agency-member')
    ) {
      override(access[1].toLowerCase().replace(/_/g, '-')).access = value;
    }

    const excluded = /^AGENT_([A-Z0-9_]+)_EXCLUDED_MODULES$/.exec(key);
    if (excluded) override(excluded[1].toLowerCase().replace(/_/g, '-')).excludedModules = splitList(value);
  }

  return {
    excludedModules: splitList(process.env.AGENT_EXCLUDED_MODULES),
    byAgent,
    historyDays: historyDaysFromEnv(),
  };
}

/**
 * How many days of actual use to keep.
 *
 * A day counts only when the person sent something. Three quiet days in between
 * do not push an older conversation out. Unset or unreadable means 3.
 */
function historyDaysFromEnv(): number {
  const raw = process.env.AGENT_HISTORY_DAYS;
  if (raw === undefined || raw.trim() === '') return 3;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 3;
}

/** Typed view of the environment. Keep every `process.env` read in this file. */
export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  /** Origins allowed to call the API. Comma-separated in CORS_ORIGINS. */
  corsOrigins: string[];
  /**
   * Whether the background sweeps run — reminders, matching, saved-search alerts.
   *
   * On by default, because off is the surprising state and a reminder that never
   * arrives looks like a bug rather than a setting. `SCHEDULERS_ENABLED=false` turns
   * all three off.
   *
   * It exists for the stretch before launch. The reminder sweep ticks every five
   * minutes for a good reason — the interval is how late a reminder can be — but
   * with no customers there is nothing due, and those queries are the only thing
   * keeping the database awake around the clock. A host that bills reserved memory
   * never gets to scale it to zero, so an empty product pays full price to remind
   * nobody of nothing. Turn it back on with the first real viewing.
   */
  schedulersEnabled: boolean;
  /**
   * The site during הרצה: guests see the home page blurred under a login, and nobody
   * can open an account on their own. An admin invite still works, and so does signing
   * in. Anything but an explicit "true" leaves the site as it is — a typo must not
   * lock the front door.
   */
  siteClosed: boolean;
  /**
   * Private listings wait for an admin before they go on the site. Agencies publish
   * as they do today. Anything but an explicit "true" leaves publishing immediate —
   * a typo must not hold every flat in a queue.
   */
  listingReview: boolean;
  /**
   * Agencies spend a credit for each listing they publish from the app. A single
   * credit is 25 ILS; packs of 10, 50 and 100 are 20, 17 and 15 ILS each. Scraped
   * listings and private sellers stay free either way. Anything but an explicit
   * "true" leaves publishing free — a typo must not start charging.
   */
  listingBilling: boolean;
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
  /**
   * Where a notice goes when an agency signs up and waits for approval.
   * Empty sends nothing. Unset goes to the support inbox.
   */
  supportEmail: string;
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

export interface LlmConfig {
  /** Empty switches every model-backed feature off rather than failing a request. */
  openaiApiKey: string;
  /**
   * Somewhere other than OpenAI that speaks its API — a gateway that meters and traces
   * calls, or a stub in a test. Empty means OpenAI itself.
   */
  openaiBaseUrl: string;
}

/**
 * Who may open a chat.
 *
 * `anonymous` still refuses the tools that ask for an account. `agency-member` is the
 * CRM assistant: a signed-in person with an approved agency, never a visitor.
 */
export type AgentAccessMode = 'anonymous' | 'signed-in' | 'agency-member';

export interface AgentOverride {
  access: AgentAccessMode;
  /** Nest module class names this one agent must not see, on top of the global list. */
  excludedModules: string[];
}

export interface AgentsConfig {
  /**
   * Nest modules whose tools no agent may call, whatever an env file says.
   * `CrmModule,CalendarModule`. A module marked `@AgentExclude()` is already out.
   */
  excludedModules: string[];
  /** Keyed by agent id (`end-user`). Only agents named in the environment appear. */
  byAgent: Record<string, AgentOverride>;
  /** `AGENT_HISTORY_DAYS`. Days the person actually chatted, not calendar days. */
  historyDays: number;
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export interface StorageConfig {
  keyId: string;
  applicationKey: string;
  bucket: string;
  endpoint: string;
  region: string;
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
  /**
   * Whether an agency (anyone who is not a platform admin) may see or use yad2.
   * Anything but an explicit "false" leaves it on, so a typo does not silently
   * take the importer away. Admins are not affected either way.
   */
  forAgencies: boolean;
}

export default (): {
  app: AppConfig;
  database: DatabaseConfig;
  auth: AuthConfig;
  mail: MailConfig;
  google: GoogleConfig;
  llm: LlmConfig;
  agents: AgentsConfig;
  storage: StorageConfig;
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
    // Anything but an explicit "false" leaves them running: a typo should not silently
    // stop the sweeps, and the failure mode of this flag is mail that never goes out.
    schedulersEnabled: (process.env.SCHEDULERS_ENABLED ?? 'true').toLowerCase() !== 'false',
    // Only an explicit "true" closes the site. Unset, "false", and typos stay open.
    siteClosed: (process.env.SITE_CLOSED ?? 'false').toLowerCase() === 'true',
    // Only an explicit "true" holds private listings for review.
    listingReview: (process.env.LISTING_REVIEW ?? 'false').toLowerCase() === 'true',
    // Only an explicit "true" charges an agency for a listing it publishes.
    listingBilling: (process.env.LISTING_BILLING ?? 'false').toLowerCase() === 'true',
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
    supportEmail: process.env.SUPPORT_EMAIL ?? 'support@urban365.co.il',
    appUrl: process.env.APP_URL ?? 'http://localhost:5173',
    // Defaults to the app URL, which is correct in dev where Vite proxies /api.
    apiUrl: process.env.API_URL ?? process.env.APP_URL ?? 'http://localhost:5173',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  },
  llm: {
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    openaiBaseUrl: process.env.OPENAI_BASE_URL ?? '',
  },
  agents: agentsFromEnv(),
  storage: {
    keyId: process.env.B2_KEY_ID ?? '',
    applicationKey: process.env.B2_APPLICATION_KEY ?? '',
    bucket: process.env.B2_BUCKET ?? '',
    endpoint: process.env.B2_ENDPOINT ?? '',
    region: process.env.B2_REGION ?? '',
  },
  captcha: {
    turnstileSecret: process.env.TURNSTILE_SECRET ?? '',
  },
  yad2: {
    cdpUrl: process.env.YAD2_CDP_URL || undefined,
    delayMs: Number(process.env.YAD2_DELAY_MS ?? 150),
    cacheDir: process.env.YAD2_CACHE_DIR ?? path.resolve(process.cwd(), 'data/agencies'),
    forAgencies: (process.env.YAD2_FOR_AGENCIES ?? 'true').toLowerCase() !== 'false',
  },
});
