// Boots the API with server/.prod.env applied over the environment, so the values in
// that file win against server/.env. Nest loads .env itself and does not override
// variables that are already set.
//
// Refuses a localhost database: the only reason to use this script is to write to
// production, and starting it against the laptop's Postgres would look like success.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(serverRoot, '.prod.env');

let text;
try {
  text = readFileSync(envPath, 'utf8');
} catch {
  console.error(`Missing ${envPath}. Copy the two Railway Postgres URLs into it first.`);
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

const local = (url) => !url || /localhost|127\.0\.0\.1|REPLACE_ME/.test(url);

if (local(process.env.DATABASE_URL) || local(process.env.APP_DATABASE_URL)) {
  console.error(
    'server/.prod.env still has a local or placeholder database URL.\n' +
      'Paste the Railway DATABASE_URL and APP_DATABASE_URL, then run this again.',
  );
  process.exit(1);
}

console.log('Using server/.prod.env — this process writes to the production database.');

const child = spawn(
  process.execPath,
  [path.join(serverRoot, 'node_modules/@nestjs/cli/bin/nest.js'), 'start', '--watch'],
  { cwd: serverRoot, stdio: 'inherit', env: process.env },
);

const stop = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
