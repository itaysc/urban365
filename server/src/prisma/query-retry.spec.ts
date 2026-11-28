import { HttpException } from '@nestjs/common';
import { decideQueryRetry, isTransientDbError, QUERY_RETRY_BUDGET_MS } from './query-retry.js';

const closed = Object.assign(new Error('Server has closed the connection.'), { code: 'P1017' });

describe('isTransientDbError', () => {
  it('recognises a connection Prisma closed, including one wrapped as the cause', () => {
    expect(isTransientDbError(closed)).toBe(true);
    expect(isTransientDbError(new Error('query failed', { cause: closed }))).toBe(true);
    expect(isTransientDbError({ kind: 'ConnectionClosed' })).toBe(true);
    expect(isTransientDbError(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))).toBe(true);
    expect(isTransientDbError(new Error('Connection terminated unexpectedly'))).toBe(true);
    expect(isTransientDbError(new Error('the database system is starting up'))).toBe(true);
  });

  it('leaves a real query failure alone', () => {
    expect(isTransientDbError(Object.assign(new Error('Unique constraint'), { code: 'P2002' }))).toBe(false);
    expect(isTransientDbError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isTransientDbError('nope')).toBe(false);
  });
});

describe('decideQueryRetry', () => {
  const input = {
    method: 'GET',
    error: closed,
    startedAt: 0,
    now: 0,
    attempt: 1,
    headersSent: false,
  };

  it('waits out the connection the first visitor finds dead', () => {
    expect(decideQueryRetry(input)).toEqual({ action: 'retry', delayMs: 250 });
    expect(decideQueryRetry({ ...input, attempt: 5 })).toEqual({ action: 'retry', delayMs: 4_000 });
  });

  it('stops when the budget is spent and shortens the last wait to fit', () => {
    expect(decideQueryRetry({ ...input, now: QUERY_RETRY_BUDGET_MS })).toEqual({ action: 'surface' });
    expect(decideQueryRetry({ ...input, now: QUERY_RETRY_BUDGET_MS - 100, attempt: 5 })).toEqual({
      action: 'retry',
      delayMs: 100,
    });
  });

  it('does not replay a write, a handler answer, or a response already started', () => {
    expect(decideQueryRetry({ ...input, method: 'POST' })).toEqual({ action: 'surface' });
    expect(decideQueryRetry({ ...input, error: new HttpException('העיר חסרה', 400) })).toEqual({
      action: 'surface',
    });
    expect(decideQueryRetry({ ...input, headersSent: true })).toEqual({ action: 'surface' });
    expect(decideQueryRetry({ ...input, error: new Error('Cannot read properties of undefined') })).toEqual({
      action: 'surface',
    });
  });
});
