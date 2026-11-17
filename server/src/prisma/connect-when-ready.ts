/**
 * How long boot will wait for Postgres after a serverless wake.
 *
 * The process must not accept TCP before a query succeeds. Railway forwards the
 * request that woke the service as soon as the port opens, and a query against a
 * database that is still starting is the generic 500 the first visitor sees.
 */
export const POSTGRES_WAKE_BUDGET_MS = 45_000;

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return 'unavailable';
}

/**
 * Calls `probe` until it resolves or the budget runs out. The probe's own error is
 * rethrown, so a database that is actually down still fails boot — just not on the
 * first moment it has not opened its port yet.
 */
export async function connectWhenReady(
  probe: () => Promise<unknown>,
  options: {
    budgetMs: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    warn?: (message: string) => void;
  },
): Promise<void> {
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const started = now();

  for (let attempt = 1; ; attempt += 1) {
    try {
      await probe();
      return;
    } catch (error) {
      const remaining = options.budgetMs - (now() - started);
      if (remaining <= 0) throw error;
      options.warn?.(`Postgres is not taking queries yet (${errorCode(error)}, attempt ${attempt}).`);
      await sleep(Math.min(1_000, remaining));
    }
  }
}
