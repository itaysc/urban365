import { BadRequestException, Body, Controller, Get, Header, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PlatformAdmin } from '../auth/decorators/roles.decorator.js';
import { ScrapeAgencyDto } from './dto/scrape-agency.dto.js';
import { buildCsv, csvFilename, type CsvKind } from './yad2.csv.js';
import { Yad2Service } from './yad2.service.js';
import { SECTIONS, type Section } from './yad2.types.js';

const CSV_KINDS: CsvKind[] = ['assets', 'team', 'agency'];

/**
 * Platform staff only. Every route here can start a Playwright browser that scrapes a
 * third party from our IP and writes to our database — it was reachable anonymously
 * until this change.
 */
@PlatformAdmin()
@Controller('yad2')
export class Yad2Controller {
  constructor(private readonly yad2: Yad2Service) {}

  /**
   * Resolves the input, and returns the cached result straight away when there is one.
   * Otherwise it starts a scrape job and the client polls `GET /yad2/jobs/:id`.
   */
  @Post('agency')
  async scrapeAgency(@Body() body: ScrapeAgencyDto) {
    let parsed: { agencyId: string; section: Section | null };
    try {
      parsed = this.yad2.parseInput(body.input);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const section = body.section ?? parsed.section ?? 'forsale';

    if (!body.refresh) {
      const cached = await this.yad2.getCached(parsed.agencyId, section);
      if (cached) return { status: 'done' as const, jobId: null, result: cached };
    }

    const job = this.yad2.start(parsed.agencyId, section);
    return { status: 'running' as const, jobId: job.id, result: null };
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    const { id: jobId, status, progress, error, errorCode, result, agencyId, section } = this.yad2.getJob(id);
    return { jobId, status, progress, error, errorCode, result, agencyId, section };
  }

  @Get('agencies')
  listCached() {
    return this.yad2.listCached();
  }

  @Get('agency/:agencyId')
  async getAgency(@Param('agencyId') agencyId: string, @Query('section') section?: string) {
    const chosen = (SECTIONS.includes(section as Section) ? section : 'forsale') as Section;
    const cached = await this.yad2.getCached(agencyId, chosen);
    if (!cached) throw new BadRequestException(`Nothing cached for agency ${agencyId} (${chosen}).`);
    return cached;
  }

  /** `kind` is one of assets | team | agency. Served as a UTF-8 CSV download. */
  @Get('agency/:agencyId/csv/:kind')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async downloadCsv(
    @Param('agencyId') agencyId: string,
    @Param('kind') kind: string,
    @Res({ passthrough: true }) res: Response,
    @Query('section') section?: string,
  ): Promise<string> {
    if (!CSV_KINDS.includes(kind as CsvKind)) {
      throw new BadRequestException(`kind must be one of: ${CSV_KINDS.join(', ')}`);
    }

    const chosen = (SECTIONS.includes(section as Section) ? section : 'forsale') as Section;
    const result = await this.yad2.getCached(agencyId, chosen);
    if (!result) throw new NotFoundException(`Nothing cached for agency ${agencyId} (${chosen}).`);

    res.setHeader('Content-Disposition', `attachment; filename="${csvFilename(result, kind as CsvKind)}"`);
    return buildCsv(result, kind as CsvKind);
  }
}
