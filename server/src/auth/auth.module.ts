import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthTokenService } from './auth-token.service.js';
import { CaptchaService } from './captcha.service.js';
import { GoogleService } from './google.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';
import { SavesModule } from '../saves/saves.module.js';
import { VisitorModule } from '../visitor/visitor.module.js';

/**
 * Deliberately uses the privileged PrismaService: login looks a user up by email before
 * any agency context exists, so these queries cannot be tenant-scoped.
 */
@Module({
  imports: [JwtModule.register({}), SavesModule, VisitorModule],
  controllers: [AuthController],
  providers: [AuthService, GoogleService, PasswordService, TokenService, SessionService, AuthTokenService, CaptchaService],
  // PasswordService is exported for the invite flow, which hashes a password for a
  // user created outside signup.
  exports: [TokenService, AuthTokenService, PasswordService],
})
export class AuthModule {}
