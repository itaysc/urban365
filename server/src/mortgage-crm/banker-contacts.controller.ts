import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { BankerContactsService } from './banker-contacts.service.js';
import { CreateBankerContactDto, UpdateBankerContactDto } from './dto/banker-contact.dto.js';

/** The agency's own directory of banker contacts. */
@UseGuards(TenantGuard)
@Controller('my/banker-contacts')
export class BankerContactsController {
  constructor(private readonly contacts: BankerContactsService) {}

  @Get()
  list() {
    return this.contacts.list();
  }

  @Post()
  create(@Body() dto: CreateBankerContactDto) {
    return this.contacts.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBankerContactDto) {
    return this.contacts.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contacts.remove(id);
  }
}
