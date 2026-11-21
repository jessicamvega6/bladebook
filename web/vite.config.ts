/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Locally, each website signs in against dev's real user pool (ruling I31). This serves /coach/config.json and
 * /family/config.json, the files the stack uploads on AWS, from what infra's `dev-pool` script wrote. Dev server only.
 */
function devSignInConfig(): Plugin {
  return {
    name: 'bladebook-dev-sign-in-config',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const site = /^\/(coach|family)\/config\.json$/.exec((req.url ?? '').split('?')[0]!)?.[1];
        if (!site) return next();
        try {
          const pool = JSON.parse(readFileSync(join(homedir(), '.bladebook', 'dev-pool.json'), 'utf8')) as Record<string, string>;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({
            region: pool.region,
            userPoolId: pool.userPoolId,
            appClientId: site === 'coach' ? pool.coachClientId : pool.familyClientId,
          }));
        } catch {
          res.statusCode = 503;
          res.end('Run `npm --prefix infra run dev-pool` (signed in to dev), then restart `npm run dev`.');
        }
      });
    },
  };
}

// One source tree, three entry points (ADR-MASTER section 1): the coach website, its rinkside
// page at /rinkside/ (ADR-023, 2026-11-16; I14), and the family website. Locally they share one server at /coach/,
// /rinkside/ and /family/; `npm run build` then assembles each website at its own host's root (scripts/sites.mjs).
export default defineConfig({
  plugins: [react(), devSignInConfig()],
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
