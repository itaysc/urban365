import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { setAuthCookies } from '../auth/cookies.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { PlatformAdmin } from '../auth/decorators/roles.decorator.js';
import type { Principal } from '../auth/types/principal.js';
import { PlatformInviteService } from './platform-invite.service.js';

class CreatePlatformInviteDto {
  @IsEmail({}, { message: 'כתובת אימייל לא תקינה.' })
  @MaxLength(200)
  email!: string;
}

class AcceptPlatformInviteDto {
  @IsString() @MaxLength(80) firstName!: string;
  @IsString() @MaxLength(80) lastName!: string;
  @IsString()
  @MinLength(10, { message: 'הסיסמה צריכה להיות באורך 10 תווים לפחות.' })
  @MaxLength(200)
  password!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}

/** Sent by a platform admin. No agency is involved. */
@PlatformAdmin()
@Controller('admin/invites')
export class PlatformInviteController {
  constructor(private readonly invites: PlatformInviteService) {}

  @Get()
  list() {
    return this.invites.list();
  }

  @Post()
  create(@Body() dto: CreatePlatformInviteDto, @CurrentUser() admin: Principal) {
    return this.invites.invite(dto.email, admin.userId);
  }

  @Delete(':id')
  revoke(@Param('id') id: string) {
    return this.invites.revoke(id);
  }
}

/**
 * Following the link. Public, because the person has no account yet — that is what
 * the link is for. Accepting opens a session, the same way signup used to.
 */
@Public()
@Controller('join')
export class JoinController {
  private readonly cookieOpts: { isProduction: boolean; domain?: string };

  constructor(
    private readonly invites: PlatformInviteService,
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.cookieOpts = {
      isProduction: config.get<string>('app.nodeEnv') === 'production',
      domain: config.get<string>('auth.cookieDomain') || undefined,
    };
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':token')
  preview(@Param('token') token: string) {
    return this.invites.preview(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post(':token/accept')
  async accept(
    @Param('token') token: string,
    @Body() dto: AcceptPlatformInviteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.invites.accept(token, dto);
    const result = await this.auth.openSession(userId, {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    setAuthCookies(res, result, this.cookieOpts);
    return { user: result.user };
  }
}
