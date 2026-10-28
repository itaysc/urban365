import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import type { DatabaseConfig } from '../config/configuration.js';
import type { TenantClsStore } from './cls.store.js';

/** The transaction the interceptor opened for this request, stashed in CLS. */
export const TENANT_TX = 'tenantTx';

type TxClient = Omit<PrismaClient, '$transaction' | '$connect' | '$disconnect' | '$on' | '$extends'>;

/**
 * The client every tenant-facing module uses.
 *
 * It connects as `nadlan_app`, which does **not** own the tables, so row-level security
 * applies to it — unlike the owner role behind `PrismaService`, which bypasses policies.
 * Two clients rather than one flag means the choice is a visible, greppable import.
 *
 * `client` returns the request's open transaction when there is one, because the
 * `SET LOCAL` that scopes RLS only holds for the connection inside that transaction.
 */
@Injectable()
export class TenantPrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenantPrismaService.name);
  private readonly base: PrismaClient;

  constructor(
    config: ConfigService,
    private readonly cls: ClsService<TenantClsStore & { [TENANT_TX]?: TxClient }>,
  ) {
    const { appUrl, url } = config.getOrThrow<DatabaseConfig>('database');
    const connectionString = appUrl || url;

    if (connectionString === url) {
      this.logger.warn(
        'APP_DATABASE_URL is unset, so tenant queries run as the table owner — ' +
          'row-level security does not apply. Fine before the RLS migration; not after.',
      );
    }

    this.base = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }

  /** Use this everywhere instead of touching the client directly. */
  get client(): TxClient {
    const tx = this.cls.isActive() ? this.cls.get(TENANT_TX) : undefined;
    return tx ?? this.base;
  }

  /** Only the interceptor needs this, to open the per-request transaction. */
  get root(): PrismaClient {
    return this.base;
  }

  async onModuleInit(): Promise<void> {
    await this.base.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }
}
