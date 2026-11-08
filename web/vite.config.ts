/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// One source tree, three entry points (ADR-MASTER section 1): the coach website, its rinkside
// page at /coach/rinkside, and the family website. Where the family website is served is
// still open (ADR-023 Open); /family/ is the local path.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/coach': 'http://localhost:8080',
      '/api/client': 'http://localhost:8081',
    },
  },
  build: {
    rollupOptions: {
      input: {
        coach: resolve(__dirname, 'coach/index.html'),
        rinkside: resolve(__dirname, 'coach/rinkside/index.html'),
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
