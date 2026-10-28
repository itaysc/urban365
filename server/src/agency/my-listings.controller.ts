import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { MyListingsService } from './my-listings.service.js';
import {
  AttachImageDto,
  PresignImageDto,
  ReorderImagesDto,
  UpdateListingDto,
  UpsertListingDto,
} from './dto/listing.dto.js';

class MyListingsQuery {
  @IsOptional() @IsIn(['draft', 'published', 'archived']) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

/**
 * The agency's own listings — including drafts, which never appear in public search.
 *
 * The `agencyId` filter here is **defence in depth, not the boundary**. Row-level
 * security is the boundary: the interceptor sets `app.current_agency_id` on this
 * request's transaction and the database refuses anything else, so a filter someone
 * forgets on a future route still cannot leak.
 *
 * Both are present deliberately. Relying on RLS alone means this endpoint returns every
 * agency's rows for as long as the policies are not yet applied, and relying on the
 * filter alone is the convention-and-hope model this architecture exists to avoid.
 */
@UseGuards(TenantGuard)
@Controller('my/listings')
export class MyListingsController {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
    private readonly listings: MyListingsService,
  ) {}

  @Get()
  async list(@Query() query: MyListingsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 24;

    const agencyId = this.context.requireAgencyId();
    const where = {
      agencyId,
      ...(query.status ? { status: query.status as 'draft' | 'published' | 'archived' } : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.client.listing.count({ where }),
      this.prisma.client.listing.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          token: true,
          status: true,
          section: true,
          price: true,
          rooms: true,
          squareMeter: true,
          city: true,
          street: true,
          coverImageUrl: true,
          agencyId: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      items: rows,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      // Echoed so a test can assert the scoping actually applied.
      scopedToAgencyId: agencyId,
    };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.listings.findOne(id);
  }

  @Post()
  create(@Body() dto: UpsertListingDto) {
    return this.listings.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateListingDto) {
    return this.listings.update(id, dto);
  }

  /** Archive, not delete — leads and deals point at listings. */
  @Delete(':id')
  archive(@Param('id') id: string) {
    return this.listings.archive(id);
  }

  // ── images ────────────────────────────────────────────────────────────────
  // Two steps on purpose: the browser PUTs the bytes straight to Backblaze with the
  // url this returns, then tells us the key. Photos never pass through this API.

  @Post(':id/images/presign')
  presignImage(@Param('id') id: string, @Body() dto: PresignImageDto) {
    return this.listings.presignImage(id, dto.contentType);
  }

  @Post(':id/images')
  attachImage(@Param('id') id: string, @Body() dto: AttachImageDto) {
    return this.listings.attachImage(id, dto);
  }

  @Patch(':id/images/order')
  reorderImages(@Param('id') id: string, @Body() dto: ReorderImagesDto) {
    return this.listings.reorderImages(id, dto.imageIds);
  }

  @Delete(':id/images/:imageId')
  removeImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.listings.removeImage(id, imageId);
  }
}
