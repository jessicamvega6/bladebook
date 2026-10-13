/* BladeBook — shared runtime for the Harbor demos (coach, client, rinkside).
   Sample data (coach Dana Whitfield; today is Wed, Oct 14, 2026), date and money helpers, lookups,
   interactive controls bound to state, the modal overlay and the browser runtime.
   Each app defines freshState(), `let state`, its shells and SCREENS, and sets APP_TITLE.
   Load order: library.js, shared.js, <app>/app.js, <app>/screens-*.js. Nothing here touches the DOM at load. */

/* ================= registries ================= */
const SCREENS = {};   // id -> () => html (reads global `state`)
const ACTIONS = {};   // name -> (...args) => void (mutates `state`; render follows)
const MODALS = {};    // kind -> (modal) => html (overlay contents)
const PRESETS = [];   // { id, file, group, title, note, setup(st) } — one static page each

/* ================= dates & money ================= */
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TODAY = '2026-10-14';          // demo "today": Wednesday, October 14, 2026
let NOW_MIN = 8 * 60 + 15;           // 8:15 AM. An app may set it before freshState() (the rinkside app runs earlier in the morning).
const NOTICE_H = 24;

const parseIso = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const toIso = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const addDays = (iso, n) => { const d = parseIso(iso); d.setDate(d.getDate() + n); return toIso(d); };
const dowOf = iso => parseIso(iso).getDay();
const weekStart = iso => addDays(iso, -dowOf(iso));          // Sunday
const fmtT = m => { const h24 = Math.floor(m / 60), mm = m % 60, h = h24 % 12 === 0 ? 12 : h24 % 12; return `${h}:${String(mm).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`; };
const fmtShortT = m => fmtT(m).replace(' AM', '').replace(' PM', '');
const dShort = iso => { const d = parseIso(iso); return `${MON[d.getMonth()]} ${d.getDate()}`; };
const dDow = iso => { const d = parseIso(iso); return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`; };
const dLong = iso => { const d = parseIso(iso); return `${DOW_LONG[d.getDay()]}, ${MON_LONG[d.getMonth()]} ${d.getDate()}`; };
const dFull = iso => { const d = parseIso(iso); return `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
const money = n => '$' + n.toLocaleString('en-US');
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const initials = n => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
/** Lesson start compared with "now". */
const isPast = l => l.iso < TODAY || (l.iso === TODAY && l.t + l.len <= NOW_MIN);
const isStarted = l => l.iso < TODAY || (l.iso === TODAY && l.t <= NOW_MIN);

/* ================= sample data ================= */
/* Matches the schedule demo: Morning ice Mon/Wed/Fri 6:00–11:30, 30 min, $50; Afternoon power
   hours Mon 3:00–5:00 PM, 60 min, $80; Summer camp week Sep 14–20 (special schedule); Thanksgiving
   break Nov 22–28 (no lessons). */
/* Rink and ice types (FeatureDecriptions/Schedule Creater.md). Phase 1 has one rink, fixed; each rink's list of ice
   types is kept by the BladeBook owner. Families never see the ice type or skaters per lesson (ADR-026 d1). */
const RINK = 'Pelham Civic Center (PCC)';
const RINK_SHORT = 'Pelham Civic Center';
const ICE_TYPES = ['Birmingham Figure Skating Club (BFSC) freestyle ice', 'Stick and Puck (S&P) ice', 'Public ice'];
const ICE_SHORT = { [ICE_TYPES[0]]: 'BFSC freestyle', [ICE_TYPES[1]]: 'Stick and Puck', [ICE_TYPES[2]]: 'Public ice' };
/* maxSkaters: skaters per lesson, default 1 (private), most 2 (ADR-026 d1). Morning ice can be shared. */
const BLOCKS = [
  { name: 'Morning ice', days: [1, 3, 5], sod: 360, eod: 690, len: 30, price: 50, maxSkaters: 2, rink: RINK, ice: ICE_TYPES[0] },
  { name: 'Afternoon power hours', days: [1], sod: 900, eod: 1020, len: 60, price: 80, maxSkaters: 1, rink: RINK, ice: ICE_TYPES[2] },
];
const SPECIALS = [
  { name: 'Summer camp week', kind: 'special', sd: '2026-09-14', ed: '2026-09-20', blocks: [{ name: 'Camp ice', sod: 540, eod: 960, len: 60, price: 80, maxSkaters: 1, rink: RINK, ice: ICE_TYPES[0] }] },
  { name: 'Thanksgiving break', kind: 'timeoff', sd: '2026-11-22', ed: '2026-11-28' },
  { name: 'Holiday camp week', kind: 'special', sd: '2026-12-21', ed: '2026-12-27', blocks: [{ name: 'Camp ice', sod: 540, eod: 960, len: 60, price: 80, maxSkaters: 1, rink: RINK, ice: ICE_TYPES[0] }] },
];
/** Every slot the schedule produces on a date: [{t, len, price, block}]. */
function slotsOn(iso) {
  const sp = SPECIALS.find(s => iso >= s.sd && iso <= s.ed);
  const blocks = sp ? (sp.blocks || []) : BLOCKS.filter(b => b.days.includes(dowOf(iso)));
  const out = [];
  for (const b of blocks) for (let t = b.sod; t + b.len <= b.eod; t += b.len) out.push({ t, len: b.len, price: b.price, block: b.name, maxSkaters: b.maxSkaters || 1, ice: b.ice });
  return out;
}
const specialOn = iso => SPECIALS.find(s => iso >= s.sd && iso <= s.ed);

function freshStudents() {
  return [
    { id: 's1', name: 'Mia Chen', minor: true, rel: 'Guardian', client: 'Grace Chen', email: 'grace.chen@example.com', phone: '(205) 555-0110', sms: true, status: 'ACTIVE', org: 0, orgNum: '3318102', since: '2025-09-02', shareCode: 'MIA-4K7Q' },
    { id: 's2', name: 'Noah Chen', minor: true, rel: 'Guardian', client: 'Grace Chen', email: 'grace.chen@example.com', phone: '(205) 555-0110', sms: true, status: 'ACTIVE', org: 1, orgNum: '2027KQ4815MX3T', since: '2025-09-02', shareCode: 'NOAH-9WD2' },
    { id: 's3', name: 'Ella Alvarez', minor: true, rel: 'Guardian', client: 'Marco Alvarez', email: 'm.alvarez@example.com', phone: '(205) 555-0134', sms: false, status: 'ACTIVE', since: '2026-01-10', shareCode: 'ELLA-3HTV' },
    { id: 's4', name: 'Sam Rivera', minor: true, rel: 'Guardian', client: 'Dee Rivera', email: 'dee.rivera@example.com', phone: '(205) 555-0172', sms: true, status: 'ACTIVE', since: '2024-10-01', override: 45, shareCode: 'SAM-6RZB' },
    { id: 's5', name: 'Leo Martin', minor: true, rel: 'Guardian', client: 'Kate Martin', email: 'kate.martin@example.com', phone: '(205) 555-0188', sms: false, status: 'ACTIVE', since: '2026-03-15', shareCode: 'LEO-2PXM' },
    { id: 's6', name: 'Priya Rao', minor: false, rel: 'Self', client: 'Priya Rao', email: 'priya.rao@example.com', phone: '(205) 555-0145', sms: true, status: 'ACTIVE', since: '2025-11-20', shareCode: 'PRIYA-7CJ4' },
    { id: 's7', name: 'Owen Brooks', minor: false, rel: 'Self', client: 'Owen Brooks', email: 'owen.b@example.com', phone: '(205) 555-0161', sms: false, status: 'ACTIVE', since: '2026-08-04', shareCode: 'OWEN-5NFK' },
    { id: 'p1', name: 'Ava Park', minor: true, rel: 'Guardian', client: 'Sarah Park', email: 'sarah.park@example.com', phone: '(205) 555-0196', sms: true, status: 'PENDING', org: 0, orgNum: '3318246', since: '2026-10-12', shareCode: 'AVA-8TQW' },
    { id: 'p2', name: 'Jack Park', minor: true, rel: 'Guardian', client: 'Sarah Park', email: 'sarah.park@example.com', phone: '(205) 555-0196', sms: true, status: 'PENDING', org: 1, orgNum: '2027HN7342PW6R', since: '2026-10-12', shareCode: 'JACK-4MVD' },
    { id: 'p3', name: 'Olivia Grant', minor: false, rel: 'Self', client: 'Olivia Grant', email: 'olivia.grant@example.com', phone: '(205) 555-0127', sms: false, status: 'PENDING', org: 0, orgNum: '2904417', since: '2026-10-13', shareCode: 'OLIV-9KRB' },
    // Zoe skates with another coach. Grace invited her to share Mia's Friday lesson; Tom confirmed, so Zoe now waits for
    // Coach Dana like any sign-up, and joins the lesson when Dana approves her (pendingJoins, ADR-026 d5).
    { id: 'p4', name: 'Zoe Okafor', minor: true, rel: 'Guardian', client: 'Tom Okafor', email: 'tom.okafor@example.com', phone: '(205) 555-0153', sms: true, status: 'PENDING', org: 0, orgNum: '3402981', since: '2026-10-13', shareCode: 'ZOE-8M3P',
      pendingJoins: [{ iso: '2026-10-16', t: 510, invite: 'i2' }], invitedBy: 'Grace Chen' },
  ];
}
/* Recurring arrangements: [studentId, weekday, start minute, first date, last date]. */
const ARRANGEMENTS = [
  ['s1', 1, 360, '2026-09-01', '2026-12-21'], ['s1', 3, 390, '2026-09-01', '2026-12-23'],
  ['s2', 5, 420, '2026-09-01', '2026-12-18'],
  ['s3', 1, 420, '2026-09-01', '2026-11-30'], ['s3', 5, 540, '2026-09-01', '2026-11-27'],
  ['s4', 3, 360, '2026-09-01', '2026-12-23'], ['s4', 1, 540, '2026-09-01', '2026-10-26'],
  ['s5', 5, 360, '2026-09-01', '2026-12-18'], ['s5', 3, 600, '2026-09-01', '2026-11-25'],
  ['s6', 1, 900, '2026-09-01', '2026-12-21'],
  ['s7', 3, 510, '2026-09-01', '2026-12-23'], ['s7', 5, 630, '2026-09-01', '2026-12-18'],
];
const CAMP = [['s1', '2026-09-14', 540], ['s2', '2026-09-14', 600], ['s3', '2026-09-15', 540], ['s5', '2026-09-16', 660], ['s6', '2026-09-17', 840], ['s4', '2026-09-18', 540]];
const hash = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

function freshLessons(students) {
  const out = []; let n = 0;
  const priceFor = (sid, slot) => { const s = students.find(x => x.id === sid); return s.override || slot.price; };
  const add = (sid, iso, slot) => {
    if (out.some(l => l.iso === iso && l.t === slot.t)) return;
    const l = { id: 'b' + (++n), sid, iso, t: slot.t, len: slot.len, price: priceFor(sid, slot), status: 'BOOKED', pay: 'UNPAID', recurring: !!slot.rec };
    if (isPast(l)) {
      const h = hash(l.id + iso) % 20;
      l.status = h === 0 ? 'NO_SHOW' : 'CHECKED_IN';
      l.pay = iso < '2026-09-21' ? (h === 3 ? 'WAIVED' : 'PAID') : (h % 3 === 0 ? 'UNPAID' : 'PAID');
      if (l.status === 'NO_SHOW') l.pay = 'UNPAID';
      if (l.pay === 'PAID') l.paidBy = ['VENMO', 'CASH', 'VENMO', 'CASHAPP', null, 'OTHER'][h % 6];   // how the client paid; optional (ADR-003)
    }
    out.push(l);
  };
  for (let iso = '2026-09-01'; iso <= '2026-12-31'; iso = addDays(iso, 1)) {
    if (specialOn(iso)) continue;
    for (const [sid, dow, t, a, b] of ARRANGEMENTS) {
      if (dowOf(iso) !== dow || iso < a || iso > b) continue;
      const slot = slotsOn(iso).find(s => s.t === t);
      if (slot) add(sid, iso, { ...slot, rec: true });
    }
  }
  for (const [sid, iso, t] of CAMP) add(sid, iso, { ...slotsOn(iso).find(s => s.t === t) });
  // A few one-off lessons
  for (const [sid, iso, t] of [['s1', '2026-10-16', 510], ['s6', '2026-10-16', 480], ['s2', '2026-10-19', 450], ['s7', '2026-10-21', 660], ['s3', '2026-10-09', 600]]) add(sid, iso, slotsOn(iso).find(s => s.t === t));
  // Today: Sam 6:00 and Mia 6:30 checked in; Owen 8:30 and Leo 10:00 still to come; 11:00 held.
  out.push({ id: 'h1', sid: null, iso: TODAY, t: 660, len: 30, price: 0, status: 'COACH_HELD', pay: null });
  // Shared lessons (ADR-026). Sam's Wednesday 6:00 series is shared with Leo: each skater has their own attendance and payment.
  for (const l of out.filter(x => x.sid === 's4' && dowOf(x.iso) === 3 && x.t === 360 && x.iso >= '2026-10-07'))
    l.with = [{ sid: 's5', status: isPast(l) ? 'CHECKED_IN' : 'BOOKED', pay: isPast(l) ? 'PAID' : 'UNPAID', paidBy: isPast(l) ? 'CASH' : null, price: 50 }];
  // Grace invited Zoe Okafor to share Mia's Friday 8:30; Zoe waits for Coach Dana's approval (invite i2).
  const mia = out.find(l => l.sid === 's1' && l.iso === '2026-10-16' && l.t === 510); if (mia) mia.invited = 'p4';
  // Not recorded: Ella's lesson last Friday has no attendance.
  const ella = out.find(l => l.sid === 's3' && l.iso === '2026-10-09' && l.t === 540); if (ella) { ella.status = 'BOOKED'; ella.pay = 'UNPAID'; }
  return out.sort((a, b) => (a.iso + String(a.t).padStart(4, '0')).localeCompare(b.iso + String(b.t).padStart(4, '0')));
}

/* Shared-lesson invitations (ADR-026 d5). inviteStatus: SENT | AWAITING_COACH | CONFIRMED | DECLINED | WITHDRAWN | EXPIRED.
   from: the booking family; skater: the invited skater; series: one invitation covers a whole recurring series. */
function freshInvites() {
  return [
    { id: 'i1', from: 'Owen Brooks', fromSkater: 's7', skater: 's2', dow: 3, t: 510, len: 30, first: '2026-10-21', last: '2026-12-23', series: true, status: 'SENT', sent: '2026-10-13',
      clashes: [{ when: 'Wed, Nov 4 · 8:30 AM', what: 'Noah’s lesson with Coach Ben Ortiz' }] },
    { id: 'i2', from: 'Grace Chen', fromSkater: 's1', skater: 'p4', iso: '2026-10-16', t: 510, len: 30, series: false, status: 'AWAITING_COACH', sent: '2026-10-12', confirmed: '2026-10-13', warnedAt: '2026-10-13', clashes: [] },
    { id: 'i3', from: 'Dee Rivera', fromSkater: 's4', skater: 's5', dow: 3, t: 360, len: 30, first: '2026-10-07', last: '2026-12-23', series: true, status: 'CONFIRMED', sent: '2026-10-01', clashes: [] },
  ];
}
/** The shared-lesson warning time: 24 hours plus the coach's notice period before the lesson (ADR-026 d5a). The nightly
   sweep sends a warning early rather than late, so one already sent (warnedAt) counts as warned. */
const inviteWarned = (inv, notice = NOTICE_H) => { if (inv.status !== 'AWAITING_COACH' || !inv.iso) return false;
  if (inv.warnedAt) return true;
  const mins = Math.round((parseIso(inv.iso) - parseIso(TODAY)) / 864e5) * 1440 + inv.t - NOW_MIN; return mins > 0 && mins <= (24 + notice) * 60; };

/* Payment types (ADR-016 d7, amended 2026-10-12): one switch per type. [paidVia value, label, handle key, switch key, placeholder].
   A type switched on is a how-paid option (ADR-003 d4) and is shown to approved families. Cash has no handle. */
const PAY_TYPES = [['CASH', 'Cash', null, 'cash', ''], ['VENMO', 'Venmo', 'venmo', 'onVenmo', '@handle'],
  ['CASHAPP', 'Cash App', 'cashapp', 'onCashapp', '$cashtag'], ['PAYPAL', 'PayPal', 'paypal', 'onPaypal', 'paypal.me/you']];
const payOn = p => PAY_TYPES.filter(([, , h, k]) => p[k] && (!h || p[h]));
const payTypesFor = p => [...payOn(p).map(([v, l]) => [v, l]), ['OTHER', 'Other']];
/** What approved families see: each type switched on, with its handle ('' for cash). */
const payShown = p => payOn(p).map(([, l, h]) => [l, h ? p[h] : '']);
const PAID_BY_LABEL = { CASH: 'Cash', VENMO: 'Venmo', CASHAPP: 'Cash App', PAYPAL: 'PayPal', OTHER: 'Other' };

function freshProfile() {
  return {
    first: 'Dana', last: 'Whitfield', loginEmail: 'dana.whitfield@gmail.com', businessEmail: 'lessons@danawhitfieldskating.com',
    phone: '(205) 555-0142', tz: 'Central — Chicago', currency: 'USD', notice: 24, code: 'DANA-7K2Q', photo: true,
    showPhone: true, showEmail: true, smsCancel: false,
    instructions: 'Venmo @dana-skates, or cash at the rink. Please pay within a week of the lesson.',
    venmo: '@dana-skates', cashapp: '$danaskates', paypal: '',   // handles; a handle is kept when its type is switched off
    cash: true, onVenmo: true, onCashapp: false, onPaypal: false,   // one switch per payment type (ADR-016 d7, amended 2026-10-12)
    payKept: { onCashapp: true },   // types switched off with a handle kept: switching back on asks the coach to verify it
    sport: 'Figure skating', rinkPlan: 'percent',   // rink terms: one reading of Q_Rink-Fees.md (15% of gross, or $500 a month)
    emails: [{ addr: 'lessons@danawhitfieldskating.com', note: 'Current · confirmed' }, { addr: 'dana.whitfield@gmail.com', note: 'Your login email · verified' }],
  };
}


/* ================= lookups ================= */
const student = id => state.students.find(s => s.id === id);
const nameOf = l => l.sid ? student(l.sid).name : 'Held';
const shortName = n => { const [f, l] = n.split(' '); return l ? `${f} ${l[0]}.` : f; };
const lessonsOn = iso => state.lessons.filter(l => l.iso === iso);
const active = () => state.students.filter(s => s.status === 'ACTIVE');
const pending = () => state.students.filter(s => s.status === 'PENDING');
const families = list => [...new Set(list.map(s => s.client))];

/* ================= interactive primitives =================
   Every control that does something carries data-act (and optional data-arg JSON).
   In the static build these attributes are inert. */
const actAttr = (act, args) => act ? ` data-act="${act}"${args && args.length ? ` data-arg='${esc(JSON.stringify(args))}'` : ''}` : '';
/** Button. o: {sm, lg, block, icon, iconR, disabled, args, href} */
function B(label, v = 'primary', act = '', o = {}) {
  const cls = `btn btn--${v}${o.block ? ' btn--block' : ''}${o.lg ? ' btn--lg' : ''}${o.sm ? ' btn--sm' : ''}`;
  const inner = `${o.icon ? ic(o.icon, o.sm ? 14 : 16) : ''}<span>${label}</span>${o.iconR ? ic(o.iconR, 16) : ''}`;
  if (o.href) return `<a class="${cls}" href="${o.href}">${inner}</a>`;
  return `<button type="button" class="${cls}"${o.disabled ? ' disabled' : actAttr(act, o.args)}>${inner}</button>`;
}
/** Segmented control; each option fires act(...args, index). */
const SEG = (opts, on, act, args = [], o = {}) =>
  `<div class="seg${o.block ? ' seg--block' : ''}" role="group">${opts.map((x, i) => `<button type="button" class="seg__opt${i === on ? ' is-on' : ''}"${actAttr(act, [...args, i])} aria-pressed="${i === on}">${x}</button>`).join('')}</div>`;
/** Switch row. */
const TOG = (label, on, sub, act, args = []) =>
  `<div class="toggle-row"><div class="toggle-row__text"><div class="toggle-row__label">${label}</div>${sub ? `<div class="toggle-row__sub">${sub}</div>` : ''}</div><button type="button" class="switch${on ? ' is-on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(label)}"${actAttr(act, args)}><span class="switch__knob"></span></button></div>`;
/** Checkbox. */
const CHK = (label, on, act, args = [], sub = '') =>
  `<label class="check"><input type="checkbox" class="check__input"${on ? ' checked' : ''}${actAttr(act, args)}><span class="check__text"><span class="check__label">${label}</span>${sub ? `<span class="check__sub">${sub}</span>` : ''}</span></label>`;
/** Real text input bound to a state path ("ui.search", "profile.phone"). o: {type, hint, error, optional, placeholder, mono, prefix} */
function INP(id, label, path, o = {}) {
  const val = getPath(path) ?? '';
  const ctl = `<input id="${id}" class="ctl${o.error ? ' is-error' : ''}${o.mono ? ' mono' : ''}" type="${o.type || 'text'}" value="${esc(val)}" data-bind="${path}"${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ''}${o.live ? ' data-live="1"' : ''}>`;
  return `<div class="field${o.error ? ' field--error' : ''}"><label class="label" for="${id}">${label}${o.optional ? ' <span class="label__opt">Optional</span>' : ''}</label>${ctl}${o.hint || o.error ? `<div class="hint${o.error ? ' hint--error' : ''}">${o.error ? ic('alert', 14) + o.error : o.hint}</div>` : ''}</div>`;
}
/** Select bound to a state path. options: [[value, label]] */
function SEL(id, label, path, options, o = {}) {
  const val = String(getPath(path));
  return `<div class="field"><label class="label" for="${id}">${label}</label><select id="${id}" class="ctl" data-bind="${path}"${o.num ? ' data-num="1"' : ''}${o.disabled ? ' disabled' : ''}>${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === val ? ' selected' : ''}>${l}</option>`).join('')}</select>${o.hint ? `<div class="hint">${o.hint}</div>` : ''}</div>`;
}
/** Textarea bound to a state path. */
const TXT = (id, label, path, o = {}) =>
  `<div class="field"><label class="label" for="${id}">${label}</label><textarea id="${id}" class="ctl ctl--area" rows="${o.rows || 3}" data-bind="${path}">${esc(getPath(path) ?? '')}</textarea>${o.hint ? `<div class="hint">${o.hint}</div>` : ''}</div>`;
/** Date-range filter bound to ui paths. */
const RANGE = (fromPath, toPath, idp) =>
  `${INP(idp + '-from', 'From', fromPath, { type: 'date', live: true })}${INP(idp + '-to', 'To', toPath, { type: 'date', live: true })}`;
const getPath = p => p.split('.').reduce((o, k) => (o == null ? o : o[k]), state);
function setPath(p, v) { const ks = p.split('.'); const last = ks.pop(); const o = ks.reduce((o, k) => (o[k] ??= {}), state); o[last] = v; }

/** Link to another screen. In the demo it's a hash route; the static build rewrites it. */
const href = screen => `#${screen}`;
const A_ = (screen, text, cls = 'link') => `<a class="${cls}" href="${href(screen)}">${text}</a>`;
const crumb = (screen, text) => `<a class="link" href="${href(screen)}">${ic('arrowL', 14)} ${text}</a>`;

