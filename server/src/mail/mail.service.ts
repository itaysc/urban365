import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { MailConfig } from '../config/configuration.js';

export interface Mail {
  to: string;
  subject: string;
  html: string;
}

/**
 * Resend when an API key is configured, otherwise a console transport that logs the
 * message and — crucially — any link inside it. That keeps the whole verification and
 * reset flow testable locally with no account, no domain and no DNS.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly config: MailConfig;
  private readonly resend: Resend | null;

  constructor(config: ConfigService) {
    this.config = config.getOrThrow<MailConfig>('mail');
    this.resend = this.config.resendApiKey ? new Resend(this.config.resendApiKey) : null;

    if (!this.resend) {
      this.logger.warn('No RESEND_API_KEY — emails will be logged, not sent.');
    }
  }

  /**
   * Never throws. A failed verification email must not roll back a signup that already
   * succeeded; the user can ask for another one.
   */
  async send(mail: Mail): Promise<void> {
    if (!this.resend) {
      const links = [...mail.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      this.logger.log(
        `\n──── email (not sent: console transport) ────\n` +
          `to:      ${mail.to}\n` +
          `subject: ${mail.subject}\n` +
          (links.length ? `link:    ${links[0]}\n` : '') +
          `─────────────────────────────────────────────`,
      );
      return;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.config.from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
      });
      if (error) this.logger.error(`Resend rejected mail to ${mail.to}: ${error.message}`);
    } catch (e) {
      this.logger.error(`Could not send mail to ${mail.to}: ${(e as Error).message}`);
    }
  }

  get appUrl(): string {
    return this.config.appUrl.replace(/\/$/, '');
  }

  /** Base for links that must hit the API before bouncing the user to the SPA. */
  get apiUrl(): string {
    return this.config.apiUrl.replace(/\/$/, '');
  }
}
