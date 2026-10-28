import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Principal } from '../auth/types/principal.js';
import type { TenantClsStore } from './cls.store.js';

/**
 * A three-method facade over CLS. Services inject this, never `ClsService` directly —
 * it keeps the AsyncLocalStorage detail in one file and makes unit tests a plain stub.
 */
@Injectable()
export class RequestContextService {
  constructor(private readonly cls: ClsService<TenantClsStore>) {}

  getPrincipal(): Principal | undefined {
    return this.cls.isActive() ? this.cls.get('principal') : undefined;
  }

  getAgencyId(): string | undefined {
    return this.cls.isActive() ? this.cls.get('agencyId') : undefined;
  }

  /**
   * Throws rather than returning a stale or missing id. Detached work — the scrape job,
   * a timer — inherits whatever store was active when it was spawned, so a silent
   * fallback here would be a cross-tenant write waiting to happen.
   */
  requireAgencyId(): string {
    const agencyId = this.getAgencyId();
    if (!agencyId) {
      throw new InternalServerErrorException(
        'No agency in context: this query must run inside an authenticated tenant request.',
      );
    }
    return agencyId;
  }
}
