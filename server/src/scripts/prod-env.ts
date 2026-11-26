import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
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

async function chromeListening(): Promise<boolean> {
  try {
    const res = await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function chromePath(): string | null {
  if (process.env.CHROME) return process.env.CHROME;
  const candidates =
    process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts the same Chrome as npm run chrome:debug when none is listening. It has to be a
 * visible window: yad2's bot check serves a captcha to headless Chrome.
 */
export async function ensureChrome(): Promise<void> {
  if (await chromeListening()) return;

  const chrome = chromePath();
  if (!chrome) {
    console.error('Could not find Chrome. Set CHROME=/path/to/chrome and run this again.');
    process.exit(1);
  }
  const port = new URL(CDP_URL).port;
  const profile = process.env.CDP_PROFILE ?? path.join(homedir(), '.cache', 'nadlan-chrome');
  console.log(`Chrome is not running. Starting it on port ${port}…`);
  spawn(chrome, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'https://www.yad2.co.il'], {
    detached: true,
    stdio: 'ignore',
  }).unref();

  for (let waited = 0; !(await chromeListening()); waited += 500) {
    if (waited >= 20_000) {
      console.error(`Chrome did not open port ${port}. Run npm run chrome:debug from the repo root and try again.`);
      process.exit(1);
    }
    await sleep(500);
  }
  console.log('Chrome is up. Letting yad2 load; if it shows a bot check, solve it in that window.');
  await sleep(8000);
}
