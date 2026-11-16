import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { listingImageUrl } from '../agency/image-url.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { AgencyDump, RawListing } from './yad2.types.js';
import { withWatermark } from './watermark.js';

const MAX_IMAGES = 30;
const MAX_BYTES = 12 * 1024 * 1024;

export interface ImageCopyResult {
  listings: number;
  uploaded: number;
  skipped: number;
  failed: number;
}

/** Cover first, then the gallery, without storing the same address twice. */
export function listingPhotoUrls(card: RawListing | undefined, item: RawListing | undefined): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const listing of [item, card]) {
    const meta = listing?.metaData;
    if (!meta) continue;
    for (const raw of [meta.coverImage, ...(meta.images ?? [])]) {
      if (!raw) continue;
      const url = raw.startsWith('//') ? `https:${raw}` : raw;
      if (!url.startsWith('https://') && !url.startsWith('http://')) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
      if (urls.length >= MAX_IMAGES) return urls;
    }
  }

  return urls;
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { Referer: 'https://www.yad2.co.il/', Accept: 'image/avif,image/webp,image/*,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_BYTES) return null;
    return buffer;
  } catch {
    return null;
  }
}

/**
 * Copies a scrape's listing photos into this agency's folder in the bucket.
 *
 * A listing that already has photos is left alone, so a second run does not pile
 * copies on top of an upload. The Yad2 address is never what gets stored.
 */
export async function copyYad2ListingImages(
  prisma: PrismaService,
  storage: StorageService,
  dump: AgencyDump,
  yad2Id: string,
): Promise<ImageCopyResult> {
  const logger = new Logger('ImportImages');
  const result: ImageCopyResult = { listings: 0, uploaded: 0, skipped: 0, failed: 0 };

  const agency = await prisma.agency.findUnique({ where: { yad2Id }, select: { id: true } });
  if (!agency) throw new Error(`No office is linked to yad2 ${yad2Id}.`);

  const cards = new Map<string, RawListing>();
  for (const card of dump.feed) if (card.token) cards.set(card.token, card);
  const items = new Map<string, RawListing>();
  for (const item of dump.items) if (item.token) items.set(item.token, item);

  for (const token of cards.keys()) {
    const urls = listingPhotoUrls(cards.get(token), items.get(token));
    if (urls.length === 0) continue;

    const listing = await prisma.listing.findFirst({
      where: { token, agencyId: agency.id },
      select: { id: true, _count: { select: { images: true } } },
    });
    if (!listing) continue;
    if (listing._count.images > 0) {
      result.skipped += 1;
      continue;
    }

    const stored: string[] = [];
    for (const url of urls) {
      const downloaded = await download(url);
      const buffer = downloaded ? await withWatermark(downloaded).catch(() => downloaded) : null;
      const contentType = buffer ? storage.detectImageType(buffer) : null;
      if (!buffer || !contentType || !storage.extensionFor(contentType)) {
        result.failed += 1;
        continue;
      }

      let storageKey: string;
      try {
        storageKey = await storage.putObject(
          `agencies/${agency.id}/listings/${listing.id}`,
          buffer,
          contentType,
        );
      } catch (error) {
        if (error instanceof ServiceUnavailableException) throw error;
        logger.warn(`Upload failed for ${token}: ${error instanceof Error ? error.message : String(error)}`);
        result.failed += 1;
        continue;
      }

      const image = await prisma.listingImage.create({
        data: { listingId: listing.id, storageKey, url: listingImageUrl(''), position: stored.length },
        select: { id: true },
      });
      const path = listingImageUrl(image.id);
      await prisma.listingImage.update({ where: { id: image.id }, data: { url: path } });
      stored.push(path);
      result.uploaded += 1;
    }

    if (stored.length === 0) continue;
    await prisma.listing.update({
      where: { id: listing.id },
      data: { coverImageUrl: stored[0], imageUrls: stored, imagesCount: stored.length },
    });
    result.listings += 1;
    logger.log(`${token}: ${stored.length} photo(s) in agencies/${agency.id}/listings/${listing.id}`);
  }

  return result;
}
