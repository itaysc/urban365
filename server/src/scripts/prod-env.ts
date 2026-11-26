import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** What the scripts that write into production from this machine have in common. */

export const CDP_URL = 'http://127.0.0.1:9222';
export const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function loadProdEnv(): void {
  const envPath = path.join(serverRoot, '.prod.env');
  let text: string;
  try {
    text = readFileSync(envPath, 'utf8');
  } catch {
    console.error(`Missing ${envPath}. Copy the Railway Postgres URLs into it first.`);
    process.exit(1);
  }

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }

  // The Chrome is on this machine. A URL from the file would point the scrape elsewhere.
  process.env.YAD2_CDP_URL = CDP_URL;
}

export function isLocalDb(url: string | undefined): boolean {
  return !url || /localhost|127\.0\.0\.1|REPLACE_ME/.test(url);
}

export function dbHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(unparsed database url)';
  }
}

export async function assertChrome(): Promise<void> {
  try {
    const res = await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    console.error(
      `Chrome is not listening on ${CDP_URL}.\n` +
        'From the repo root run: npm run chrome:debug\n' +
        'Open yad2 in that window and pass the check, then run this again.',
    );
    process.exit(1);
  }
}
