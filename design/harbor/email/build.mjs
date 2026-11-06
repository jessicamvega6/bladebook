/* Builds BladeBook's emails from templates.mjs.
     node design/harbor/email/build.mjs
   Writes:
     ses/<name>.json              one SES (Simple Email Service) template per email, in the shape
                                  `aws sesv2 create-email-template --cli-input-json file://…` takes
     ses/sample-data/<name>.json  sample TemplateData, for `aws sesv2 test-render-email-template`
     cognito/<name>.html          the three sign-in emails Cognito sends, with their subjects in
     cognito/messages.json
     static/index.html            the preview gallery: every email rendered with its sample data
   The layout is table-based with inline styles, 600px wide, so it holds up in Gmail, Outlook and
   Apple Mail. Harbor is light-only, so each email asks mail apps not to recolour it. */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATES, COGNITO } from './templates.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/* Harbor tokens (design/harbor/harbor.css), the WCAG-AA-checked light values. */
const C = {
  bg: '#F7F3EC', surface: '#FFFDF9', surface2: '#F2ECE2', border: '#E7DFD2',
  text: '#1E292D', text2: '#46524F', text3: '#5F6966',
  primary: '#0E6C68', primaryText: '#0A5350', tint: '#EFF7F5', tintBorder: '#BEDDD9',
  coral: '#A8432D',
};
const TONES = {
  info: ['#EFF7F5', '#BEDDD9', '#0A5350'],
  success: ['#E5F2E8', '#ADD4B8', '#215F3A'],
  warning: ['#FCEFD9', '#EDC98C', '#874B07'],
  danger: ['#FCEBE6', '#F0B7AA', '#97301F'],
};
const FONT = "Figtree, 'Helvetica Neue', Helvetica, Arial, sans-serif";

