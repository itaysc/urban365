import { ArgumentsHost, Catch, type ExceptionFilter, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import type { Request, Response } from 'express';
import { isTransientDbError, transientDbLabel } from '../prisma/query-retry.js';
import { wakePage } from './wake-page.js';

/**
 * Turns the generic 500 into a page that reloads, for a browser that asked for HTML.
 *
 * Only in production. Locally the JSON is the useful answer, and it is how a failing
 * test reports itself. The public site is where that JSON is the thing a visitor reads.
 */
@Injectable()
@Catch()
export class WakePageFilter implements ExceptionFilter {
  private readonly logger = new Logger(WakePageFilter.name);
  private readonly nodeEnv: string;

  constructor(
    config: ConfigService,
    private readonly adapterHost: HttpAdapterHost,
  ) {
    this.nodeEnv = config.get<string>('app.nodeEnv') ?? 'development';
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() === 'http' && this.nodeEnv === 'production') {
      const http = host.switchToHttp();
      const req = http.getRequest<Request>();
      const res = http.getResponse<Response>();
      const page = wakePage({
        method: req.method,
        accept: req.header('accept'),
        error: exception,
        headersSent: res.headersSent,
        originalUrl: req.originalUrl,
      });

      if (page) {
        if (isTransientDbError(exception)) {
          this.logger.warn(`Serving a wake page (${transientDbLabel(exception)}, shown ${page.shown}).`);
        } else {
          this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
        }
        res
          .status(503)
          .set('Cache-Control', 'private, no-store')
          .set('CDN-Cache-Control', 'no-store')
          .set('Retry-After', '2')
          .type('html')
          .send(page.html);
        return;
      }
    }

    // Built here, not in the constructor: the adapter is not ready when the filter is created.
    new BaseExceptionFilter(this.adapterHost.httpAdapter).catch(exception, host);
  }
}
