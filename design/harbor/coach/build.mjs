// Builds the Harbor coach website from one source.
//   node design/harbor/coach/build.mjs [artifactDir]
// Outputs (all generated — edit app.js, screens-*.js, *.css or schedule.html instead):
//   demo/index.html      interactive demo of every coach page except the schedule section
//   demo/schedule.html   interactive schedule section (weekly schedule, time off, special schedules, review)
//   static/*.html        one static design per page, rendered from PRESETS and from schedule.html states
//   static/index.html    gallery of every static page
//   [artifactDir]/       the demo again, shaped for publishing as an Artifact (page fragment + schedule.html)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = p => fs.readFileSync(p, 'utf8');
const screenFiles = fs.readdirSync(HERE).filter(f => /^screens-.*\.js$/.test(f)).sort();
const cssFiles = ['app.css', ...fs.readdirSync(HERE).filter(f => /^screens-.*\.css$/.test(f)).sort()];
const JS = [path.join(ROOT, 'library.js'), path.join(ROOT, 'shared.js'), path.join(HERE, 'app.js'), ...screenFiles.map(f => path.join(HERE, f))].map(read).join('\n;\n');
const CSS = [read(path.join(ROOT, 'harbor.css')), ...cssFiles.map(f => read(path.join(HERE, f)))].join('\n');
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap">';
const DEMO_BAR = `<div class="demo-bar"><span><b>Interactive demo</b> · sample data · today is Wed, Oct 14, 8:15 AM · signed-out pages: <a href="#login">Log in</a> · <a href="#forgot">Forgot password</a> · <a href="#signup">Sign up</a></span><button type="button" onclick="resetDemo()">Reset demo</button></div>`;
const DEMO_CSS = '.demo-bar a { color: inherit; font-weight: 700; }';
const GROUP_ORDER = ['Sign in', 'Sign up', 'Dashboard', 'Calendar', 'Schedule', 'Students', 'Lessons', 'Payments', 'Profile', 'Phase 2'];

/* ---------------- demo ---------------- */
const demoBody = `${DEMO_BAR}\n<div class="bb" data-layout="top"><div id="app"></div></div>\n<script>\n${JS}\n;boot();\n</script>`;
const demoHead = `<title>Dana Whitfield · BladeBook coach demo</title>\n${FONTS}\n<style>\n${CSS}\n${DEMO_CSS}\n</style>`;
const doc = (head, body) => `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
fs.mkdirSync(path.join(HERE, 'demo'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'demo', 'index.html'), doc(demoHead, demoBody));
const scheduleSrc = read(path.join(HERE, 'schedule.html'));
fs.writeFileSync(path.join(HERE, 'demo', 'schedule.html'), scheduleSrc);
const artifactDir = process.argv[2];
if (artifactDir) {
  fs.mkdirSync(artifactDir, { recursive: true });
  // The Artifact skeleton supplies doctype/head/body for the page itself; schedule.html is a second page and keeps its own.
  // The rinkside demo is a separate Artifact, so its link points there and opens in a new tab (claude.ai won't load in a frame).
  const RINK_LOCAL = "href: '../../rinkside/demo/index.html'";
  if (!demoBody.includes(RINK_LOCAL)) throw new Error('rinkside link not found in app.js');
  const artifactBody = demoBody.replace(RINK_LOCAL, "href: 'https://claude.ai/artifact/SUYQBvoKcSBmEKgWEeGesH', newTab: true");
  fs.writeFileSync(path.join(artifactDir, 'index.html'), `${demoHead}\n<style>html, body { background: #F7F3EC; }</style>\n${artifactBody}\n`);
  fs.writeFileSync(path.join(artifactDir, 'schedule.html'), scheduleSrc);
}

