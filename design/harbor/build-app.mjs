// Builds one Harbor demo app (client or rinkside) from its source folder.
//   node design/harbor/build-app.mjs <client|rinkside> [artifactDir]
// Reads <app>/app.js, <app>/screens-*.js, <app>/app.css, <app>/screens-*.css and <app>/app.config.json.
// Writes <app>/demo/index.html, <app>/static/*.html (one per PRESET) and <app>/static/index.html.
// With artifactDir, also writes the demo page and the gallery shaped for publishing as Artifacts.
// (The coach website has its own build, coach/build.mjs, because of its schedule section.)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const app = process.argv[2];
if (!app) { console.error('usage: node build-app.mjs <client|rinkside> [artifactDir]'); process.exit(1); }
const DIR = path.join(ROOT, app);
const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'app.config.json'), 'utf8'));
const read = p => fs.readFileSync(p, 'utf8');
const ls = re => fs.readdirSync(DIR).filter(f => re.test(f)).sort();
const JS = [path.join(ROOT, 'library.js'), path.join(ROOT, 'shared.js'), path.join(DIR, 'app.js'), ...ls(/^screens-.*\.js$/).map(f => path.join(DIR, f))].map(read).join('\n;\n');
const CSS = [read(path.join(ROOT, 'harbor.css')), ...['app.css', ...ls(/^screens-.*\.css$/)].filter(f => fs.existsSync(path.join(DIR, f))).map(f => read(path.join(DIR, f)))].join('\n');
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap">';
const doc = (head, body) => `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
const BG = 'html, body { margin: 0; background: #F7F3EC; }\n.demo-bar a { color: inherit; font-weight: 700; }';

/* ---------------- demo ---------------- */
const demoBody = `<div class="demo-bar"><span>${cfg.demoBar}</span>${cfg.demoBarControls || ''}<button type="button" onclick="resetDemo()">Reset demo</button></div>\n<div class="bb" data-layout="top"><div id="app"></div></div>\n<script>\n${JS}\n;boot();\n</script>`;
const demoHead = `<title>${cfg.demoTitle}</title>\n${FONTS}\n<style>\n${CSS}\n${BG}\n</style>`;
fs.mkdirSync(path.join(DIR, 'demo'), { recursive: true });
fs.writeFileSync(path.join(DIR, 'demo', 'index.html'), doc(demoHead, demoBody));

/* ---------------- static pages ---------------- */
const ctx = vm.createContext({ window: {}, console });
vm.runInContext(JS, ctx);
const presets = vm.runInContext('PRESETS', ctx);
const pages = presets.map(p => {
  vm.runInContext('state = freshState()', ctx);
  ctx.__p = p;
  const html = vm.runInContext('__p.setup(state); view()', ctx);
  return { ...p, screen: vm.runInContext('state.screen', ctx), html };
});
const order = pages.slice().sort((a, b) => cfg.groups.indexOf(a.group) - cfg.groups.indexOf(b.group));
const missing = order.filter(p => !cfg.groups.includes(p.group));
if (missing.length) throw new Error('PRESET group not in app.config.json groups: ' + [...new Set(missing.map(p => p.group))].join(', '));
const byScreen = {};
for (const p of order) if (!byScreen[p.screen]) byScreen[p.screen] = p.file;
const fixLinks = html => html.replace(/href="#([\w-]*)"/g, (_, s) => `href="${byScreen[s] || order[0].file}.html"`);
const STATIC_CSS = `
:root { --sp-bg: #E9E3D8; --sp-text: #1E292D; --sp-text-2: #46524F; --sp-line: #D2C7B5; --sp-link: #0E6C68; }
html, body { margin: 0; background: var(--sp-bg); }
.sp-bar { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px; padding: 10px 24px; font: 13px/1.4 'Figtree', system-ui, sans-serif; color: var(--sp-text-2); background: var(--sp-bg); border-bottom: 1px solid var(--sp-line); }
.sp-bar b { color: var(--sp-text); font-size: 14px; }
.sp-bar a { color: var(--sp-link); font-weight: 700; text-decoration: none; }
.sp-bar__note { flex: 1 1 320px; min-width: 0; }
.sp-bar__nav { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-left: auto; min-width: 0; }
.sp-page { background: #F7F3EC; }
@media (max-width: 760px) { .sp-bar { padding: 10px 16px; } }`;
const OUT = path.join(DIR, 'static');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.html')) fs.unlinkSync(path.join(OUT, f));
order.forEach((p, i) => {
  const prev = order[(i - 1 + order.length) % order.length], next = order[(i + 1) % order.length];
  const bar = `<header class="sp-bar"><span>${cfg.product} · Harbor · ${p.group}</span><b>${p.title}</b><span class="sp-bar__note">${p.note || ''}</span><nav class="sp-bar__nav"><a href="${prev.file}.html">← ${prev.title}</a><a href="index.html">All pages</a><a href="${next.file}.html">${next.title} →</a></nav></header>`;
  const head = `<title>${p.title.replace(/<[^>]+>/g, '')} · ${cfg.product} (Harbor)</title>\n${FONTS}\n<style>\n${CSS}\n${STATIC_CSS}\n</style>`;
  fs.writeFileSync(path.join(OUT, p.file + '.html'), doc(head, `${bar}\n<div class="sp-page"><div class="bb" data-layout="top">${fixLinks(p.html)}</div></div>`));
});

/* ---------------- gallery ---------------- */
const groups = cfg.groups.filter(g => order.some(p => p.group === g));
const galleryBody = demoHref => `<header class="g-head"><h1>${cfg.product} — Harbor</h1><p>${order.length} static page designs, generated from the same source as the <a href="${demoHref}">interactive demo</a>. ${cfg.galleryIntro}</p></header>
<main class="g-main">${groups.map(g => `<section class="g-group"><h2>${g}</h2><ol>${order.filter(p => p.group === g).map(p => `<li><a href="${p.file}.html">${p.title}</a><span>${p.note || ''}</span><code>${p.file}.html</code></li>`).join('')}</ol></section>`).join('')}</main>`;
const GALLERY_CSS = `
:root { --g-bg: #F7F3EC; --g-surface: #FFFDF9; --g-text: #1E292D; --g-text-2: #46524F; --g-line: #E7DFD2; --g-link: #0E6C68; }
html, body { margin: 0; background: var(--g-bg); color: var(--g-text); font: 15px/1.5 'Figtree', system-ui, sans-serif; }
.g-head, .g-main { max-width: 1040px; margin: 0 auto; padding-inline: 24px; }
.g-head { padding-block: 40px 8px; }
.g-head h1 { margin: 0 0 8px; font-size: 30px; font-weight: 800; letter-spacing: -0.02em; text-wrap: balance; }
.g-head p { margin: 0; max-width: 68ch; color: var(--g-text-2); }
.g-head a, .g-group a { color: var(--g-link); font-weight: 700; text-decoration: none; }
.g-main { display: flex; flex-direction: column; gap: 28px; padding-block: 24px 64px; }
.g-group h2 { margin: 0 0 10px; font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--g-text-2); }
.g-group ol { margin: 0; padding: 0; list-style: none; background: var(--g-surface); border: 1px solid var(--g-line); border-radius: 20px; overflow: hidden; }
.g-group li { display: grid; grid-template-columns: minmax(0, 260px) minmax(0, 1fr) auto; gap: 4px 20px; padding: 12px 20px; border-top: 1px solid var(--g-line); align-items: baseline; }
.g-group li:first-child { border-top: 0; }
.g-group span { color: var(--g-text-2); font-size: 14px; min-width: 0; }
.g-group code { font-size: 12px; color: var(--g-text-2); }
@media (max-width: 760px) { .g-head, .g-main { padding-inline: 16px; } .g-group li { grid-template-columns: minmax(0, 1fr); } }`;
const galleryHead = title => `<title>${title}</title>\n${FONTS}\n<style>${GALLERY_CSS}</style>`;
fs.writeFileSync(path.join(OUT, 'index.html'), doc(galleryHead(`${cfg.product} · Harbor static designs`), galleryBody('../demo/index.html')));

/* ---------------- artifact copies ---------------- */
const artifactDir = process.argv[3];
if (artifactDir) {
  const d = path.join(artifactDir, `${app}-demo`), s = path.join(artifactDir, `${app}-static`);
  fs.mkdirSync(d, { recursive: true }); fs.mkdirSync(s, { recursive: true });
  // The Artifact skeleton supplies doctype/head/body for the main page; every other file keeps its own.
  fs.writeFileSync(path.join(d, 'index.html'), `${demoHead}\n${demoBody}\n`);
  for (const f of fs.readdirSync(s)) fs.unlinkSync(path.join(s, f));
  for (const f of fs.readdirSync(OUT)) if (f !== 'index.html') fs.copyFileSync(path.join(OUT, f), path.join(s, f));
  fs.writeFileSync(path.join(s, 'index.html'), `${galleryHead(cfg.galleryTitle)}\n${galleryBody(cfg.demoUrl || '../demo/index.html')}\n`);
}
console.log(`${app}: demo + ${order.length} static pages`);
for (const g of groups) console.log(`  ${g}: ${order.filter(p => p.group === g).map(p => p.file).join(', ')}`);
