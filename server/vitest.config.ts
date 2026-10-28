import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Loads .env, so the DB-backed specs — above all the RLS coverage test — actually
    // run locally instead of skipping themselves into a false pass. CI without a
    // DATABASE_URL still skips them, which is the intended behaviour there.
    env: { ...loadEnv() },
  },
});

/** Minimal .env reader; dotenv is a server dependency, not a test-time one. */
function loadEnv(): Record<string, string> {
  const { readFileSync, existsSync } = require('node:fs') as typeof import('node:fs');
  if (!existsSync('.env')) return {};

  const env: Record<string, string> = {};
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}
