import {
  BadRequestException,
  Delete,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { can } from '../auth/permissions.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { agencyCoverUrl } from './image-url.js';
import { Yad2Service } from '../yad2/yad2.service.js';
import { ImportYad2Dto, UpdateAgencyProfileDto } from './dto/agency-profile.dto.js';

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
        coBrokerage: true,
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
      data: { ...dto },
      select: {
        id: true,
        name: true,
        description: true,
        phone: true,
        contactEmail: true,
        coverImageUrl: true,
        coBrokerage: true,
      },
    });
  }

  /**
   * The banner, uploaded through this API into the private bucket and served back from
   * a stable path. The stored url carries a `v=` stamp so replacing the image is not
   * hidden behind a cached response.
   */
  @Post('cover')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  async uploadCover(@UploadedFile() file: Express.Multer.File) {
    this.assertCanManage();
    const agencyId = this.context.requireAgencyId();

    if (!file?.buffer?.length) throw new BadRequestException('לא התקבל קובץ.');

    const contentType = this.storage.detectImageType(file.buffer);
    if (!contentType || !this.storage.extensionFor(contentType)) {
      throw new BadRequestException('הקובץ אינו תמונה נתמכת.');
    }

    const existing = await this.prisma.client.agency.findUniqueOrThrow({
      where: { id: agencyId },
      select: { coverStorageKey: true },
    });

    const storageKey = await this.storage.putObject(`agencies/${agencyId}/cover`, file.buffer, contentType);
    const version = Date.now().toString(36);

    const updated = await this.prisma.client.agency.update({
      where: { id: agencyId },
      data: { coverStorageKey: storageKey, coverImageUrl: agencyCoverUrl(agencyId, version) },
      select: { id: true, coverImageUrl: true },
    });

    // Only once the new one is recorded, so a failed upload never leaves the agency
    // with no banner at all.
    if (existing.coverStorageKey) await this.storage.deleteObject(existing.coverStorageKey);

    return updated;
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

  /** Clears the banner and removes the object, so nothing is left orphaned in the bucket. */
  @Delete('cover')
  async removeCover() {
    this.assertCanManage();
    const agencyId = this.context.requireAgencyId();

    const existing = await this.prisma.client.agency.findUniqueOrThrow({
      where: { id: agencyId },
      select: { coverStorageKey: true },
    });

    const updated = await this.prisma.client.agency.update({
      where: { id: agencyId },
      data: { coverImageUrl: null, coverStorageKey: null },
      select: { id: true, coverImageUrl: true },
    });

    if (existing.coverStorageKey) await this.storage.deleteObject(existing.coverStorageKey);
    return updated;
  }
}
