import { describe, expect, it } from 'vitest';
import { decideWake, WAKE_BUDGET_MS } from './wake';

const waking = {
  method: 'get',
  status: 500 as number | undefined,
  message: 'Internal server error' as unknown,
  code: undefined as string | undefined,
  startedAt: 0,
  now: 0,
  attempt: 1,
};

describe('decideWake', () => {
  it('waits out the generic 500 a sleeping service answers with', () => {
    expect(decideWake(waking)).toEqual({ action: 'retry', delayMs: 800 });
  });

  it('waits out a proxy that has not reached the process yet', () => {
    expect(decideWake({ ...waking, status: 502, message: undefined })).toEqual({
      action: 'retry',
      delayMs: 800,
    });
    expect(decideWake({ ...waking, status: undefined, message: undefined })).toEqual({
      action: 'retry',
      delayMs: 800,
    });
  });

  it('grows the pause and stops when the budget is spent', () => {
    expect(decideWake({ ...waking, attempt: 4 })).toEqual({ action: 'retry', delayMs: 5_000 });
    expect(decideWake({ ...waking, now: WAKE_BUDGET_MS })).toEqual({ action: 'give-up' });
    expect(decideWake({ ...waking, now: WAKE_BUDGET_MS - 200, attempt: 4 })).toEqual({
      action: 'retry',
      delayMs: 200,
    });
  });

  it('does not replay a write or a failure that names its cause', () => {
    expect(decideWake({ ...waking, method: 'post' })).toEqual({ action: 'surface' });
    expect(decideWake({ ...waking, status: 400, message: 'העיר חסרה' })).toEqual({
      action: 'surface',
    });
    expect(decideWake({ ...waking, message: 'relation "Listing" does not exist' })).toEqual({
      action: 'surface',
    });
  });

  it('leaves a cancelled read alone', () => {
    expect(decideWake({ ...waking, status: undefined, code: 'ERR_CANCELED' })).toEqual({
      action: 'surface',
    });
  });
});
