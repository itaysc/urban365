import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { MortgageCasesService } from './mortgage-cases.service.js';
import { CreateMortgageCaseDto, UpdateMortgageCaseDto } from './dto/mortgage-case.dto.js';

/** The mortgage-broker vertical's pipeline. */
@UseGuards(TenantGuard)
@Controller('my/mortgage-cases')
export class MortgageCasesController {
  constructor(private readonly cases: MortgageCasesService) {}

  /** The whole pipeline, grouped by stage — same shape as `GET /my/deals`. */
  @Get()
  board() {
    return this.cases.board();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cases.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateMortgageCaseDto) {
    return this.cases.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMortgageCaseDto) {
    return this.cases.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cases.remove(id);
  }
}
