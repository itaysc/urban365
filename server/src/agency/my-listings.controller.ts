import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';

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
}
