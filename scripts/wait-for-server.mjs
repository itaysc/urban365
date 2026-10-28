/**
 * Blocks until the API answers /health, so `npm run dev` does not start Vite while Nest
 * is still compiling. Without this the browser's first request races the server's boot
 * and Vite logs `http proxy error: ... ECONNREFUSED`.
 *
 * No dependencies on purpose — it runs before anything is installed in CI too.
 */
const port = process.env.PORT ?? process.env.VITE_SERVER_PORT ?? '5555';
const url = `http://127.0.0.1:${port}/health`;
const timeoutMs = Number(process.env.WAIT_TIMEOUT_MS ?? 90_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const startedAt = Date.now();
let announced = false;

while (Date.now() - startedAt < timeoutMs) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      if (announced) console.log(`API is up after ${Math.round((Date.now() - startedAt) / 1000)}s`);
      process.exit(0);
    }
  } catch {
    if (!announced) {
      console.log(`Waiting for the API on port ${port}…`);
      announced = true;
    }
  }
  await sleep(300);
}

console.error(`The API did not answer ${url} within ${timeoutMs / 1000}s — starting the client anyway.`);
process.exit(0);
