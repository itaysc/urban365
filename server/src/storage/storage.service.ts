import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { StorageConfig } from '../config/configuration.js';
import { DOCUMENT_EXTENSIONS } from './document-type.js';
import { sniffImageType } from './image-type.js';

/** What may be uploaded. Checked on the declared type and on the magic bytes. */
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export interface StoredObject {
  buffer: Buffer;
  contentType: string;
}

/**
 * Turns an S3 failure into something a caller can act on. Without this a misconfigured
 * bucket surfaced as a raw AWS SDK error and a 500 with a stack trace — true, but it
 * told whoever saw it nothing about what to fix.
 */
function asStorageError(error: unknown): never {
  const name = (error as { name?: string })?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;

  if (name === 'NoSuchBucket') {
    throw new ServiceUnavailableException(
      'דלי האחסון אינו קיים. הריצו `npm run storage:init` בשרת.',
    );
  }
  if (name === 'AccessDenied' || name === 'InvalidAccessKeyId' || name === 'SignatureDoesNotMatch' || status === 403) {
    throw new ServiceUnavailableException('פרטי ההתחברות לאחסון אינם תקינים.');
  }

  throw error;
}

export function isNotFoundError(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}

/**
 * Backblaze B2 over its S3-compatible API, following the same shape as the reference
 * project: the bucket stays **private**, and bytes are read back through this service
 * and served by our own routes at a stable URL.
 *
 * That is the reference's avatar pattern rather than its invoice one. Invoices are
 * presigned GETs, which cap at seven days — fine for a download link in an email, wrong
 * for a photo on a listing page, where an expiring URL cannot be cached by a browser or
 * a CDN and cannot be indexed. Proxying costs us the bandwidth but keeps the URL stable.
 *
 * It also means the bucket needs no public-read policy and no separate public base URL:
 * the five B2_* credentials are the whole configuration.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly config: StorageConfig;
  private client: S3Client | null = null;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<StorageConfig>('storage');
  }

  /**
   * Missing credentials must not crash module load — search, auth and the importer all
   * work without storage, and most dev machines will never set these.
   */
  isConfigured(): boolean {
    const { keyId, applicationKey, bucket, endpoint, region } = this.config;
    return [keyId, applicationKey, bucket, endpoint, region].every((v) => v.trim().length > 0);
  }

  extensionFor(contentType: string): string | null {
    return ALLOWED_TYPES[contentType] ?? DOCUMENT_EXTENSIONS[contentType] ?? null;
  }

  /**
   * Sniffs the leading bytes rather than trusting the multipart Content-Type, which the
   * uploader controls. A file declared `image/png` that is really something else gets no
   * further than this.
   */
  detectImageType(buffer: Buffer): string | null {
    return sniffImageType(buffer);
  }

  /** Lazily built, so an unconfigured deployment never constructs one. */
  private getClient(): S3Client {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('אחסון התמונות אינו מוגדר.');
    }

    this.client ??= new S3Client({
      region: this.config.region.trim(),
      endpoint: this.config.endpoint.trim(),
      credentials: {
        accessKeyId: this.config.keyId.trim(),
        secretAccessKey: this.config.applicationKey.trim(),
      },
      // Backblaze's S3 API requires path-style addressing.
      forcePathStyle: true,
    });

    return this.client;
  }

  private bucket(): string {
    return this.config.bucket.trim();
  }

  /**
   * Stores one object and returns its key. The key is generated here rather than taken
   * from the caller: a client-supplied key is a path-traversal and overwrite primitive.
   */
  async putObject(prefix: string, buffer: Buffer, contentType: string): Promise<string> {
    const extension = this.extensionFor(contentType);
    if (!extension) throw new ServiceUnavailableException('סוג קובץ לא נתמך.');

    const storageKey = `${prefix}/${randomUUID()}.${extension}`;

    try {
      await this.getClient().send(
        new PutObjectCommand({
          Bucket: this.bucket(),
          Key: storageKey,
          Body: buffer,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      this.logger.error(`Upload to ${this.bucket()} failed: ${(error as Error).message}`);
      asStorageError(error);
    }

    return storageKey;
  }

  async getObject(storageKey: string): Promise<StoredObject> {
    try {
      const result = await this.getClient().send(
        new GetObjectCommand({ Bucket: this.bucket(), Key: storageKey }),
      );

      return {
        buffer: await streamToBuffer(result.Body),
        contentType: result.ContentType ?? 'application/octet-stream',
      };
    } catch (error) {
      // A missing *object* is the caller's to handle — it means the row outlived the
      // file, which the serve route turns into a 404. Only configuration problems are
      // rewritten here.
      if (isNotFoundError(error) && (error as { name?: string })?.name !== 'NoSuchBucket') throw error;
      asStorageError(error);
    }
  }

  /**
   * Best effort. A row removed from the database with its object left behind is an
   * orphan costing fractions of a cent; a delete that throws and rolls back the whole
   * request is a broken feature, so this logs and moves on.
   */
  async deleteObject(storageKey: string): Promise<void> {
    if (!this.isConfigured()) return;

    try {
      await this.getClient().send(
        new DeleteObjectCommand({ Bucket: this.bucket(), Key: storageKey }),
      );
    } catch (error) {
      this.logger.warn(`Could not delete ${storageKey}: ${(error as Error).message}`);
    }
  }
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  throw new Error('Expected the S3 response body to be a readable stream or a buffer');
}
