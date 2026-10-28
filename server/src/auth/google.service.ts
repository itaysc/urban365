import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthConfig, GoogleConfig, MailConfig } from '../config/configuration.js';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** The claims we rely on. Google sends more; these are the ones that matter. */
export interface GoogleIdentity {
  /** Stable per-account. The thing to key on — an address can change hands. */
  subject: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  picture: string | null;
}

/** How long a sign-in may sit half-finished before the state is refused. */
const STATE_TTL_MS = 10 * 60_000;

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);
  private readonly config: GoogleConfig;
  private readonly apiUrl: string;
  private readonly stateSecret: string;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<GoogleConfig>('google');
    this.apiUrl = configService.getOrThrow<MailConfig>('mail').apiUrl;
    // Reuses the JWT secret rather than adding another one to configure. It signs the
    // CSRF state only, which lives for ten minutes.
    this.stateSecret = configService.getOrThrow<AuthConfig>('auth').jwtSecret;
  }

  /** Missing credentials must not crash boot — the button simply is not offered. */
  isConfigured(): boolean {
    return this.config.clientId.trim() !== '' && this.config.clientSecret.trim() !== '';
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('כניסה עם Google אינה מוגדרת.');
    }
  }

  /**
   * Must match a redirect URI registered on the Google client exactly, including the
   * scheme and any trailing path. Derived from API_URL so staging and production do not
   * need separate code.
   */
  redirectUri(): string {
    return `${this.apiUrl.replace(/\/$/, '')}/api/v1/auth/google/callback`;
  }

  /**
   * Signed rather than stored. The state has to survive a round trip through Google
   * with no session of ours attached, and signing it means no server-side store to
   * expire or clean up.
   *
   * It carries where to return to, so an interrupted sign-in resumes where it started.
   */
  private signState(payload: string): string {
    const mac = createHmac('sha256', this.stateSecret).update(payload).digest('base64url');
    return `${payload}.${mac}`;
  }

  private verifyState(state: string): { returnTo: string } {
    const index = state.lastIndexOf('.');
    if (index <= 0) throw new BadRequestException('בקשת ההתחברות אינה תקפה.');

    const payload = state.slice(0, index);
    const presented = Buffer.from(state.slice(index + 1), 'base64url');
    const expected = createHmac('sha256', this.stateSecret).update(payload).digest();

    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
      throw new BadRequestException('בקשת ההתחברות אינה תקפה.');
    }

    const [issuedAt, , returnToEncoded] = payload.split(':');
    if (Date.now() - Number(issuedAt) > STATE_TTL_MS) {
      throw new BadRequestException('בקשת ההתחברות פגה. נסו שוב.');
    }

    return { returnTo: decodeURIComponent(returnToEncoded ?? '') };
  }

  /** Where to send the browser to start the flow. */
  authorizationUrl(returnTo: string): string {
    this.assertConfigured();

    // The nonce is what makes two concurrent sign-ins distinguishable; the timestamp is
    // what expires them.
    const payload = `${Date.now()}:${randomBytes(12).toString('base64url')}:${encodeURIComponent(returnTo)}`;

    const params = new URLSearchParams({
      client_id: this.config.clientId.trim(),
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      state: this.signState(payload),
      // Google omits the email on a repeat consent unless asked; `select_account` also
      // stops it silently reusing whichever account the browser last used.
      prompt: 'select_account',
    });

    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  /**
   * Exchanges the one-time code for an id_token and reads the identity out of it.
   *
   * The token comes straight from Google's endpoint over TLS, authenticated with our
   * client secret, so its provenance is established by the channel rather than by
   * checking a signature — Google's own guidance says verification is unnecessary for a
   * token received this way. The claims are still checked, because a mismatched `aud`
   * would mean the credentials are wired to the wrong client.
   */
  async exchange(code: string, state: string): Promise<{ identity: GoogleIdentity; returnTo: string }> {
    this.assertConfigured();
    const { returnTo } = this.verifyState(state);

    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId.trim(),
        client_secret: this.config.clientSecret.trim(),
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      this.logger.error(`Google token exchange failed: ${response.status} ${await response.text()}`);
      throw new BadRequestException('ההתחברות עם Google נכשלה.');
    }

    const body = (await response.json()) as { id_token?: string };
    if (!body.id_token) throw new BadRequestException('ההתחברות עם Google נכשלה.');

    return { identity: this.readIdToken(body.id_token), returnTo };
  }

  private readIdToken(idToken: string): GoogleIdentity {
    const segments = idToken.split('.');
    if (segments.length !== 3) throw new BadRequestException('ההתחברות עם Google נכשלה.');

    const claims = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8')) as {
      iss?: string;
      aud?: string;
      exp?: number;
      sub?: string;
      email?: string;
      email_verified?: boolean | string;
      given_name?: string;
      family_name?: string;
      name?: string;
      picture?: string;
    };

    const issuerOk = claims.iss === 'accounts.google.com' || claims.iss === 'https://accounts.google.com';
    if (!issuerOk || claims.aud !== this.config.clientId.trim()) {
      this.logger.error(`Google id_token had iss=${claims.iss} aud=${claims.aud}`);
      throw new BadRequestException('ההתחברות עם Google נכשלה.');
    }

    if (!claims.exp || claims.exp * 1000 <= Date.now()) {
      throw new BadRequestException('ההתחברות עם Google פגה. נסו שוב.');
    }

    if (!claims.sub || !claims.email) throw new BadRequestException('ההתחברות עם Google נכשלה.');

    // Google sends this as a boolean or the string "true" depending on the endpoint.
    const emailVerified = claims.email_verified === true || claims.email_verified === 'true';

    // `given_name` is absent for some accounts; the full name is the fallback, and the
    // surname may simply be empty rather than invented.
    const fallback = (claims.name ?? claims.email.split('@')[0]).trim();
    return {
      subject: claims.sub,
      email: claims.email,
      emailVerified,
      firstName: (claims.given_name ?? fallback.split(' ')[0] ?? fallback).trim(),
      lastName: (claims.family_name ?? fallback.split(' ').slice(1).join(' ')).trim(),
      picture: claims.picture ?? null,
    };
  }
}