/* ================= lesson status ================= */
const STATUS_BADGE = {
  CHECKED_IN: ['Attended', 'success', 'check'], NO_SHOW: ['No-show', 'danger', 'x'],
  BOOKED: ['Booked', 'neutral'], COACH_HELD: ['Held', 'neutral', 'lock'], NOT_RECORDED: ['Not recorded', 'warning', 'alert'],
};
const statusOf = l => (l.status === 'BOOKED' && isPast(l)) ? 'NOT_RECORDED' : l.status;
const statusBadge = l => { const [t, v, i] = STATUS_BADGE[statusOf(l)]; return badge(t, v, i); };

/* ================= modal & flash ================= */
function overlay() {
  const m = state.modal; if (!m || !MODALS[m.kind]) return '';
  const html = MODALS[m.kind](m);
  // A modal whose markup is already a bottom sheet (rinkside) is placed as-is.
  return `<div class="scrim" data-act="closeModal"></div>` + (html.trimStart().startsWith('<div class="sheet') ? html : `<div class="dialog" role="dialog" aria-modal="true">${html}</div>`);
}
Object.assign(ACTIONS, {
  closeModal() { state.modal = null; },
  go(screen) { go(screen); },
  dismissFlash() { state.flash = ''; },
});
function go(screen) { state.screen = screen; state.modal = null; state.flash = ''; }
/** Complete page for the current state. */
function view() {
  const s = SCREENS[state.screen] || SCREENS.today;
  return s() + overlay();
}


