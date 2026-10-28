import { Body, Controller, ForbiddenException, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { can } from '../auth/permissions.js';
import { PresignCoverDto, UpdateAgencyProfileDto } from './dto/agency-profile.dto.js';

/**
 * The agency's own page: the banner and description shown to the public, which until now
 * only the scraper could write.
 */
@UseGuards(TenantGuard)
@Controller('my/agency')
export class AgencyProfileController {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
    private readonly storage: StorageService,
  ) {}

  private assertCanManage(): void {
    if (!can(this.context.getPrincipal(), 'agency:manage')) {
      throw new ForbiddenException('רק בעלים של הסוכנות יכול לערוך את עמוד הסוכנות.');
    }
  }

  @Get()
  async get() {
    const agencyId = this.context.requireAgencyId();
    return this.prisma.client.agency.findUniqueOrThrow({
      where: { id: agencyId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        description: true,
        phone: true,
        contactEmail: true,
        licenseNumber: true,
        logoUrl: true,
        coverImageUrl: true,
        _count: { select: { listings: true, leads: true, deals: true } },
      },
    });
  }

  @Patch()
  async update(@Body() dto: UpdateAgencyProfileDto) {
    this.assertCanManage();
    const agencyId = this.context.requireAgencyId();

    return this.prisma.client.agency.update({
      where: { id: agencyId },
      data: {
        ...dto,
        // An empty string is how the client clears the banner; '' is not a usable URL.
        ...(dto.coverImageUrl === '' ? { coverImageUrl: null } : {}),
      },
      select: { id: true, name: true, description: true, phone: true, contactEmail: true, coverImageUrl: true },
    });
  }

  @Post('cover/presign')
  presignCover(@Body() dto: PresignCoverDto) {
    this.assertCanManage();
    const agencyId = this.context.requireAgencyId();
    return this.storage.presignUpload(`agencies/${agencyId}/cover`, dto.contentType);
  }
}
