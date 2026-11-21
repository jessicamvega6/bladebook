// Assembles the two websites from the one Vite build (ruling I14, 2026-11-17; Batch 17c), each at its host's root:
//   dist-sites/coach/   the coach website at /, and rinkside at /rinkside/   (app.bladebook.org)
//   dist-sites/family/  the family website at /                              (family.bladebook.org)
// Local development keeps /coach/, /rinkside/ and /family/ on one server (vite.config.ts); only the built sites move.
// Each site gets only the files its pages use, found through Vite's manifest, plus public/<folder>/ for its pages.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(web, 'dist');
const out = join(web, 'dist-sites');

/** Each site: its pages, as (Vite entry, built folder, where it goes in the site). */
export const SITES = {
  coach: [
    { entry: 'coach/index.html', from: 'coach', to: '' },
    { entry: 'rinkside/index.html', from: 'rinkside', to: 'rinkside' },
  ],
  family: [{ entry: 'family/index.html', from: 'family', to: '' }],
};

const manifest = JSON.parse(readFileSync(join(dist, '.vite', 'manifest.json'), 'utf8'));

/** Every built file an entry needs: its script, the chunks it imports (static and dynamic), their styles and assets. */
function filesOf(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  seen.add(key);
  const chunk = manifest[key];
  if (!chunk) throw new Error(`${key} isn't in Vite's manifest`);
  for (const next of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) filesOf(next, seen);
  return seen;
}

rmSync(out, { recursive: true, force: true });
for (const [site, pages] of Object.entries(SITES)) {
  const root = join(out, site);
  const files = new Set();
  for (const page of pages) {
    const html = readFileSync(join(dist, page.from, 'index.html'), 'utf8');
    mkdirSync(join(root, page.to), { recursive: true });
    writeFileSync(join(root, page.to, 'index.html'), html);
    // public/<folder>/ (rinkside's service worker) is copied by Vite beside the page.
    for (const name of ['sw.js']) {
      const extra = join(dist, page.from, name);
      if (existsSync(extra)) cpSync(extra, join(root, page.to, name));
    }
    for (const key of filesOf(page.entry)) {
      const c = manifest[key];
      [c.file, ...(c.css ?? []), ...(c.assets ?? [])].forEach((f) => files.add(f));
    }
  }
  for (const f of files) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    cpSync(join(dist, f), join(root, f));
  }
  // Every page and file it names must be in the site: a missing one would be a blank page on the real host.
  for (const page of pages) {
    const html = readFileSync(join(root, page.to, 'index.html'), 'utf8');
    for (const [, ref] of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
      if (!existsSync(join(root, ref))) throw new Error(`${site}: ${page.entry} names ${ref}, which isn't in the site`);
    }
  }
  // The local paths must not survive into a built site, where the coach website is at / (src/shared/sites.ts).
  for (const f of [...files].filter((x) => x.endsWith('.js'))) {
    if (/["'`]\/(coach|family)\//.test(readFileSync(join(root, f), 'utf8'))) {
      throw new Error(`${site}: ${f} still links to a local /coach/ or /family/ path`);
    }
  }
  console.log(`${site}: ${pages.length} page(s), ${files.size} file(s) → dist-sites/${site}/`);
}