/* ================= browser runtime ================= */
function render() {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('app');
  const y = window.scrollY, focus = document.activeElement && document.activeElement.id;
  root.innerHTML = view();
  if (focus) { const el = document.getElementById(focus); if (el && el.focus) { el.focus(); if (el.setSelectionRange && el.type === 'text') { const n = el.value.length; el.setSelectionRange(n, n); } } }
  if (state._scrollTop) { window.scrollTo(0, 0); state._scrollTop = false; } else window.scrollTo(0, y);
  document.title = typeof APP_TITLE === 'string' ? APP_TITLE : 'BladeBook demo';
}
function run(name, args) {
  const f = ACTIONS[name]; if (!f) return;
  const before = state.screen;
  f(...(args || []));
  if (state.screen !== before) { state._scrollTop = true; if (location.hash.slice(1) !== state.screen) history.replaceState(null, '', '#' + state.screen); }
  render();
}
function boot() {
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (a && !(a.tagName === 'INPUT')) { e.preventDefault(); run(a.dataset.act, a.dataset.arg ? JSON.parse(a.dataset.arg) : []); return; }
    const l = e.target.closest('a[href^="#"]');
    if (l) { e.preventDefault(); const s = l.getAttribute('href').slice(1); if (SCREENS[s]) { go(s); state._scrollTop = true; history.pushState(null, '', '#' + s); render(); } }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('input[type="checkbox"][data-act]')) { run(t.dataset.act, t.dataset.arg ? JSON.parse(t.dataset.arg) : []); return; }
    if (t.dataset.bind) { setPath(t.dataset.bind, t.dataset.num ? +t.value : t.value); render(); }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.bind && t.tagName !== 'SELECT') { setPath(t.dataset.bind, t.value); if (t.dataset.live) render(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.modal) { state.modal = null; render(); } });
  const fromHash = () => { const s = location.hash.slice(1); if (SCREENS[s]) { go(s); render(); } };
  addEventListener('hashchange', fromHash);
  const s = location.hash.slice(1); if (SCREENS[s]) state.screen = s;
  render();
}
function resetDemo() { state = freshState(); const s = location.hash.slice(1); if (SCREENS[s]) state.screen = s; render(); }
