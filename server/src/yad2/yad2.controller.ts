import { BadRequestException, Body, Controller, Get, Header, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { PlatformAdmin } from '../auth/decorators/roles.decorator.js';
import { ScrapeAgencyDto } from './dto/scrape-agency.dto.js';
import { buildCsv, csvFilename, type CsvKind } from './yad2.csv.js';
import { Yad2Service } from './yad2.service.js';
import { SECTIONS, type Section } from './yad2.types.js';

const CSV_KINDS: CsvKind[] = ['assets', 'team', 'agency'];

/**
 * Platform staff by default, because the routes that *scrape* can start a Playwright
 * browser against a third party from our IP and write to our database.
 *
 * The routes that only read what we already collected are marked `@Public()`
 * individually — an agency's page is public data, and locking the reads too took the
 * agency view down with the scraper.
 */
@PlatformAdmin()
@Controller('yad2')
export class Yad2Controller {
  constructor(
    private readonly yad2: Yad2Service,
    private readonly config: ConfigService,
  ) {}

  /**
   * Whether agencies may see yad2 at all. Public, because the signup form and the
   * public agency page ask before anyone is signed in. A platform admin ignores this
   * and is told so by the client from their own role.
   */
  @Public()
  @Get('for-agencies')
  forAgencies() {
    return { enabled: this.config.get<boolean>('yad2.forAgencies') ?? true };
  }

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

  /** A directory of what we hold. Reads our own database; starts nothing. */
  @Public()
  @Get('agencies')
  listCached() {
    return this.yad2.listCached();
  }

  /** The public agency page: cached data only, and 404 when we have none. */
  @Public()
  @Get('agency/:agencyId')
  async getAgency(@Param('agencyId') agencyId: string, @Query('section') section?: string) {
    const chosen = (SECTIONS.includes(section as Section) ? section : 'forsale') as Section;
    const cached = await this.yad2.getCached(agencyId, chosen);
    if (!cached) throw new BadRequestException(`Nothing cached for agency ${agencyId} (${chosen}).`);
    return cached;
  }

  /**
   * `kind` is one of assets | team | agency. Served as a UTF-8 CSV download.
   *
   * Public, like the agency page it belongs to: it exports exactly the data that page
   * already renders, so withholding it protects nothing and only leaves a dead button.
   */
  @Public()
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
