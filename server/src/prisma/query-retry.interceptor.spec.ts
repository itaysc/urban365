import { HttpException } from '@nestjs/common';
import { lastValueFrom, of, throwError, type Observable } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { QueryRetryInterceptor } from './query-retry.interceptor.js';

function context(method: string): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ method }),
      getResponse: () => ({ headersSent: false }),
    }),
  } as ExecutionContext;
}

describe('QueryRetryInterceptor', () => {
  it('runs the read again after the connection drops', async () => {
    let calls = 0;
    const handler: CallHandler = {
      handle(): Observable<string> {
        calls += 1;
        if (calls === 1) return throwError(() => Object.assign(new Error('closed'), { code: 'P1017' }));
        return of('page');
      },
    };

    const result = await lastValueFrom(new QueryRetryInterceptor().intercept(context('GET'), handler));

    expect(result).toBe('page');
    expect(calls).toBe(2);
  });

  it('does not run a write twice', async () => {
    let calls = 0;
    const handler: CallHandler = {
      handle(): Observable<never> {
        calls += 1;
        return throwError(() => Object.assign(new Error('closed'), { code: 'P1017' }));
      },
    };

    await expect(
      lastValueFrom(new QueryRetryInterceptor().intercept(context('POST'), handler)),
    ).rejects.toMatchObject({ code: 'P1017' });
    expect(calls).toBe(1);
  });

  it('surfaces an error that is the handler answer', async () => {
    let calls = 0;
    const handler: CallHandler = {
      handle(): Observable<never> {
        calls += 1;
        return throwError(() => new HttpException('העיר חסרה', 400));
      },
    };

    await expect(lastValueFrom(new QueryRetryInterceptor().intercept(context('GET'), handler))).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(calls).toBe(1);
  });
});
