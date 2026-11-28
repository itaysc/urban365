import { HttpException } from '@nestjs/common';

/**
 * How long one read will keep asking after Postgres drops the connection.
 *
 * The process can already be listening: the boot probe ran, then the replica slept and
 * the pooled connection died with it. The query that finds out is the generic 500 the
 * first visitor sees, and the next one works. This budget is that next try, inside the
 * same request, so the visitor never has to be the one who refreshes.
 */
export const QUERY_RETRY_BUDGET_MS = 12_000;

const TRANSIENT_PRISMA = new Set([
  'P1001', // Can't reach database server
  'P1002', // Server reached but timed out
  'P1008', // Operation timed out
  'P1017', // Server has closed the connection
  'P2024', // Timed out fetching a connection from the pool
  'P2034', // Write conflict or deadlock
  'P2037', // Too many connections
]);

/** SQLSTATE and node codes that mean "try again", not "this query is wrong". */
const TRANSIENT_CODES = new Set([
  ...TRANSIENT_PRISMA,
  '57P01', // terminating connection due to administrator command
  '57P02', // crash shutdown
  '57P03', // the database system is starting up
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08P01',
  '53300', // too many connections
  '40001', // serialization failure
  '40P01', // deadlock
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EPIPE',
  'EAI_AGAIN',
]);

const TRANSIENT_KINDS = new Set([
  'DatabaseNotReachable',
  'ConnectionClosed',
  'SocketTimeout',
  'TooManyConnections',
]);

const TRANSIENT_TEXT = [
  'connection terminated',
  'server has closed the connection',
  "can't reach database",
  'database system is starting up',
  'database system is shutting down',
  'not yet accepting connections',
  'timeout exceeded when trying to connect',
  'too many clients',
  'too many database connections',
  'remaining connection slots',
  'connection reset',
  'client has encountered a connection error',
];

export type QueryRetry =
  | { action: 'retry'; delayMs: number }
  | { action: 'surface' };

function delayFor(attempt: number): number {
  return Math.min(4_000, 250 * 2 ** (attempt - 1));
}

function isSafeToReplay(method: string | undefined): boolean {
  const name = (method ?? '').toUpperCase();
  return name === 'GET' || name === 'HEAD';
}

/**
 * A connection failure anywhere in the cause chain.
 *
 * Prisma wraps the driver error, the driver wraps Postgres, and a slept replica often
 * arrives as a bare "Connection terminated unexpectedly" with no code at all. Each of
 * those is the same fact: this query did not run, and another attempt might.
 */
export function isTransientDbError(error: unknown): boolean {
  const seen = new Set<unknown>();

  const visit = (current: unknown): boolean => {
    if (typeof current !== 'object' || current === null || seen.has(current)) return false;
    seen.add(current);

    const record = current as {
      code?: unknown;
      kind?: unknown;
      message?: unknown;
      cause?: unknown;
      errors?: unknown;
    };

    if (typeof record.code === 'string' && TRANSIENT_CODES.has(record.code)) return true;
    if (typeof record.kind === 'string' && TRANSIENT_KINDS.has(record.kind)) return true;
    if (typeof record.message === 'string') {
      const message = record.message.toLowerCase();
      if (TRANSIENT_TEXT.some((part) => message.includes(part))) return true;
    }
    if (visit(record.cause)) return true;
    if (Array.isArray(record.errors) && record.errors.some((item) => visit(item))) return true;
    return false;
  };

  return visit(error);
}

/** A short label for the log line, so a retry says what it is waiting on. */
export function transientDbLabel(error: unknown): string {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    const record = current as { code?: unknown; kind?: unknown; message?: unknown; cause?: unknown };
    if (typeof record.code === 'string' && record.code.length > 0) return record.code;
    if (typeof record.kind === 'string' && record.kind.length > 0) return record.kind;
    if (typeof record.message === 'string' && record.message.length > 0) {
      return record.message.split('\n', 1)[0].slice(0, 160);
    }
    current = record.cause;
  }
  return 'unavailable';
}

/**
 * `attempt` counts failures so far, starting at 1. `startedAt` is when the first of
 * them happened, so the budget covers the whole wait and not each try on its own.
 *
 * Writes are not replayed: a second insert is a second action. An HttpException is
 * the handler's own answer, and answering it twice would only be slower.
 */
export function decideQueryRetry(input: {
  method: string | undefined;
  error: unknown;
  startedAt: number;
  now: number;
  attempt: number;
  headersSent: boolean;
}): QueryRetry {
  if (input.headersSent) return { action: 'surface' };
  if (!isSafeToReplay(input.method)) return { action: 'surface' };
  if (input.error instanceof HttpException) return { action: 'surface' };
  if (!isTransientDbError(input.error)) return { action: 'surface' };

  const remaining = QUERY_RETRY_BUDGET_MS - (input.now - input.startedAt);
  if (remaining <= 0) return { action: 'surface' };
  return { action: 'retry', delayMs: Math.min(delayFor(input.attempt), remaining) };
}
