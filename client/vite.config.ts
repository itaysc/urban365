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
       * The server-rendered pages, which are real paths on this origin and not routes
       * in the client's table — so without these the router answers its own 404 and the
       * header's "מחירים לפי עיר" leads nowhere.
       *
       * The same three paths the static host has to proxy in production; see the rules
       * in public/_redirects and PRODUCTION.md. Keeping dev and production pointed at
       * the same set is the point: a link that works here and 404s there is the kind of
       * difference nobody finds until it is live.
       */
      '/nadlan': { target: serverTarget, changeOrigin: true },
      '/sitemap': { target: serverTarget, changeOrigin: true },
      '/robots.txt': { target: serverTarget, changeOrigin: true },
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
