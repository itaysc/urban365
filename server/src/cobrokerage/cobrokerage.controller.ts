import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { CoBrokerageService } from './cobrokerage.service.js';
import { RequestCoBrokerageDto } from './dto/cobrokerage.dto.js';

/** Two agencies working one deal: what we asked, what we were asked, and the answers. */
@UseGuards(TenantGuard)
@Controller('my/cobrokerage')
export class CoBrokerageController {
  constructor(private readonly cobroke: CoBrokerageService) {}

  /** What we have asked others for. Includes our own customer; theirs never would. */
  @Get('sent')
  sent() {
    return this.cobroke.sent();
  }

  /** The inbox. Carries a brief and an agency, never a person. */
  @Get('received')
  received() {
    return this.cobroke.received();
  }

  @Post()
  request(@Body() dto: RequestCoBrokerageDto) {
    return this.cobroke.request(dto);
  }

  @Post(':id/accept')
  accept(@Param('id') id: string) {
    return this.cobroke.respond(id, true);
  }

  @Post(':id/decline')
  decline(@Param('id') id: string) {
    return this.cobroke.respond(id, false);
  }

  @Post(':id/withdraw')
  withdraw(@Param('id') id: string) {
    return this.cobroke.withdraw(id);
  }
}
