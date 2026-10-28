import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
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
import { CaptchaService } from './captcha.service.js';
import { LoginDto } from './dto/login.dto.js';
import { ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto } from './dto/password.dto.js';
import { SignupDto } from './dto/signup.dto.js';
import type { Principal } from './types/principal.js';

/** Tight limits on the routes worth attacking. */
const AUTH_THROTTLE = { auth: { limit: 10, ttl: 15 * 60_000 } };

@Controller('auth')
export class AuthController {
  private readonly cookieOpts: { isProduction: boolean; domain?: string };

  private readonly appUrl: string;

  constructor(
    private readonly auth: AuthService,
    private readonly captcha: CaptchaService,
    config: ConfigService,
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
  private send(res: Response, result: Awaited<ReturnType<AuthService['login']>>) {
    setAuthCookies(res, result, this.cookieOpts);
    return { user: result.user };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!(await this.captcha.verify(dto.captchaToken, req.ip))) {
      throw new BadRequestException('אימות אנושיות נכשל. נסו שוב.');
    }
    return this.send(res, await this.auth.signup(dto, this.meta(req)));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.send(res, await this.auth.login(dto.email, dto.password, this.meta(req)));
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
      return this.send(res, await this.auth.refresh(presented, this.meta(req)));
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
}
