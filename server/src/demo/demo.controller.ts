import { Controller, Delete, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { Principal } from '../auth/types/principal.js';
import { can } from '../auth/permissions.js';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { DemoService } from './demo.service.js';

/**
 * Filling an agency with something to look at, and emptying it again.
 *
 * Closed in production by the server, not hidden by the client. A button nobody can see
 * is still a route anybody can post to, and this one deletes rows — so the check is
 * here, where it is the last word, and the client's own hiding is a convenience on top
 * of it rather than the protection itself.
 */
@UseGuards(TenantGuard)
@Controller('my/demo-data')
export class DemoController {
  private readonly isProduction: boolean;

  constructor(
    private readonly demo: DemoService,
    private readonly context: RequestContextService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('app.nodeEnv') === 'production';
  }

  @Get()
  status() {
    this.assertAllowed();
    return this.demo.status(this.context.requireAgencyId());
  }

  @Post()
  seed(@CurrentUser() principal: Principal) {
    this.assertAllowed();
    return this.demo.seed(this.context.requireAgencyId(), principal.userId);
  }

  @Delete()
  clear() {
    this.assertAllowed();
    return this.demo.clear(this.context.requireAgencyId());
  }

  /**
   * Two conditions, and both matter.
   *
   * Not in production, because demo data in a real agency's account is somebody's
   * afternoon spent working out which of their customers are real. And an owner only,
   * because the clear deletes rows — an agent who finds the button should not be able
   * to empty the agency's demo set while a colleague is using it.
   */
  private assertAllowed(): void {
    if (this.isProduction) {
      throw new ForbiddenException('הפעולה זמינה רק בסביבת פיתוח.');
    }
    if (!can(this.context.getPrincipal(), 'agency:manage')) {
      throw new ForbiddenException('רק בעלים של הסוכנות יכול לנהל נתוני הדגמה.');
    }
  }
}
