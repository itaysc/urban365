import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { connectWhenReady, POSTGRES_WAKE_BUDGET_MS } from './connect-when-ready.js';

/**
 * Prisma 7 takes its connection through a driver adapter rather than a url in the
 * schema, so the pool is built here from DATABASE_URL and handed to the client.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly nodeEnv: string;

  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>('database.url');
    super({ adapter: new PrismaPg({ connectionString }) });
    this.nodeEnv = config.get<string>('app.nodeEnv') ?? 'development';
  }

  async onModuleInit(): Promise<void> {
    await connectWhenReady(() => this.ping(), {
      // Tests fail immediately when the database is absent. Production waits through
      // the wake, because listening earlier is what serves the first request a 500.
      budgetMs: this.nodeEnv === 'test' ? 0 : POSTGRES_WAKE_BUDGET_MS,
      warn: (message) => this.logger.warn(message),
    });
    this.logger.log('Connected to Postgres');
  }

  private async ping(): Promise<void> {
    await this.$connect();
    await this.$queryRawUnsafe('SELECT 1');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
