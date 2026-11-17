/**
 * Railway serverless stops the API after a few idle minutes. The request that wakes
 * it is answered before Postgres is taking queries: Nest's generic 500, or the proxy's
 * 502/503. A read can wait that out. A write cannot — replaying one is a second action.
 */

/** How long a read keeps asking before it shows the failure. */
export const WAKE_BUDGET_MS = 30_000;

const SAFE_METHODS = new Set(['get', 'head', 'options']);

export type WakeDecision =
  | { action: 'retry'; delayMs: number }
  | { action: 'give-up' }
  | { action: 'surface' };

export function responseMessage(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || !('message' in data)) return undefined;
  return (data as { message: unknown }).message;
}

function isSafeToReplay(method: string | undefined): boolean {
  return SAFE_METHODS.has((method ?? 'get').toLowerCase());
}

function isAsleep(status: number | undefined, message: unknown): boolean {
  if (status === undefined) return true;
  if (status === 502 || status === 503 || status === 504) return true;
  return status === 500 && (message === undefined || message === 'Internal server error');
}

function delayFor(attempt: number): number {
  return Math.min(5_000, 800 * 2 ** (attempt - 1));
}

/**
 * `attempt` counts failures so far, starting at 1. `startedAt` is when the first of
 * them happened, so the budget covers the whole wake and not each try on its own.
 */
export function decideWake(input: {
  method: string | undefined;
  status: number | undefined;
  message: unknown;
  code: string | undefined;
  startedAt: number;
  now: number;
  attempt: number;
}): WakeDecision {
  if (input.code === 'ERR_CANCELED') return { action: 'surface' };
  if (!isSafeToReplay(input.method)) return { action: 'surface' };
  if (!isAsleep(input.status, input.message)) return { action: 'surface' };

  const remaining = WAKE_BUDGET_MS - (input.now - input.startedAt);
  if (remaining <= 0) return { action: 'give-up' };
  return { action: 'retry', delayMs: Math.min(delayFor(input.attempt), remaining) };
}

export function markWakeGaveUp(error: object): void {
  (error as { wakeGaveUp?: boolean }).wakeGaveUp = true;
}

export function wakeGaveUp(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { wakeGaveUp?: boolean }).wakeGaveUp === true;
}
