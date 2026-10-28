import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { can } from '../auth/permissions.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Yad2Service } from '../yad2/yad2.service.js';
import { ImportYad2Dto, PresignCoverDto, UpdateAgencyProfileDto } from './dto/agency-profile.dto.js';

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
    /** Linking a yad2 id has to see every agency, not just this one. */
    private readonly owner: PrismaService,
    private readonly yad2: Yad2Service,
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

  /**
   * Import this agency's own listings from yad2 — the onboarding shortcut, so an agency
   * joining does not retype what it already published.
   *
   * This used to be a public page anyone could point at any yad2 id, which made the
   * server scrape a third party from our IP on a stranger's say-so. It is now owner-only
   * and writes into the caller's own agency: the yad2 id is first *linked* to their row,
   * so the scraper's `upsert` on `yad2Id` lands there instead of creating a new agency.
   */
  @Post('import/yad2')
  async importFromYad2(@Body() dto: ImportYad2Dto) {
    this.assertCanManage();
    const agencyId = this.context.requireAgencyId();

    let parsed: { agencyId: string; section: 'forsale' | 'rent' | 'commercial' | null };
    try {
      parsed = this.yad2.parseInput(dto.input) as typeof parsed;
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const yad2Id = parsed.agencyId;
    const section = dto.section ?? parsed.section ?? 'forsale';

    const agency = await this.owner.agency.findUniqueOrThrow({
      where: { id: agencyId },
      select: { id: true, yad2Id: true },
    });

    // Someone else's yad2 page is not theirs to import — that is the claim flow, which
    // a platform admin reviews.
    const taken = await this.owner.agency.findUnique({
      where: { yad2Id },
      select: { id: true },
    });
    if (taken && taken.id !== agencyId) {
      throw new BadRequestException('עמוד היד2 הזה כבר משויך לסוכנות אחרת.');
    }

    if (agency.yad2Id && agency.yad2Id !== yad2Id) {
      throw new BadRequestException('הסוכנות כבר מקושרת לעמוד יד2 אחר.');
    }

    if (!agency.yad2Id) {
      await this.owner.agency.update({ where: { id: agencyId }, data: { yad2Id } });
    }

    const job = this.yad2.start(yad2Id, section, { preserveProfile: true });
    return { jobId: job.id, status: job.status, yad2Id, section };
  }

  /** Progress for an import started above. */
  @Get('import/jobs/:id')
  importJob(@Param('id') id: string) {
    this.assertCanManage();
    const { status, progress, error, errorCode } = this.yad2.getJob(id);
    // The scraped payload is deliberately not returned: the listings are already in the
    // database under this agency, which is where the dashboard reads them from.
    return { status, progress, error, errorCode };
  }
}
