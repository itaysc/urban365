import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { decideQueryRetry, transientDbLabel } from './query-retry.js';

/**
 * Re-runs a read whose query found Postgres asleep or the pooled connection dead.
 *
 * The client's own retry never sees this failure. The public site proxies the front
 * door straight to this process and shows the bytes, so the generic 500 is the whole
 * page. Waiting here is the refresh the visitor would otherwise have to do themselves.
 *
 * Each try calls the rest of the chain again. Resubscribing to one observable would
 * not: the tenant scope starts its work as a promise the moment it is asked, and a
 * promise does not run twice.
 */
@Injectable()
export class QueryRetryInterceptor implements NestInterceptor {
  private readonly logger = new Logger(QueryRetryInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const startedAt = Date.now();
    const attempt = { n: 0 };

    const run = (): Observable<unknown> =>
      next.handle().pipe(
        catchError((error: unknown) => {
          attempt.n += 1;
          const http = context.switchToHttp();
          const req = http.getRequest<Request>();
          const res = http.getResponse<Response>();
          const decision = decideQueryRetry({
            method: req.method,
            error,
            startedAt,
            now: Date.now(),
            attempt: attempt.n,
            headersSent: res.headersSent,
          });

          if (decision.action === 'surface') return throwError(() => error);

          this.logger.warn(
            `Postgres is not taking queries yet (${transientDbLabel(error)}, attempt ${attempt.n}).`,
          );
          return timer(decision.delayMs).pipe(mergeMap(() => run()));
        }),
      );

    return run();
  }
}
