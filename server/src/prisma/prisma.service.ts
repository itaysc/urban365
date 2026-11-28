import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { connectWhenReady, POSTGRES_WAKE_BUDGET_MS } from './connect-when-ready.js';

/**
 * The pool the owner client and the tenant client both use.
 *
 * `keepAlive` is what notices a socket the server has already dropped. The idle
 * timeout is pg's own default, named because a connection that sat through a sleep
 * is the one the next request finds dead — and that failure is the generic 500.
 */
export function postgresAdapter(connectionString: string, logger: Logger): PrismaPg {
  return new PrismaPg(
    {
      connectionString,
      keepAlive: true,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    },
    {
      onPoolError: (error) => {
        logger.warn(`Postgres dropped an idle connection (${error.message}).`);
      },
    },
  );
}

/**
 * Prisma 7 takes its connection through a driver adapter rather than a url in the
 * schema, so the pool is built here from DATABASE_URL and handed to the client.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger: Logger;
  private readonly nodeEnv: string;

  constructor(config: ConfigService) {
    const logger = new Logger(PrismaService.name);
    const connectionString = config.getOrThrow<string>('database.url');
    super({ adapter: postgresAdapter(connectionString, logger) });
    this.logger = logger;
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
