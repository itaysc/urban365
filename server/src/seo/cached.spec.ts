import { describe, expect, it, vi } from 'vitest';
import { Cached } from './cached.js';

describe('Cached', () => {
  it('computes once and then answers from memory', async () => {
    const load = vi.fn().mockResolvedValue('x');
    const cached = new Cached(60_000, load);

    expect(await cached.get()).toBe('x');
    expect(await cached.get()).toBe('x');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('recomputes once the value is old', async () => {
    vi.useFakeTimers();
    try {
      const load = vi.fn().mockResolvedValue('x');
      const cached = new Cached(1_000, load);

      await cached.get();
      vi.advanceTimersByTime(1_001);
      await cached.get();

      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('collapses a burst of requests onto one rebuild', async () => {
    // A crawler opens twenty city pages at once; the database should see one query.
    let release: (value: string) => void = () => undefined;
    const load = vi.fn().mockImplementation(() => new Promise<string>((r) => (release = r)));
    const cached = new Cached(60_000, load);

    const all = Promise.all([cached.get(), cached.get(), cached.get()]);
    release('x');

    expect(await all).toEqual(['x', 'x', 'x']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('tries again after a failure rather than caching the error', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue('x');
    const cached = new Cached(60_000, load);

    await expect(cached.get()).rejects.toThrow('down');
    expect(await cached.get()).toBe('x');
  });

  it('forgets what it holds when told to', async () => {
    const load = vi.fn().mockResolvedValue('x');
    const cached = new Cached(60_000, load);

    await cached.get();
    cached.clear();
    await cached.get();

    expect(load).toHaveBeenCalledTimes(2);
  });
});
