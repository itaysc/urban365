import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { REFRESH_COOKIE } from './auth.constants.js';
import { clearAuthCookies, setAuthCookies } from './cookies.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { SavesService } from '../saves/saves.service.js';
import { VISITOR_COOKIE, VisitorService } from '../visitor/visitor.service.js';
import { CaptchaService } from './captcha.service.js';
import { LoginDto } from './dto/login.dto.js';
import { ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto } from './dto/password.dto.js';
import { SignupDto } from './dto/signup.dto.js';
import { AttachAgencyDto } from './dto/attach-agency.dto.js';
import { ResubmitAgencyDto } from './dto/resubmit-agency.dto.js';
import type { Principal } from './types/principal.js';
import { BuyerSignupDto } from '../buyer/dto/buyer.dto.js';
import { GoogleService } from './google.service.js';

/** Tight limits on the routes worth attacking. */
const AUTH_THROTTLE = { auth: { limit: 10, ttl: 15 * 60_000 } };

@Controller('auth')
export class AuthController {
  private readonly cookieOpts: { isProduction: boolean; domain?: string };

  private readonly appUrl: string;

  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly captcha: CaptchaService,
    private readonly google: GoogleService,
    config: ConfigService,
      private readonly saves: SavesService,
      private readonly visitors: VisitorService,
  ) {
    this.appUrl = (config.get<string>('mail.appUrl') ?? '').replace(/\/$/, '');
    this.cookieOpts = {
      isProduction: config.get<string>('app.nodeEnv') === 'production',
      domain: config.get<string>('auth.cookieDomain') || undefined,
    };
  }

  private meta(req: Request) {
    return { ip: req.ip, userAgent: req.get('user-agent') ?? undefined };
  }

  /** Tokens are never in the body — only in httpOnly cookies. */
  /**
   * Every successful sign-in and signup passes through here, which is why the saves a
   * browser made before it had an account are collected here too.
   *
   * Somebody who saved four flats and then made an account expects to find four flats.
   * Doing it anywhere else means finding every door into a session and remembering to
   * do it at each one.
   */
  private async send(
    req: Request,
    res: Response,
    result: Awaited<ReturnType<AuthService['login']>>,
  ) {
    setAuthCookies(res, result, this.cookieOpts);
    await this.adoptAnonymousSaves(req, res, result.user.id);
    return { user: result.user };
  }

  private async adoptAnonymousSaves(req: Request, res: Response, userId: string) {
    const visitorId = (req.cookies as Record<string, string> | undefined)?.[VISITOR_COOKIE];
    if (!visitorId) return;

    // Checked before a profile is created: an agency signing in from a browser that
    // never saved anything should not acquire a buyer profile as a side effect.
    const visitor = await this.visitors.existing(visitorId);
    if (visitor) {
      const profile = await this.saves.profileFor(userId);
      if (profile.kind === 'profile') {
        await this.saves.mergeVisitorInto(visitor.visitorId, profile.profileId);
      }
    }

    // Spent either way — merged, or belonging to somebody else's session. Keeping it
    // would let the next sign-in try to adopt the same rows again.
    res.clearCookie(VISITOR_COOKIE, { path: '/' });
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!(await this.captcha.verify(dto.captchaToken, req.ip))) {
      throw new BadRequestException('אימות אנושיות נכשל. נסו שוב.');
    }
    return this.send(req, res, await this.auth.signup(dto, this.meta(req)));
  }

  /**
   * Consumer signup. A separate route rather than a flag on `/signup`: the two have
   * different required fields — an agency name or claim is mandatory there and
   * meaningless here — and one endpoint would validate neither properly.
   */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('signup/buyer')
  async signupBuyer(
    @Body() dto: BuyerSignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!(await this.captcha.verify(dto.captchaToken, req.ip))) {
      throw new BadRequestException('אימות אנושיות נכשל. נסו שוב.');
    }
    return this.send(req, res, await this.auth.signupBuyer(dto, this.meta(req)));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.send(req, res, await this.auth.login(dto.email, dto.password, this.meta(req)));
  }

  /** The refresh cookie is path-scoped to exactly this route. */
  @Public()
  @Throttle({ auth: { limit: 60, ttl: 15 * 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!presented) {
      clearAuthCookies(res, this.cookieOpts);
      throw new UnauthorizedException('ההתחברות פגה. יש להתחבר מחדש.');
    }

    try {
      return this.send(req, res, await this.auth.refresh(presented, this.meta(req)));
    } catch (e) {
      clearAuthCookies(res, this.cookieOpts);
      throw e;
    }
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout((req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE]);
    clearAuthCookies(res, this.cookieOpts);
  }

  @HttpCode(204)
  @Post('logout-all')
  async logoutAll(@CurrentUser() principal: Principal, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutEverywhere(principal.userId);
    clearAuthCookies(res, this.cookieOpts);
  }

  // ── email verification ──────────────────────────────────────────────────────

  /**
   * The link in the email points here, not at the SPA, so the token is validated and
   * then dropped — it never reaches the browser history or a Referer header.
   */
  @Public()
  @Get('email-verification/redirect')
  async verifyRedirect(@Query('token') token: string, @Res() res: Response) {
    const ok = token ? await this.auth.verifyEmail(token) : false;
    res.redirect(`${this.appUrl}/login?verified=${ok ? '1' : '0'}`);
  }

  /** The same thing for a client that would rather call the API itself. */
  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60 * 60_000 } })
  @HttpCode(200)
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const ok = await this.auth.verifyEmail(dto.token);
    if (!ok) throw new BadRequestException('הקישור אינו תקף או שפג תוקפו.');
    return { verified: true };
  }

  @Throttle({ auth: { limit: 5, ttl: 60 * 60_000 } })
  @HttpCode(204)
  @Post('resend-verification')
  async resendVerification(@CurrentUser() principal: Principal) {
    await this.auth.resendVerification(principal.userId);
  }

  // ── password reset ──────────────────────────────────────────────────────────

  /** Always 204, whether or not the address exists. */
  @Public()
  @Throttle({ auth: { limit: 6, ttl: 60 * 60_000 } })
  @HttpCode(204)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    if (!(await this.captcha.verify(dto.captchaToken, req.ip))) return;
    await this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Get('password-reset/redirect')
  resetRedirect(@Query('token') token: string, @Res() res: Response) {
    // Handed straight to the SPA form; it is consumed by the POST below.
    res.redirect(`${this.appUrl}/reset-password?token=${encodeURIComponent(token ?? '')}`);
  }

  @Public()
  @Throttle({ auth: { limit: 6, ttl: 60 * 60_000 } })
  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto, @Res({ passthrough: true }) res: Response) {
    const ok = await this.auth.resetPassword(dto.token, dto.password);
    if (!ok) throw new BadRequestException('הקישור אינו תקף או שפג תוקפו.');
    // Every session died with the reset, including this browser's.
    clearAuthCookies(res, this.cookieOpts);
    return { reset: true };
  }

  /** What the client calls on boot to hydrate its session. */
  @Get('me')
  async me(@CurrentUser() principal: Principal) {
    return { user: await this.auth.me(principal.userId) };
  }

  /**
   * Become an agency on an account that already exists.
   *
   * Signed in, because that is the difference from `/signup`: the account is already
   * there and only the agency is missing. Which is exactly the state someone is left in
   * after signing in with Google from the agency pages, since no agency name survives a
   * redirect through Google.
   *
   * The membership it creates is `pending`. Approval is still an admin's.
   */
  @Throttle(AUTH_THROTTLE)
  @Post('agency')
  async attachAgency(@Body() dto: AttachAgencyDto, @CurrentUser() principal: Principal) {
    return { user: await this.auth.attachAgency(principal.userId, dto) };
  }

  /**
   * A request that was turned down, sent again — with corrected details, or for a
   * different office. The waiting page is where the person does this.
   */
  @Throttle(AUTH_THROTTLE)
  @Post('agency/resubmit')
  async resubmitAgency(@Body() dto: ResubmitAgencyDto, @CurrentUser() principal: Principal) {
    return { user: await this.auth.resubmitAgency(principal.userId, dto) };
  }

  // ── Google ────────────────────────────────────────────────────────────────
  // A server-side redirect flow: the code is exchanged here, never in the browser, and
  // the result is the same cookie pair email login sets. Nothing about the session
  // differs by how it was established.

  /** Whether to offer the button at all. Public: it is asked before signing in. */
  @Public()
  @Get('google/available')
  googleAvailable() {
    return { available: this.google.isConfigured() };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Get('google')
  startGoogle(@Query('returnTo') returnTo: string | undefined, @Res() res: Response) {
    // Validated before it is signed into the state, so the callback cannot be talked
    // into bouncing the browser to another origin.
    res.redirect(this.google.authorizationUrl(safeReturnTo(returnTo)));
  }

  /**
   * Google sends the browser here. Errors redirect to the login page with a reason
   * rather than rendering JSON — whoever lands here is a person, not a client.
   */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const appUrl = this.appUrl;

    // The user pressed cancel on Google's screen. Not an error worth a message.
    if (error || !code || !state) return res.redirect(`${appUrl}/login`);

    try {
      const { identity, returnTo } = await this.google.exchange(code, state);
      const result = await this.auth.loginWithGoogle(identity, this.meta(req));
      setAuthCookies(res, result, this.cookieOpts);
      // This path does not go through `send` — it redirects rather than replying — so
      // the saves a browser made before signing in with Google are collected here too.
      await this.adoptAnonymousSaves(req, res, result.user.id);
      return res.redirect(`${appUrl}${safeReturnTo(returnTo)}`);
    } catch (e) {
      const message = e instanceof HttpException ? e.message : 'ההתחברות עם Google נכשלה.';
      this.logger.warn(`Google callback failed: ${message}`);
      return res.redirect(`${appUrl}/login?googleError=${encodeURIComponent(message)}`);
    }
  }
}

/**
 * Where the browser may be sent after signing in. Anything that is not a plain in-app
 * path is discarded — `//evil.com` is protocol-relative and the browser treats it as
 * another origin, which is the classic open redirect.
 */
function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