/* ---------------- static pages: coach app presets ---------------- */
const ctx = vm.createContext({ window: {}, console });
vm.runInContext(JS, ctx);
const presets = vm.runInContext('PRESETS', ctx);
const pages = [];
for (const p of presets) {
  vm.runInContext('state = freshState()', ctx);
  ctx.__p = p;
  const html = vm.runInContext('__p.setup(state); view()', ctx);
  const screen = vm.runInContext('state.screen', ctx);
  pages.push({ ...p, screen, html, source: 'app' });
}

/* ---------------- static pages: schedule section states ---------------- */
const schedScript = [...scheduleSrc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n')
  .replace(/\nroute\(\);\s*$/, '\n');
const schedCss = scheduleSrc.match(/<style>([\s\S]*?)<\/style>/)[1];
const sctx = { console, setTimeout() {}, addEventListener() {}, location: { hash: '' }, window: { scrollTo() {} } };
sctx.document = { getElementById: () => ({ set innerHTML(v) { sctx.__out = v; } }) };
vm.createContext(sctx);
vm.runInContext(schedScript.replace(/\naddEventListener\('hashchange', route\);/, '\n'), sctx);
const SCHED = [
  ['schedule-hub', 'Schedule', 'Your schedule', 'Redesigned from CoachDashboard. The schedule hub: the two ways in, and upcoming time off and special schedules.', 'freshState(); render();'],
  ['schedule-weekly', 'Schedule', 'Weekly schedule editor', 'Redesigned from SchedHabit. Blocks on the left, the whole week on the right; click a time to switch it off.', 'freshState(); openWeekly();'],
  ['schedule-weekly-clash', 'Schedule', 'Weekly schedule editor — blocks overlap', 'New state. Two blocks overlap on Mondays, so Review is disabled until it is fixed.', 'freshState(); openWeekly(); state.def.blocks[1].sod = 660; state.def.active = 2; render();'],
  ['schedule-weekly-no-ice', 'Schedule', 'Weekly schedule editor — new block, no ice type', 'New state. A new block starts with no ice type, so Review is disabled until one is picked.', 'freshState(); openWeekly(); addBlock(); state.def.blocks[2].days[2] = 1; render();'],
  ['schedule-add-dates', 'Schedule', 'Time off or a special schedule?', 'Redesigned from CoachAwayChoose.', "freshState(); go('choose');"],
  ['schedule-time-off', 'Schedule', 'Time off — a name and dates', 'Redesigned from CoachTimeOff. The cancellation count shows before review.', 'freshState(); openAway();'],
  ['schedule-time-off-overlap', 'Schedule', 'Time off — overlap rejected', 'Redesigned from CoachTimeOffOverlap.', "freshState(); state.away.name = 'Family visit'; state.away.sd = '2026-11-23'; state.away.ed = '2026-11-24'; openAway();"],
  ['schedule-special', 'Schedule', 'Special schedule — dated form', 'New. The dated version of the editor that had no Forest design: one column per date in the range.', "freshState(); openTemp('camp');"],
  ['schedule-review', 'Schedule', 'Review — cancellations, re-pricing, big price change', 'Redesigned from CoachScheduleReview. Morning ice cut to $5 and switched off on Wednesdays.', "freshState(); openWeekly(); state.def.blocks[0].cost = 5; state.def.blocks[0].days[3] = 0; go('review');"],
  ['schedule-review-skaters', 'Schedule', 'Review — skaters per lesson lowered', 'New state. Morning ice goes from up to 2 skaters to 1; lessons already booked keep their setting.', "freshState(); openWeekly(); state.def.blocks[0].maxSkaters = 1; go('review');"],
  ['schedule-review-time-off', 'Schedule', 'Review — time off', 'New state. The same review screen for time off.', 'freshState(); openAway(); reviewAway();'],
  ['schedule-status', 'Schedule', 'After saving — applying', 'Redesigned from CoachChangeStatus. Progress while the change is applied and families are emailed.', 'freshState(); openWeekly(); state.def.blocks[0].cost = 55; state.ack = true; accept();'],
  ['schedule-status-done', 'Schedule', 'After saving — done', 'Redesigned from CoachChangeStatus.', "freshState(); openWeekly(); state.def.blocks[0].cost = 55; state.ack = true; accept(); state.apply.stage = 'done'; render();"],
];
for (const [file, group, title, note, code] of SCHED) {
  sctx.__out = '';
  vm.runInContext(code, sctx);
  pages.push({ id: file, file, group, title, note, html: sctx.__out, source: 'schedule' });
}

/* ---------------- link rewriting ---------------- */
const byScreen = {};
for (const p of pages) if (p.screen && !byScreen[p.screen]) byScreen[p.screen] = p.file;
Object.assign(byScreen, { forgot: 'forgot-password', signup: 'signup-1-account', profile: byScreen['profile'] || 'profile-details' });
const schedLink = { '': 'schedule-hub', weekly: 'schedule-weekly', away: 'schedule-add-dates', special: 'schedule-special' };
const fixLinks = html => html
  .replace(/href="schedule\.html(?:#(\w*))?"/g, (_, h = '') => `href="${schedLink[h] || 'schedule-hub'}.html"`)
  .replace(/href="index\.html#([\w-]+)"/g, (_, s) => `href="${byScreen[s] || 'today'}.html"`)
  .replace(/href="#([\w-]*)"/g, (_, s) => `href="${s ? (byScreen[s] || 'today') : 'schedule-hub'}.html"`)
  .replace(/ on(?:click|change|input)="[^"]*"/g, '');

/* ---------------- write static pages ---------------- */
const order = pages.slice().sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
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
fs.mkdirSync(path.join(HERE, 'static'), { recursive: true });
for (const f of fs.readdirSync(path.join(HERE, 'static'))) if (f.endsWith('.html')) fs.unlinkSync(path.join(HERE, 'static', f));
order.forEach((p, i) => {
  const prev = order[(i - 1 + order.length) % order.length], next = order[(i + 1) % order.length];
  const css = p.source === 'schedule' ? schedCss : CSS;
  const bar = `<header class="sp-bar"><span>BladeBook coach website · Harbor · ${p.group}</span><b>${p.title}</b><span class="sp-bar__note">${p.note || ''}</span><nav class="sp-bar__nav"><a href="${prev.file}.html">← ${prev.title}</a><a href="index.html">All pages</a><a href="${next.file}.html">${next.title} →</a></nav></header>`;
  const head = `<title>${p.title.replace(/<[^>]+>/g, '')} · BladeBook coach (Harbor)</title>\n${FONTS}\n<style>\n${css}\n${STATIC_CSS}\n</style>`;
  fs.writeFileSync(path.join(HERE, 'static', p.file + '.html'), doc(head, `${bar}\n<div class="sp-page"><div class="bb" data-layout="top">${fixLinks(p.html)}</div></div>`));
});

/* ---------------- gallery ---------------- */
const groups = GROUP_ORDER.filter(g => order.some(p => p.group === g));
const gallery = `<header class="g-head"><h1>BladeBook coach website — Harbor</h1><p>${order.length} static page designs, generated from the same source as the <a href="../demo/index.html">interactive demo</a>. Sample coach: Dana Whitfield. Today in the samples is Wednesday, October 14, 2026, 8:15 AM.</p></header>
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
fs.writeFileSync(path.join(HERE, 'static', 'index.html'), doc(`<title>BladeBook coach website · Harbor static designs</title>\n${FONTS}\n<style>${GALLERY_CSS}</style>`, gallery));

console.log(`demo: ${path.join(HERE, 'demo')}\nstatic: ${order.length} pages + index.html${artifactDir ? `\nartifact: ${artifactDir}` : ''}`);
for (const g of groups) console.log(`  ${g}: ${order.filter(p => p.group === g).map(p => p.file).join(', ')}`);
