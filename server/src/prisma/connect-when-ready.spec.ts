import { connectWhenReady } from './connect-when-ready.js';

describe('connectWhenReady', () => {
  it('keeps probing until a query succeeds', async () => {
    let calls = 0;
    const slept: number[] = [];

    await connectWhenReady(
      async () => {
        calls += 1;
        if (calls < 3) throw Object.assign(new Error('starting up'), { code: '57P03' });
      },
      {
        budgetMs: 10_000,
        now: () => 0,
        sleep: async (ms) => {
          slept.push(ms);
        },
        warn: () => undefined,
      },
    );

    expect(calls).toBe(3);
    expect(slept).toEqual([1_000, 1_000]);
  });

  it('gives up once the budget is spent and raises the database error', async () => {
    let t = 0;

    await expect(
      connectWhenReady(
        async () => {
          throw Object.assign(new Error('down'), { code: 'ECONNREFUSED' });
        },
        {
          budgetMs: 1_500,
          now: () => t,
          sleep: async (ms) => {
            t += ms;
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'ECONNREFUSED' });

    expect(t).toBe(1_500);
  });

  it('does not wait at all when the budget is already spent', async () => {
    let slept = false;

    await expect(
      connectWhenReady(
        async () => {
          throw new Error('down');
        },
        {
          budgetMs: 0,
          sleep: async () => {
            slept = true;
          },
        },
      ),
    ).rejects.toThrow('down');

    expect(slept).toBe(false);
  });
});
