import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import type { Principal } from '../auth/types/principal.js';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { TeamService } from './team.service.js';
import { AcceptInviteDto, ChangeRoleDto, InviteMemberDto } from './dto/team.dto.js';

@UseGuards(TenantGuard)
@Controller('my/team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list() {
    return this.team.list();
  }

  @Post('invites')
  invite(@Body() dto: InviteMemberDto) {
    return this.team.invite(dto.email, dto.role);
  }

  @Delete('invites/:id')
  revokeInvite(@Param('id') id: string) {
    return this.team.revokeInvite(id);
  }

  @Patch('members/:id')
  changeRole(@Param('id') id: string, @Body() dto: ChangeRoleDto) {
    return this.team.changeRole(id, dto.role);
  }

  @Delete('members/:id')
  removeMember(@Param('id') id: string) {
    return this.team.removeMember(id);
  }
}

/**
 * Accepting an invite. Separate controller because these routes run without a tenant —
 * the agency comes from the invite, and the caller may have no account at all yet.
 */
@Controller('invites')
export class InviteController {
  constructor(private readonly team: TeamService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':token')
  preview(@Param('token') token: string) {
    return this.team.preview(token);
  }

  /**
   * `@Public()` so someone with no account can accept, but a session is still read when
   * one is present: an existing user must be signed in as the invited address, and this
   * is how that is checked.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':token/accept')
  accept(
    @Param('token') token: string,
    @Body() dto: AcceptInviteDto,
    @Req() req: Request & { principal?: Principal },
  ) {
    return this.team.accept(token, dto, req.principal?.userId);
  }
}
