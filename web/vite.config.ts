/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// One source tree, three entry points (ADR-MASTER section 1): the coach website, its rinkside
// page at /rinkside/ (ADR-023, 2026-11-16; I14), and the family website. Locally they share one server at /coach/,
// /rinkside/ and /family/; `npm run build` then assembles each website at its own host's root (scripts/sites.mjs).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/coach': 'http://localhost:8080',
      '/api/client': 'http://localhost:8081',
    },
  },
  build: {
    // scripts/sites.mjs reads it to give each website only the files its pages use (17c).
    manifest: true,
    rollupOptions: {
      input: {
        coach: resolve(__dirname, 'coach/index.html'),
        rinkside: resolve(__dirname, 'rinkside/index.html'),
        family: resolve(__dirname, 'family/index.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
