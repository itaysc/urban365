import { HttpException } from '@nestjs/common';
import { esc } from '../seo/html.js';

/** How many times the page reloads itself before it asks the person to do it. */
export const WAKE_PAGE_LIMIT = 4;

/**
 * The page a browser gets instead of `{"statusCode":500,"message":"Internal server error"}`.
 *
 * That JSON is what Nest sends for an error that is not one of its own. On the front
 * door it is the entire document, because the public site proxies the HTML through.
 * A person who refreshes then sees the site. This page is that refresh, a few times,
 * and then it stops so a database that is actually down does not reload forever.
 *
 * The count rides on `wake` in the address. A cookie would do it more quietly, and
 * would also vanish at the proxy that sits in front of this process.
 */
export function wakePage(input: {
  method: string | undefined;
  accept: string | undefined;
  error: unknown;
  headersSent: boolean;
  originalUrl: string | undefined;
}): { html: string; shown: number } | null {
  const method = (input.method ?? '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return null;
  if (input.headersSent) return null;
  if (input.error instanceof HttpException) return null;
  if (!input.accept?.toLowerCase().includes('text/html')) return null;

  const shown = wakeShown(input.originalUrl) + 1;
  const refresh = shown <= WAKE_PAGE_LIMIT;
  const next = esc(withWake(input.originalUrl, shown));
  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
${refresh ? `<meta http-equiv="refresh" content="2;url=${next}">\n` : ''}<title>Urban365</title>
</head>
<body>
<p>${refresh ? 'האתר מתעורר, עוד רגע…' : 'האתר לא עלה. רעננו את העמוד בעוד רגע.'}</p>
</body>
</html>
`;

  return { html, shown };
}

/** The reload count already in the address, or 0 when it is absent or junk. */
export function wakeShown(originalUrl: string | undefined): number {
  const raw = readWake(originalUrl);
  const parsed = raw === null ? Number.NaN : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return 0;
  return Math.min(parsed, WAKE_PAGE_LIMIT + 1);
}

function readWake(originalUrl: string | undefined): string | null {
  try {
    return new URL(originalUrl || '/', 'http://localhost').searchParams.get('wake');
  } catch {
    return null;
  }
}

function stripControls(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code >= 0x20 && code !== 0x7f) out += char;
  }
  return out;
}

/** Same path, with the reload count written into the query. */
function withWake(originalUrl: string | undefined, shown: number): string {
  try {
    const url = new URL(originalUrl || '/', 'http://localhost');
    url.searchParams.set('wake', String(shown));
    return stripControls(`${url.pathname}${url.search}`);
  } catch {
    return `/?wake=${shown}`;
  }
}
