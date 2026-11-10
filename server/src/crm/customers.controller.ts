import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { CustomersService } from './customers.service.js';
import {
  CreateCustomerDto,
  ListCustomersQuery,
  UpdateCustomerDto,
} from './dto/customer.dto.js';

/** The agency's own people. */
@UseGuards(TenantGuard)
@Controller('my/customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Query() query: ListCustomersQuery) {
    return this.customers.list(query);
  }

  /** Customers removed from the list, waiting to be put back. */
  @Get('archive')
  archive() {
    return this.customers.archive();
  }

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customers.remove(id);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string) {
    return this.customers.restore(id);
  }
}
