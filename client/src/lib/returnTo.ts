/**
 * Validates a post-login redirect. Anything that is not a plain in-app path is thrown
 * away — `//evil.com` is a protocol-relative URL the browser treats as another origin,
 * which is the classic open-redirect.
 */
export function safeReturnTo(value: unknown, fallback = '/app'): string {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  if (value.startsWith('/login') || value.startsWith('/signup')) return fallback;
  return value;
}
