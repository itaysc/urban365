import { defineConfig } from 'vite';
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
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
