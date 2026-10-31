import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GoogleConfig, MailConfig } from '../config/configuration.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** What we ask Google for, on top of the identity scopes sign-in already uses. */
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const API = 'https://www.googleapis.com/calendar/v3';

/** One meeting, as the two sides of the world describe it. */
export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string | null;
}

/**
 * The user's own Google Calendar, as a place we copy meetings to and read events from.
 *
 * Deliberately not the source of truth. Our `Meeting` rows are, and Google holds a copy:
 * the other way round means an agency loses its diary the moment somebody revokes the
 * OAuth grant, changes their Google password, or leaves the company.
 *
 * Everything here fails soft. A push that does not land leaves `googleEventId` null and
 * records why on the account; it never refuses the meeting, because a calendar that
 * will not take a booking when a third-party API is down is worse than one that is
 * briefly out of step.
 */
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly google: GoogleConfig;
  private readonly apiUrl: string;

  constructor(
    config: ConfigService,
    /**
     * The OWNER client: `GoogleCalendarAccount` is enabled-with-no-policy, so the
     * tenant role cannot see it at all. Scoping is by user id, done here.
     */
    private readonly prisma: PrismaService,
  ) {
    this.google = config.getOrThrow<GoogleConfig>('google');
    this.apiUrl = config.getOrThrow<MailConfig>('mail').apiUrl.replace(/\/$/, '');
  }

  isConfigured(): boolean {
    return this.google.clientId.trim() !== '' && this.google.clientSecret.trim() !== '';
  }

  private redirectUri(): string {
    return `${this.apiUrl}/api/v1/my/calendar/google/callback`;
  }

  /**
   * Where to send the browser to connect.
   *
   * `access_type=offline` with `prompt=consent` is what makes Google return a refresh
   * token. Without the prompt it returns one only the first time a user ever consents,
   * so a reconnect after a disconnect would come back with nothing to store — which
   * looks like success and then never works.
   */
  authorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.google.clientId.trim(),
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: `openid email ${CALENDAR_SCOPE}`,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });

    return `${AUTH_ENDPOINT}?${params}`;
  }

  /** Exchanges the one-time code and stores the connection against the user. */
  async connect(userId: string, code: string): Promise<void> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.google.clientId.trim(),
        client_secret: this.google.clientSecret.trim(),
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      this.logger.error(`Calendar token exchange failed: ${response.status} ${await response.text()}`);
      throw new BadRequestException('החיבור ליומן Google נכשל.');
    }

    const body = (await response.json()) as { refresh_token?: string; id_token?: string };
    if (!body.refresh_token) {
      // Google withholds it when the user has consented before and `prompt` was not
      // forced. Nothing to store means nothing would work later, so say so now.
      throw new BadRequestException('Google לא החזיר הרשאה מתמשכת. נסו לנתק ולחבר מחדש.');
    }

    const email = this.emailFromIdToken(body.id_token) ?? '';

    await this.prisma.googleCalendarAccount.upsert({
      where: { userId },
      create: { userId, googleEmail: email, refreshToken: body.refresh_token },
      update: { googleEmail: email, refreshToken: body.refresh_token, lastError: null },
    });
  }

  async disconnect(userId: string): Promise<void> {
    await this.prisma.googleCalendarAccount.deleteMany({ where: { userId } });
  }

  async status(userId: string) {
    const account = await this.prisma.googleCalendarAccount.findUnique({
      where: { userId },
      select: { googleEmail: true, calendarId: true, connectedAt: true, lastError: true, lastSyncAt: true },
    });

    return { connected: account !== null, available: this.isConfigured(), ...account };
  }

  /**
   * The user's own events in a window, for showing beside ours.
   *
   * Read on demand rather than stored. A copy of somebody's diary in our database is a
   * copy that goes stale and a copy that has to be deleted when they disconnect; asking
   * Google each time costs one request and is always right.
   */
  async events(userId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
    const token = await this.accessToken(userId);
    if (!token) return [];

    const account = await this.prisma.googleCalendarAccount.findUnique({ where: { userId } });
    if (!account) return [];

    const params = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });

    try {
      const response = await fetch(
        `${API}/calendars/${encodeURIComponent(account.calendarId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
      );
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);

      const body = (await response.json()) as {
        items?: {
          id: string;
          summary?: string;
          location?: string;
          start?: { dateTime?: string; date?: string };
          end?: { dateTime?: string; date?: string };
        }[];
      };

      await this.prisma.googleCalendarAccount.update({
        where: { userId },
        data: { lastSyncAt: new Date(), lastError: null },
      });

      return (body.items ?? [])
        .filter((item) => item.start?.dateTime ?? item.start?.date)
        .map((item) => ({
          id: item.id,
          title: item.summary ?? '(ללא כותרת)',
          // An all-day event has `date` rather than `dateTime`. Kept as-is: the client
          // decides how to draw a day with no time in it.
          startsAt: item.start?.dateTime ?? (item.start?.date as string),
          endsAt: item.end?.dateTime ?? (item.end?.date as string),
          location: item.location ?? null,
        }));
    } catch (error) {
      await this.note(userId, `קריאת היומן נכשלה: ${(error as Error).message}`);
      return [];
    }
  }

  /** Writes a meeting to Google, returning the event id to remember it by. */
  async push(userId: string, meeting: {
    title: string;
    startsAt: Date;
    endsAt: Date;
    location?: string | null;
    notes?: string | null;
    googleEventId?: string | null;
  }): Promise<string | null> {
    const token = await this.accessToken(userId);
    if (!token) return meeting.googleEventId ?? null;

    const account = await this.prisma.googleCalendarAccount.findUnique({ where: { userId } });
    if (!account) return null;

    const path = `${API}/calendars/${encodeURIComponent(account.calendarId)}/events`;
    const existing = meeting.googleEventId;

    try {
      const response = await fetch(existing ? `${path}/${existing}` : path, {
        method: existing ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: meeting.title,
          location: meeting.location ?? undefined,
          description: meeting.notes ?? undefined,
          start: { dateTime: meeting.startsAt.toISOString() },
          end: { dateTime: meeting.endsAt.toISOString() },
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);

      const body = (await response.json()) as { id?: string };
      await this.prisma.googleCalendarAccount.update({
        where: { userId },
        data: { lastSyncAt: new Date(), lastError: null },
      });
      return body.id ?? existing ?? null;
    } catch (error) {
      await this.note(userId, `כתיבה ליומן נכשלה: ${(error as Error).message}`);
      return existing ?? null;
    }
  }

  async remove(userId: string, googleEventId: string): Promise<void> {
    const token = await this.accessToken(userId);
    if (!token) return;

    const account = await this.prisma.googleCalendarAccount.findUnique({ where: { userId } });
    if (!account) return;

    try {
      await fetch(
        `${API}/calendars/${encodeURIComponent(account.calendarId)}/events/${googleEventId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
      );
    } catch (error) {
      await this.note(userId, `מחיקה מהיומן נכשלה: ${(error as Error).message}`);
    }
  }

  /**
   * A fresh access token from the stored refresh token.
   *
   * Not cached: an access token lives an hour, a calendar request happens when somebody
   * opens the page, and a cache would be a second place for a revoked grant to hide.
   */
  private async accessToken(userId: string): Promise<string | null> {
    if (!this.isConfigured()) return null;

    const account = await this.prisma.googleCalendarAccount.findUnique({ where: { userId } });
    if (!account) return null;

    try {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.google.clientId.trim(),
          client_secret: this.google.clientSecret.trim(),
          refresh_token: account.refreshToken,
          grant_type: 'refresh_token',
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        // A revoked grant answers 400 here and will answer 400 for ever. Saying so on
        // the account is how the page can offer to reconnect instead of looking broken.
        await this.note(userId, 'ההרשאה ליומן פגה או בוטלה. צריך לחבר מחדש.');
        return null;
      }

      const body = (await response.json()) as { access_token?: string };
      return body.access_token ?? null;
    } catch (error) {
      await this.note(userId, `חידוש ההרשאה נכשל: ${(error as Error).message}`);
      return null;
    }
  }

  private async note(userId: string, message: string): Promise<void> {
    this.logger.warn(`${userId}: ${message}`);
    await this.prisma.googleCalendarAccount
      .update({ where: { userId }, data: { lastError: message.slice(0, 500) } })
      .catch(() => undefined);
  }

  /** The address is in the id_token's payload; it is only used to show which account. */
  private emailFromIdToken(idToken: string | undefined): string | null {
    if (!idToken) return null;
    try {
      const claims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')) as {
        email?: string;
      };
      return claims.email ?? null;
    } catch {
      return null;
    }
  }
}
