import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Cloudflare Turnstile. Skipped entirely outside production and whenever no secret is
 * configured, so local development and the e2e tests need no account.
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly secret: string;
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('captcha.turnstileSecret') ?? '';
    this.enabled = Boolean(this.secret) && config.get<string>('app.nodeEnv') === 'production';
  }

  async verify(token: string | undefined, ip?: string): Promise<boolean> {
    if (!this.enabled) return true;
    if (!token) return false;

    try {
      const body = new URLSearchParams({ secret: this.secret, response: token });
      if (ip) body.set('remoteip', ip);

      const res = await fetch(VERIFY_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(5000),
      });
      const data = (await res.json()) as { success?: boolean };
      return data.success === true;
    } catch (e) {
      // A Cloudflare outage should not lock everyone out of signing up.
      this.logger.warn(`Turnstile unreachable, allowing through: ${(e as Error).message}`);
      return true;
    }
  }
}
