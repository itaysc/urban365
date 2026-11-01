/**
 * One value, recomputed when it gets old.
 *
 * Deliberately not a cache library and deliberately not Redis. There are two things on
 * these pages worth not recomputing per request — the list of cities we hold listings
 * in, and the nine district outlines — and both are small, cheap to rebuild and
 * harmless when stale for a few minutes. Anything that needed more than this would be
 * a sign the page was asking the database the wrong question.
 *
 * In-memory, so per-instance and lost on deploy, exactly like the rate limiter.
 */
export class Cached<T> {
  private value: T | null = null;
  private expiresAt = 0;
  /** The in-flight rebuild, so a burst of crawler requests triggers one, not twenty. */
  private loading: Promise<T> | null = null;

  constructor(
    private readonly ttlMs: number,
    private readonly load: () => Promise<T>,
  ) {}

  async get(): Promise<T> {
    if (this.value !== null && Date.now() < this.expiresAt) return this.value;
    if (this.loading) return this.loading;

    this.loading = this.load()
      .then((value) => {
        this.value = value;
        this.expiresAt = Date.now() + this.ttlMs;
        return value;
      })
      .finally(() => {
        this.loading = null;
      });

    return this.loading;
  }

  /** For a test, and for anything that knows the underlying data just changed. */
  clear(): void {
    this.value = null;
    this.expiresAt = 0;
  }
}
