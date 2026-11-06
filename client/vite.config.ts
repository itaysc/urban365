// From vitest/config rather than vite, so the `test` block below is typed.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Must match the server's PORT (server/.env), which itself defaults to 5555.
const SERVER_PORT = process.env.VITE_SERVER_PORT ?? '5555';
const serverTarget = `http://127.0.0.1:${SERVER_PORT}`;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Picks up the "@/*" -> "./src/*" mapping from tsconfig.app.json.
    tsconfigPaths: true,
    // A second copy of React breaks every hook ("Invalid hook call"), which is easy to
    // hit in dev when the optimizer re-runs mid-session. Pin both to one instance.
    dedupe: ['react', 'react-dom'],
    alias: {
      react: path.resolve(import.meta.dirname, 'node_modules/react'),
      'react-dom': path.resolve(import.meta.dirname, 'node_modules/react-dom'),
    },
  },
  optimizeDeps: {
    // Pre-bundle these up front so the optimizer does not discover them mid-session
    // and force a reload with a half-stale module graph.
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react-router', 'react-router-dom', 'axios'],
  },
  server: {
    port: Number(process.env.VITE_APP_PORT) || 5173,
    host: '0.0.0.0',
    // Leave VITE_API_URL empty in dev and let this proxy reach the NestJS server,
    // so the browser sees same-origin requests and no CORS preflight is needed.
    proxy: {
      '/api': { target: serverTarget, changeOrigin: true },
      '/health': { target: serverTarget, changeOrigin: true },
      /*
       * The server-rendered pages. They are not routes in the client's table, so if
       * Vite answers them the router shows its own 404 — which is what a city link
       * did while these sat below the `/` rule. Matching is first-prefix-wins, and
       * `/` is a prefix of every path, so these have to come first.
       *
       * The same paths the static host proxies in production; see public/_redirects
       * and PRODUCTION.md.
       */
      '/nadlan': { target: serverTarget, changeOrigin: true },
      '/sitemap': { target: serverTarget, changeOrigin: true },
      '/robots.txt': { target: serverTarget, changeOrigin: true },
      /*
       * The front door, and only the front door. `bypass` returns a path to keep
       * serving locally, and nothing to let the request through — so `/` is the HTML
       * page and `/src` stays the app.
       */
      '/': {
        target: serverTarget,
        changeOrigin: true,
        bypass(req) {
          const path = (req.url ?? '').split('?')[0];
          return path === '/' ? undefined : req.url;
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    // Node, not jsdom: what is worth testing here is logic — the Hebrew a heading is
    // built from, what a stored value is allowed to be — and none of it touches a DOM.
    // A test that does will need an environment, and `happy-dom` installs without the
    // native `canvas` peer that jsdom drags in.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
