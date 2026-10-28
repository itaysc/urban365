import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator.js';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { LeadsService } from './leads.service.js';
import { CreateLeadDto, ImportLeadsDto, ListLeadsQuery, PublicEnquiryDto, UpdateLeadDto } from './dto/lead.dto.js';

/** The agency's inbox. */
@UseGuards(TenantGuard)
@Controller('my/leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list(@Query() query: ListLeadsQuery) {
    return this.leads.list(query);
  }

  @Get('counts')
  counts() {
    return this.leads.counts();
  }

  @Post()
  create(@Body() dto: CreateLeadDto) {
    return this.leads.create(dto);
  }

  @Post('import')
  import(@Body() dto: ImportLeadsDto) {
    return this.leads.importCsv(dto.csv);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.leads.remove(id);
  }
}

/**
 * The public enquiry form, on its own controller because it is the one lead route with
 * no session and no tenant guard — the agency comes from the listing, never the caller.
 */
@Controller('listings')
export class PublicEnquiryController {
  constructor(private readonly leads: LeadsService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':id/enquiries')
  submit(@Param('id') id: string, @Body() dto: PublicEnquiryDto) {
    return this.leads.createFromEnquiry(id, dto);
  }
}
