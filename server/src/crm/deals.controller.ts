import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { DealsService } from './deals.service.js';
import { CreateDealDto, UpdateDealDto } from './dto/deal.dto.js';

@UseGuards(TenantGuard)
@Controller('my/deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  /** The whole pipeline, grouped by stage. */
  @Get()
  board() {
    return this.deals.board();
  }

  @Post()
  create(@Body() dto: CreateDealDto) {
    return this.deals.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDealDto) {
    return this.deals.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.deals.remove(id);
  }
}