/* ---------------- blocks → HTML ---------------- */
const P = (s, extra = '') => `<p style="margin:0 0 18px;font-family:${FONT};font-size:17px;line-height:1.55;color:${C.text};${extra}">${s}</p>`;
const T = (attrs = '') => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${attrs}>`;

function blockHtml(b) {
  if (typeof b === 'string') return P(b);
  if (b.h) return `<h2 style="margin:26px 0 10px;font-family:${FONT};font-size:18px;line-height:1.3;font-weight:800;color:${C.text}">${b.h}</h2>`;
  if (b.fine) return P(b.fine, `font-size:15px;color:${C.text3}`);
  if (b.lines) return `{{#each ${b.lines}}}${P('{{line}}', 'margin-bottom:6px')}{{/each}}<div style="height:12px;line-height:12px;font-size:12px">&nbsp;</div>`;
  if (b.if) return `{{#if ${b.if}}}${b.then.map(blockHtml).join('')}${b.else ? `{{else}}${b.else.map(blockHtml).join('')}` : ''}{{/if}}`;
  if (b.details) {
    const rows = b.details.rows.map(([k, v], i) => `<tr>
      <td valign="top" style="padding:${i ? 8 : 16}px 12px ${i === b.details.rows.length - 1 ? 16 : 0}px 18px;width:34%;font-family:${FONT};font-size:15px;line-height:1.4;color:${C.text3}">${k}</td>
      <td valign="top" style="padding:${i ? 8 : 16}px 18px ${i === b.details.rows.length - 1 ? 16 : 0}px 0;font-family:${FONT};font-size:17px;line-height:1.4;color:${C.text}">${v}</td></tr>`).join('');
    return `${T(`width="100%" bgcolor="${C.tint}" style="margin:0 0 22px;background:${C.tint};border:1px solid ${C.tintBorder};border-radius:14px;border-collapse:separate"`)}${rows}</table>`;
  }
  if (b.lessons) {
    const l = b.lessons, strike = l.strike;
    const bg = strike ? C.surface2 : C.tint, bd = strike ? C.border : C.tintBorder;
    const line1 = `<div style="font-family:${FONT};font-size:17px;line-height:1.35;font-weight:700;color:${strike ? C.text2 : C.text};${strike ? 'text-decoration:line-through;' : ''}">${l.primary}</div>`;
    const line2 = l.secondary ? `<div style="font-family:${FONT};font-size:15px;line-height:1.4;color:${C.text2};padding-top:2px">${l.secondary}</div>` : '';
    const aside = l.aside ? `<td align="right" valign="middle" style="padding:12px 16px 12px 8px;white-space:nowrap;font-family:${FONT};font-size:17px;font-weight:700;color:${C.text}">${l.aside}</td>` : '';
    return `{{#each ${l.each}}}${T(`width="100%" bgcolor="${bg}" style="margin:0 0 8px;background:${bg};border:1px solid ${bd};border-radius:12px;border-collapse:separate"`)}<tr>
      <td valign="middle" style="padding:12px 16px">${line1}${line2}</td>${aside}</tr></table>{{/each}}<div style="height:14px;line-height:14px;font-size:14px">&nbsp;</div>`;
  }
  if (b.button) {
    const { label, href, secondary } = b.button;
    const bg = secondary ? C.surface : C.primary, fg = secondary ? C.primary : '#FFFFFF';
    return `${T('class="bb-btn" style="margin:6px 0 24px;border-collapse:separate"')}<tr><td align="center" bgcolor="${bg}" style="border-radius:999px;background:${bg}">
      <a href="${href}" target="_blank" style="display:inline-block;padding:13px 30px;border:2px solid ${C.primary};font-family:${FONT};font-size:18px;line-height:1.2;font-weight:800;color:${fg};text-decoration:none;border-radius:999px">${label}</a></td></tr></table>`;
  }
  if (b.notice) {
    const [bg, bd, fg] = TONES[b.notice.tone];
    return `${T(`width="100%" bgcolor="${bg}" style="margin:0 0 22px;background:${bg};border:1px solid ${bd};border-radius:14px;border-collapse:separate"`)}<tr>
      <td style="padding:14px 18px;font-family:${FONT};font-size:16px;line-height:1.5;color:${fg}">${b.notice.title ? `<b style="display:block;font-size:17px;padding-bottom:2px">${b.notice.title}</b>` : ''}${b.notice.text}</td></tr></table>`;
  }
  if (b.code) {
    return `${T(`width="100%" bgcolor="${C.tint}" style="margin:0 0 22px;background:${C.tint};border:1px solid ${C.tintBorder};border-radius:14px;border-collapse:separate"`)}<tr>
      <td align="center" style="padding:22px 12px;font-family:'SFMono-Regular', Menlo, Consolas, 'Courier New', monospace;font-size:36px;line-height:1;font-weight:700;letter-spacing:8px;color:${C.primaryText}">${b.code}</td></tr></table>`;
  }
  if (b.amount) {
    return `<div style="margin:0 0 22px"><div style="font-family:${FONT};font-size:15px;line-height:1.4;color:${C.text3}">${b.amount.label}</div>
      <div style="font-family:${FONT};font-size:34px;line-height:1.15;font-weight:800;color:${C.text};letter-spacing:-0.5px">${b.amount.value}</div></div>`;
  }
  if (b.stats) {
    const cells = b.stats.map(([k, v], i) => `<td class="bb-stat" width="25%" valign="top" style="padding:0 ${i === b.stats.length - 1 ? 0 : 8}px 8px 0">
      ${T(`width="100%" bgcolor="${C.surface2}" style="background:${C.surface2};border-radius:12px;border-collapse:separate"`)}<tr><td style="padding:12px 12px 10px">
      <div style="font-family:${FONT};font-size:26px;line-height:1.1;font-weight:800;color:${C.text}">${v}</div>
      <div style="font-family:${FONT};font-size:14px;line-height:1.3;color:${C.text3};padding-top:4px">${k}</div></td></tr></table></td>`).join('');
    return `${T('width="100%" style="margin:0 0 14px"')}<tr>${cells}</tr></table>`;
  }
  throw new Error('Unknown block: ' + JSON.stringify(b));
}

/* ---------------- blocks → plain text ---------------- */
/* A list's {{/each}} ends up alone on a line, which Handlebars removes with its newline, so each list
   ends with one spare newline to keep the blank line after it. */
/* The text part is not HTML, so it uses triple braces: SES (Handlebars) would otherwise turn & into &amp;. */
const raw = s => s.replace(/\{\{(?![{#/!]|else\}\})\s*([^{}]+?)\s*\}\}/g, '{{{$1}}}');
const plain = s => raw(s
  .replace(/<s>(.*?)<\/s>\s*/g, 'was $1, now ')
  .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g, '$2 ($1)')
  .replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' '));

function blockText(b) {
  if (typeof b === 'string') return plain(b) + '\n\n';
  if (b.h) return plain(b.h) + '\n';
  if (b.fine) return plain(b.fine) + '\n\n';
  if (b.lines) return `{{#each ${b.lines}}}${plain('{{line}}')}\n{{/each}}\n\n`;
  if (b.if) return `{{#if ${b.if}}}${b.then.map(blockText).join('')}${b.else ? `{{else}}${b.else.map(blockText).join('')}` : ''}{{/if}}`;
  if (b.details) return b.details.rows.map(([k, v]) => `${plain(k)}: ${plain(v)}`).join('\n') + '\n\n';
  if (b.lessons) {
    const l = b.lessons;
    return `{{#each ${l.each}}}- ${plain(l.primary)}${l.secondary ? ` · ${plain(l.secondary)}` : ''}${l.aside ? ` · ${plain(l.aside)}` : ''}\n{{/each}}\n\n`;
  }
  if (b.button) return `${plain(b.button.label)}:\n${plain(b.button.href)}\n\n`;
  if (b.notice) return `${b.notice.title ? plain(b.notice.title) + '. ' : ''}${plain(b.notice.text)}\n\n`;
  if (b.code) return `    ${b.code}\n\n`;
  if (b.amount) return `${plain(b.amount.label)}: ${plain(b.amount.value)}\n\n`;
  if (b.stats) return b.stats.map(([k, v]) => `${plain(k)}: ${plain(v)}`).join('\n') + '\n\n';
  throw new Error('Unknown block');
}

/* ---------------- the layout ---------------- */
const HEADERS = {
  family: { mark: '{{coachInitials}}', name: 'Coach {{coachName}}', sub: 'via BladeBook' },
  coach: { mark: 'BB', name: 'BladeBook', sub: 'For coaches' },
  cognito: { mark: 'BB', name: 'BladeBook', sub: 'Lessons with your skating coach' },
};
const FOOTERS = {
  family: ['Questions? Reply to this email and it goes straight to Coach {{coachFirst}}.', 'BladeBook sends lesson emails for Coach {{coachName}}. You get them because you have a BladeBook account with Coach {{coachFirst}}.'],
  coach: ['This is an automatic email from BladeBook. Replies to it aren’t read.', 'You get it because you coach on BladeBook.'],
  cognito: ['This is an automatic email from BladeBook. Replies to it aren’t read.'],
};
const audienceOf = t => t.group === 'coach' ? 'coach' : t.group === 'cognito' ? 'cognito' : 'family';

function layoutHtml(t) {
  const a = audienceOf(t), h = HEADERS[a];
  const pre = `${t.preheader}${'&#8199;&#847; '.repeat(40)}`;
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${t.subject}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;700;800&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light; supported-color-schemes: light; }
  body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table { border-collapse: collapse; mso-table-lspace: 0; mso-table-rspace: 0; }
  a { color: ${C.primary}; }
  @media (max-width: 620px) {
    .bb-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .bb-h1 { font-size: 24px !important; }
    .bb-btn { width: 100% !important; }
    .bb-btn a { display: block !important; }
  }
</style>
<!--[if mso]><style>body, table, td, p, a, h1, h2, div { font-family: Arial, sans-serif !important; }</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${pre}</div>
${T(`width="100%" bgcolor="${C.bg}" style="background:${C.bg}"`)}<tr><td align="center" style="padding:24px 12px 32px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
${T('width="100%" style="max-width:600px"')}
  <tr><td style="padding:0 8px 16px">
    ${T()}<tr>
      <td width="40" height="40" align="center" valign="middle" bgcolor="${C.primary}" style="width:40px;height:40px;border-radius:50%;background:${C.primary};font-family:${FONT};font-size:15px;font-weight:800;color:#FFFFFF">${h.mark}</td>
      <td style="padding-left:12px">
        <div style="font-family:${FONT};font-size:17px;line-height:1.2;font-weight:800;color:${C.text}">${h.name}</div>
        <div style="font-family:${FONT};font-size:14px;line-height:1.3;color:${C.text3}">${h.sub}</div>
      </td></tr></table>
  </td></tr>
  <tr><td>
    ${T(`width="100%" bgcolor="${C.surface}" style="background:${C.surface};border:1px solid ${C.border};border-radius:20px;border-collapse:separate"`)}<tr>
    <td class="bb-pad" style="padding:32px 36px 14px">
      <div style="font-family:${FONT};font-size:13px;line-height:1.3;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:${C.coral};padding-bottom:8px">${t.eyebrow}</div>
      <h1 class="bb-h1" style="margin:0 0 22px;font-family:${FONT};font-size:27px;line-height:1.2;font-weight:800;letter-spacing:-0.4px;color:${C.text}">${t.headline}</h1>
      ${t.blocks.map(blockHtml).join('\n      ')}
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:20px 12px 0">
    ${FOOTERS[a].map(f => `<p style="margin:0 0 8px;font-family:${FONT};font-size:14px;line-height:1.5;color:${C.text3}">${f}</p>`).join('')}
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
}

function layoutText(t) {
  const a = audienceOf(t), h = HEADERS[a];
  const body = t.blocks.map(blockText).join('');
  return `${plain(h.name)} ${plain(h.sub)}\n\n${plain(t.headline)}\n\n${body.replace(/\n{3,}/g, '\n\n').trimEnd()}\n\n--\n${FOOTERS[a].map(plain).join('\n')}\n`;
}

/* ---------------- a Handlebars subset, the same one SES uses, for the previews ---------------- */
/* Only {{x}}, {{{x}}}, {{#if}}/{{else}}, {{#each}}. Like Handlebars, a name inside {{#each}} is looked
   up on the item only, so a template that leans on an outer value fails here as it would in SES. */
function parse(src) {
  const root = { kids: [] }, stack = [root];
  const re = /\{\{\{\s*([^{}]+?)\s*\}\}\}|\{\{\s*([^{}]+?)\s*\}\}/g;
  let last = 0, m;
  const top = () => stack[stack.length - 1];
  const add = n => (top().inElse ? top().els : top().kids).push(n);
  while ((m = re.exec(src))) {
    if (m.index > last) add({ text: src.slice(last, m.index) });
    last = re.lastIndex;
    if (m[1]) { add({ v: m[1], raw: true }); continue; }
    const e = m[2];
    if (e.startsWith('#if ') || e.startsWith('#each ')) { const n = { block: e.split(' ')[0].slice(1), arg: e.split(' ')[1], kids: [], els: [] }; add(n); stack.push(n); }
    else if (e === 'else') top().inElse = true;
    else if (e === '/if' || e === '/each') { const n = stack.pop(); if (n.block !== e.slice(1)) throw new Error(`Mismatched ${e}`); }
    else add({ v: e });
  }
  if (stack.length !== 1) throw new Error('Unclosed block');
  if (last < src.length) add({ text: src.slice(last) });
  return root;
}
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '`': '&#x60;', '=': '&#x3D;' };
const truthy = v => Array.isArray(v) ? v.length > 0 : !!v;
function render(src, data, misses = new Set()) {
  /* Handlebars drops a line that holds nothing but a block tag ({{#if}}, {{/each}}, {{else}}). */
  src = src.replace(/(?<=^|\n)[ \t]*(\{\{(?:[#\/][^{}]*|else)\}\})[ \t]*(?:\r?\n|$)/g, '$1');
  const walk = (nodes, ctx) => nodes.map(n => {
    if (n.text !== undefined) return n.text;
    if (n.block === 'if') return walk(truthy(ctx[n.arg]) ? n.kids : n.els, ctx);
    if (n.block === 'each') { const list = ctx[n.arg]; return truthy(list) ? list.map(item => walk(n.kids, item)).join('') : walk(n.els, ctx); }
    const val = ctx[n.v];
    if (val === undefined || val === null) { misses.add(n.v); return ''; }
    return n.raw ? String(val) : String(val).replace(/[&<>"'`=]/g, c => ESC[c]);
  }).join('');
  return walk(parse(src).kids, data);
}

/* ---------------- build ---------------- */
const out = p => { mkdirSync(dirname(join(HERE, p)), { recursive: true }); return join(HERE, p); };
const gallery = [];
const problems = [];

for (const t of TEMPLATES) {
  const html = layoutHtml(t), text = layoutText(t), subject = raw(t.subject);
  writeFileSync(out(`ses/${t.name}.json`), JSON.stringify({ TemplateName: t.name, TemplateContent: { Subject: subject, Html: html, Text: text } }, null, 2) + '\n');
  writeFileSync(out(`ses/sample-data/${t.name}.json`), JSON.stringify(t.sample, null, 2) + '\n');
  const misses = new Set();
  const r = { subject: render(subject, t.sample, misses), html: render(html, t.sample, misses), text: render(text, t.sample, misses) };
  if (misses.size) problems.push(`${t.name}: no sample value for ${[...misses].join(', ')}`);
  if (Buffer.byteLength(html) > 100_000) problems.push(`${t.name}: HTML is over 100 KB; Gmail clips at 102 KB`);
  gallery.push({ ...meta(t), source: { subject, html, text }, ...r });
}

const cognitoOut = {};
for (const t of COGNITO) {
  const html = layoutHtml(t), text = layoutText(t);
  writeFileSync(out(`cognito/${t.name}.html`), html);
  cognitoOut[t.name] = { subject: t.subject, html: `cognito/${t.name}.html`, characters: html.length };
  if (html.length > 20_000) problems.push(`${t.name}: ${html.length} characters; Cognito allows 20,000`);
  gallery.push({ ...meta(t), source: { subject: t.subject, html, text }, subject: t.subject.replace('{####}', '482913'), html: html.replaceAll('{####}', '482913'), text: text.replaceAll('{####}', '482913') });
}
writeFileSync(out('cognito/messages.json'), JSON.stringify(cognitoOut, null, 2) + '\n');

function meta(t) {
  return { name: t.name, group: t.group, title: t.title, when: t.when, sender: t.sender, from: t.from, replyTo: t.replyTo, to: t.to,
    status: t.group === 'cognito' ? 'Cognito' : t.always ? 'Always sent' : t.switchable ? 'Switch in Phase 2' : 'Always sent' };
}

/* The gallery page: a shell (gallery.html) with the emails as JSON. */
const shell = readFileSync(join(HERE, 'gallery.html'), 'utf8');
const json = JSON.stringify(gallery).replace(/</g, '\\u003c');
writeFileSync(out('static/index.html'), shell.replace('/*__EMAILS__*/[]', json));

console.log(`${TEMPLATES.length} SES templates, ${COGNITO.length} Cognito messages, gallery at static/index.html`);
if (problems.length) { console.error('Problems:\n  ' + problems.join('\n  ')); process.exitCode = 1; }
