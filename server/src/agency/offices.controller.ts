import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { UpsertOfficeDto } from './dto/office.dto.js';
import { OfficesService } from './offices.service.js';

/**
 * Throttled as a group because every write geocodes, and that call goes to a free
 * service run by somebody else. Thirty a minute is far more than an agency editing its
 * branches and far less than a way to use us as a geocoding proxy.
 */
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@UseGuards(TenantGuard)
@Controller('my/offices')
export class OfficesController {
  constructor(private readonly offices: OfficesService) {}

  @Get()
  list() {
    return this.offices.list();
  }

  @Post()
  create(@Body() dto: UpsertOfficeDto) {
    return this.offices.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpsertOfficeDto) {
    return this.offices.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.offices.remove(id);
  }
}
