import { Controller, Get, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { OverviewService } from './overview.service.js';

/** The first screen of the day, in one request. */
@UseGuards(TenantGuard)
@Controller('my/overview')
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get()
  get() {
    return this.overview.get();
  }
}
