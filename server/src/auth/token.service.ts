import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ACCESS_TOKEN_TTL_SEC,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
} from './auth.constants.js';
import type { AccessTokenClaims } from './types/principal.js';

/**
 * Signs and verifies the access token. Issuer, audience and algorithm are pinned in both
 * directions from one constant, so a token minted for another purpose cannot validate
 * here just because it was signed with the same secret.
 */
@Injectable()
export class TokenService {
  private readonly secret: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('auth.jwtSecret');
  }

  signAccessToken(claims: AccessTokenClaims): string {
    return this.jwt.sign(claims, {
      secret: this.secret,
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: ACCESS_TOKEN_TTL_SEC,
    });
  }

  /** Returns null for anything invalid, expired or not minted for this app. */
  verifyAccessToken(token: string): AccessTokenClaims | null {
    try {
      return this.jwt.verify<AccessTokenClaims>(token, {
        secret: this.secret,
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
    } catch {
      return null;
    }
  }
}
