import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { assertBootConfig } from './auth/assert-boot-config.js';
import type { AppConfig, AuthConfig } from './config/configuration.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `nest start --watch` starts the new process while the old one may still hold the port,
 * so a plain listen can die with EADDRINUSE and leave the watcher with no app at all.
 * Retrying briefly rides over that handover.
 */
async function listenWithRetry(app: INestApplication, port: number, attempts = 10): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await app.listen(port, '0.0.0.0');
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'EADDRINUSE' || i === attempts - 1) throw e;
      if (i === 0) Logger.warn(`Port ${port} is still in use; waiting for it to free up…`, 'Bootstrap');
      await sleep(500);
    }
  }
}

/** Closes the HTTP server before exiting, so the port is free for the next process. */
function installShutdownHooks(app: INestApplication): void {
  let closing = false;

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      if (closing) return;
      closing = true;
      Logger.log(`${signal} received, shutting down`, 'Bootstrap');
      void app
        .close()
        .catch(() => undefined)
        .finally(() => process.exit(0));
    });
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const config = configService.getOrThrow<AppConfig>('app');
  const auth = configService.getOrThrow<AuthConfig>('auth');

  assertBootConfig({
    nodeEnv: config.nodeEnv,
    jwtSecret: auth.jwtSecret,
    corsOrigins: config.corsOrigins,
  });

  // Railway terminates TLS at a proxy: without this every request appears to come from
  // the proxy and each IP-keyed rate limit collapses into one global bucket.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  /*
   * Everything is versioned under /api/v1; /health stays at the root so Railway's
   * healthcheck and uptime probes do not have to track the API version.
   *
   * The SEO pages are excluded for a different reason: they are pages, not API
   * resources. A crawler indexes the URL it was given and keeps it for years, so a
   * version number in the path would be a promise to break every link one day. See
   * src/seo/seo.controller.ts.
   */
  app.setGlobalPrefix('api/v1', {
    exclude: [
      'health',
      'robots.txt',
      'sitemap.xml',
      'sitemap-cities.xml',
      'sitemap-listings-:index.xml',
      'nadlan',
      'nadlan/credits',
      'nadlan/property/:slug',
      'nadlan/:section/:city',
    ],
  });

  app.enableShutdownHooks();
  installShutdownHooks(app);

  await listenWithRetry(app, config.port);
  Logger.log(`Listening on http://0.0.0.0:${config.port} (${config.nodeEnv})`, 'Bootstrap');
}

await bootstrap();
