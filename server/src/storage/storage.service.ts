import { randomUUID } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from '../config/configuration.js';

/** What the browser is allowed to PUT. Checked again on the key it asks for. */
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export interface PresignedUpload {
  /** PUT the bytes here, with the same Content-Type that was requested. */
  uploadUrl: string;
  /** Stored on the row; the object key inside the bucket. */
  storageKey: string;
  /** The stable public URL the image is served from afterwards. */
  url: string;
  expiresInSeconds: number;
}

const UPLOAD_TTL_SECONDS = 300;

/**
 * Backblaze B2 over its S3-compatible API, the same stack the reference project uses.
 *
 * Two deliberate differences from that project. It keeps the bucket private and presigns
 * every GET, which caps each link at seven days — fine for an invoice, wrong for a photo
 * on a public listing page that should be cacheable and indexable. So the bucket is
 * public-read and the stable URL is stored on the row.
 *
 * And uploads are presigned PUTs: the bytes go browser → B2 without passing through this
 * API, which keeps a twenty-photo upload off the request path entirely.
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
   * Missing credentials must not crash module load — the scraper, auth and search all
   * work without storage, and most dev machines will never set these.
   */
  isConfigured(): boolean {
    const { keyId, applicationKey, bucket, endpoint, region, publicBaseUrl } = this.config;
    return [keyId, applicationKey, bucket, endpoint, region, publicBaseUrl].every(
      (v) => v.trim().length > 0,
    );
  }

  extensionFor(contentType: string): string | null {
    return ALLOWED_TYPES[contentType] ?? null;
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

  publicUrlFor(storageKey: string): string {
    return `${this.config.publicBaseUrl.trim().replace(/\/$/, '')}/${storageKey}`;
  }

  /**
   * A presigned PUT for one object. The key is generated here rather than taken from the
   * caller: a client-supplied key is a path-traversal and overwrite primitive, and
   * prefixing by listing keeps deletes simple.
   */
  async presignUpload(prefix: string, contentType: string): Promise<PresignedUpload> {
    const extension = this.extensionFor(contentType);
    if (!extension) {
      throw new ServiceUnavailableException('סוג קובץ לא נתמך.');
    }

    const storageKey = `${prefix}/${randomUUID()}.${extension}`;
    const uploadUrl = await getSignedUrl(
      this.getClient(),
      new PutObjectCommand({
        Bucket: this.config.bucket.trim(),
        Key: storageKey,
        ContentType: contentType,
      }),
      { expiresIn: UPLOAD_TTL_SECONDS },
    );

    return {
      uploadUrl,
      storageKey,
      url: this.publicUrlFor(storageKey),
      expiresInSeconds: UPLOAD_TTL_SECONDS,
    };
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
        new DeleteObjectCommand({ Bucket: this.config.bucket.trim(), Key: storageKey }),
      );
    } catch (error) {
      this.logger.warn(`Could not delete ${storageKey}: ${(error as Error).message}`);
    }
  }
}
