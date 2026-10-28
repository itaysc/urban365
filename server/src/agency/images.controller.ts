import { Controller, Get, Header, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { StorageService, isNotFoundError } from '../storage/storage.service.js';

/**
 * Serves the bytes for images held in the private bucket, the way the reference project
 * serves avatars. These are the only routes that read objects, so the bucket needs no
 * public-read policy and no separate public base URL.
 *
 * Both are `@Public()`: listing photos and agency banners appear on pages anyone can
 * see. What is *visible* is still decided by row-level security — the tenant client
 * shows images only for published listings to a caller with no agency in context — so a
 * draft's photos are not reachable by guessing an id.
 */
@Controller()
export class ImagesController {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get('listings/images/:imageId')
  // A year: the id is unique per upload, so the bytes behind a given URL never change.
  // Replacing a photo means a new row and a new URL, never a stale cache.
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  // The SPA may be served from a different origin to the API, and without this the
  // browser refuses to paint the <img>.
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async listingImage(@Param('imageId') imageId: string, @Res() res: Response) {
    const image = await this.prisma.client.listingImage.findUnique({
      where: { id: imageId },
      select: { storageKey: true },
    });

    if (!image) throw new NotFoundException('התמונה לא נמצאה.');
    await this.send(image.storageKey, res);
  }

  @Public()
  @Get('agencies/:agencyId/cover')
  // Shorter, and not immutable: the URL carries a `v=` stamp that changes when the
  // banner is replaced, but an agency may also clear it outright.
  @Header('Cache-Control', 'public, max-age=86400')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async agencyCover(@Param('agencyId') agencyId: string, @Res() res: Response) {
    const agency = await this.prisma.client.agency.findUnique({
      where: { id: agencyId },
      select: { coverStorageKey: true },
    });

    if (!agency?.coverStorageKey) throw new NotFoundException('לא נמצאה תמונת נושא.');
    await this.send(agency.coverStorageKey, res);
  }

  private async send(storageKey: string, res: Response): Promise<void> {
    try {
      const { buffer, contentType } = await this.storage.getObject(storageKey);
      res.setHeader('Content-Type', contentType);
      res.send(buffer);
    } catch (error) {
      // A row pointing at an object that is gone is a 404, not a 500 — the usual cause
      // is a bucket emptied by hand in development.
      if (isNotFoundError(error)) throw new NotFoundException('התמונה לא נמצאה.');
      throw error;
    }
  }
}
