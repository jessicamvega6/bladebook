/* BladeBook screen library — extracted unchanged from design/redesign/option-5-harbor.html
   (2026-10-01). Helpers, shells and the 41 original screens (window.BB_SCREENS). */
/* BladeBook redesign — shared screen library.
   Every screen is built from the same small component vocabulary, so each
   theme only has to style ~40 class names to restyle the whole product. */

const ICONS = {
  logo: '<path d="M8.5 3v9.2c0 1.6 1 2.7 2.7 3.2l5.6 1.7"/><path d="M4 20h16"/><path d="M6.5 20v-2"/><path d="M17.5 20v-2.3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  wifiOff: '<path d="M12 20h.01M8.5 16.43a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M2 2l20 20"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  calOff: '<path d="M4.18 4.18A2 2 0 0 0 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 1.82-1.18M21 15.5V6a2 2 0 0 0-2-2H9.5M3 10h7M21 10h-5.5M16 2v4M8 2v4M2 2l20 20"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  spark: '<path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  arrowL: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
};
const ic = (n, s = 16, cls = '') =>
  `<svg class="ic ${cls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

/* ---------- primitives ---------- */
const btn = (label, v = 'primary', o = {}) =>
  `<button class="btn btn--${v}${o.block ? ' btn--block' : ''}${o.lg ? ' btn--lg' : ''}${o.sm ? ' btn--sm' : ''}"${o.disabled ? ' disabled' : ''}>${o.icon ? ic(o.icon, o.sm ? 14 : 16) : ''}<span>${label}</span>${o.iconR ? ic(o.iconR, 16) : ''}</button>`;
const badge = (t, v = 'neutral', icon) => `<span class="badge badge--${v}">${icon ? ic(icon, 12) : ''}${t}</span>`;
const banner = (v, title, body = '', icon) => {
  const i = icon || { success: 'check', warning: 'alert', danger: 'alert', info: 'info' }[v];
  return `<div class="banner banner--${v}"><span class="banner__icon">${ic(i, 18)}</span><div class="banner__text">${title ? `<div class="banner__title">${title}</div>` : ''}${body ? `<div class="banner__body">${body}</div>` : ''}</div></div>`;
};
const field = (label, value, o = {}) => `
  <div class="field${o.error ? ' field--error' : ''}">
    <label class="label">${label}${o.optional ? ' <span class="label__opt">Optional</span>' : ''}</label>
    <div class="input${o.area ? ' input--area' : ''}${o.select ? ' input--select' : ''}${o.focus ? ' is-focus' : ''}${o.placeholder ? ' is-placeholder' : ''}${o.mono ? ' input--mono' : ''}">
      ${o.prefix ? `<span class="input__affix">${o.prefix}</span>` : ''}${o.lead ? ic(o.lead, 16, 'input__lead') : ''}
      <span class="input__val">${value}</span>
      ${o.suffix ? `<span class="input__affix">${o.suffix}</span>` : ''}${o.select ? ic('chevD', 16, 'input__chev') : ''}${o.ok ? `<span class="input__ok">${ic('check', 14)}</span>` : ''}
    </div>
    ${o.hint ? `<div class="hint${o.error ? ' hint--error' : ''}">${o.error ? ic('alert', 14) : ''}${o.hint}</div>` : ''}
  </div>`;
const seg = (opts, active, o = {}) =>
  `<div class="seg${o.block ? ' seg--block' : ''}">${opts.map((x, i) => `<span class="seg__opt${i === active ? ' is-on' : ''}">${x}</span>`).join('')}</div>`;
const check = (label, on, sub = '') =>
  `<label class="check"><span class="check__box${on ? ' is-on' : ''}">${on ? ic('check', 13) : ''}</span><span class="check__text"><span class="check__label">${label}</span>${sub ? `<span class="check__sub">${sub}</span>` : ''}</span></label>`;
const toggle = (label, on, sub = '') =>
  `<div class="toggle-row"><div class="toggle-row__text"><div class="toggle-row__label">${label}</div>${sub ? `<div class="toggle-row__sub">${sub}</div>` : ''}</div><span class="switch${on ? ' is-on' : ''}"><span class="switch__knob"></span></span></div>`;
const radioCard = (title, sub, on, icon) =>
  `<div class="rcard${on ? ' is-on' : ''}">${icon ? `<span class="rcard__icon">${ic(icon, 20)}</span>` : ''}<div class="rcard__text"><div class="rcard__title">${title}</div>${sub ? `<div class="rcard__sub">${sub}</div>` : ''}</div><span class="radio${on ? ' is-on' : ''}"></span></div>`;
const avatar = (t, sz = '') => `<span class="avatar${sz ? ' avatar--' + sz : ''}">${t}</span>`;
const eyebrow = t => `<div class="eyebrow">${t}</div>`;
const pageHead = (title, sub = '', actions = '', crumb = '') =>
  `<div class="phead"><div class="phead__text">${crumb ? `<div class="crumb">${crumb}</div>` : ''}<h1 class="h1">${title}</h1>${sub ? `<p class="lede">${sub}</p>` : ''}</div>${actions ? `<div class="phead__actions">${actions}</div>` : ''}</div>`;
const card = (body, o = {}) =>
  `<section class="card${o.pad === false ? ' card--flush' : ''}${o.cls ? ' ' + o.cls : ''}">${o.title ? `<header class="card__head"><div><h2 class="h2">${o.title}</h2>${o.sub ? `<p class="card__sub">${o.sub}</p>` : ''}</div>${o.action || ''}</header>` : ''}<div class="card__body">${body}</div></section>`;
const row = (left, right = '', o = {}) =>
  `<div class="row${o.muted ? ' row--muted' : ''}${o.cls ? ' ' + o.cls : ''}"><div class="row__main">${left}</div>${right ? `<div class="row__side">${right}</div>` : ''}</div>`;
const rowTitle = (t, s = '') => `<div class="row__title">${t}</div>${s ? `<div class="row__sub">${s}</div>` : ''}`;
const actions = (l, r) => `<div class="actions"><div>${l || ''}</div><div class="actions__r">${r || ''}</div></div>`;
const kv = (k, v) => `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${v}</span></div>`;
const help = (title, body) => `<aside class="help"><div class="help__title">${ic('info', 16)}${title}</div><div class="help__body">${body}</div></aside>`;
const codeBoxes = (digits) => `<div class="otp">${digits.map((d, i) => `<span class="otp__box${d ? ' is-filled' : ''}${i === digits.findIndex(x => !x) ? ' is-focus' : ''}">${d || ''}</span>`).join('')}</div>`;
const pwRules = () => `<ul class="rules">${[['At least 8 characters', 1], ['An uppercase letter', 1], ['A lowercase letter', 1], ['A number', 1], ['A symbol (!@#$…)', 1]].map(([t, ok]) => `<li class="${ok ? 'is-ok' : ''}">${ic(ok ? 'check' : 'x', 13)}${t}</li>`).join('')}</ul>`;
const stat = (label, value, sub = '', icon = '') =>
  `<div class="stat">${icon ? `<span class="stat__icon">${ic(icon, 18)}</span>` : ''}<div class="stat__label">${label}</div><div class="stat__value">${value}</div>${sub ? `<div class="stat__sub">${sub}</div>` : ''}</div>`;

/* ---------- shells ---------- */
const NAV = {
  coach: [['Schedule', 'calendar'], ['Students', 'users'], ['Lessons', 'list'], ['Payments', 'card'], ['Profile', 'user']],
  family: [['Book a lesson', 'calendar'], ['My bookings', 'list'], ['Profile', 'user']],
};
const brand = () => `<div class="brand"><span class="brand__mark">${ic('logo', 18)}</span><span class="brand__name">BladeBook</span></div>`;
function app(kind, active, body, o = {}) {
  const who = kind === 'coach' ? ['DW', 'Dana Whitfield', 'Coach'] : ['GC', 'Grace Chen', 'Parent · Coach Dana'];
  const items = NAV[kind].map(([l, i]) => `<a class="nav__item${l === active ? ' is-active' : ''}">${ic(i, 18)}<span>${l}</span></a>`).join('');
  return `<div class="app app--${kind}">
    <aside class="nav">${brand()}<nav class="nav__items">${items}</nav>
      <div class="nav__user">${avatar(who[0], 'sm')}<span class="nav__user-text"><b>${who[1]}</b><small>${who[2]}</small></span></div></aside>
    <main class="main"><div class="page page--${o.width || 'narrow'}">${body}</div></main>${o.overlay || ''}</div>`;
}
const coachApp = (a, b, o) => app('coach', a, b, o);
const familyApp = (a, b, o) => app('family', a, b, o);

function stepper(steps, cur) {
  return `<ol class="stepper">${steps.map((s, i) => {
    const st = i < cur ? 'done' : i === cur ? 'current' : 'todo';
    return `<li class="step step--${st}"><span class="step__dot">${st === 'done' ? ic('check', 13) : i + 1}</span><span class="step__label">${s}</span></li>`;
  }).join('<li class="step__line" aria-hidden="true"></li>')}</ol>`;
}
function wizard(ctx, steps, cur, main, aside) {
  return `<div class="app app--wizard">
    <header class="wbar">${brand()}<span class="wbar__ctx">${ctx}</span><span class="wbar__right">Already have an account? <a class="link">Log in</a></span></header>
    <main class="wmain">${stepper(steps, cur)}<div class="wgrid"><div class="wcol">${main}</div>${aside || ''}</div></main></div>`;
}
const FAM_STEPS = ['Coach code', 'Your details', 'Verify email', 'Skaters', 'Done'];
const COACH_STEPS = ['Account', 'Verify login email', 'Business details', 'Business email'];

function phone(body, o = {}) {
  return `<div class="phone">
    <div class="phone__status"><span>6:24</span><span class="phone__status-r">${o.offline ? ic('wifiOff', 14) : '<span class="bars"><i></i><i></i><i></i><i></i></span>'}<span class="batt"><i></i></span></span></div>
    <header class="phone__head"><div><div class="phone__title">Today</div><div class="phone__sub">Wed, Oct 14 · Pelham Civic Center</div></div>${avatar('DW', 'sm')}</header>
    ${o.progress ? `<div class="phone__progress"><div class="phone__progress-row"><span>${o.progress[0]} of ${o.progress[1]} recorded</span><span>${o.progress[2] || ''}</span></div><div class="meter"><span style="width:${(o.progress[0] / o.progress[1]) * 100}%"></span></div></div>` : ''}
    <div class="phone__body">${body}</div>${o.overlay || ''}
    <nav class="tabbar"><a class="tabbar__item is-active">${ic('list', 20)}<span>Today</span></a><a class="tabbar__item">${ic('calendar', 20)}<span>Week</span></a><a class="tabbar__item">${ic('users', 20)}<span>Skaters</span></a></nav>
  </div>`;
}
const rinkLesson = (name, time, state = 'open', o = {}) => {
  let foot;
  if (state === 'present') foot = `<div class="rl__done rl__done--ok">${ic('check', 16)}Present · ${o.at}${o.saved ? `<span class="rl__saved">${ic('clock', 13)}Saved on phone</span>` : ''}</div>`;
  else if (state === 'noshow') foot = `<div class="rl__done rl__done--no">${ic('x', 16)}No-show${o.saved ? `<span class="rl__saved">${ic('clock', 13)}Saved on phone</span>` : ''}</div>`;
  else foot = `<div class="rl__btns"><button class="rbtn rbtn--present">${ic('check', 18)}Present</button><button class="rbtn rbtn--noshow">No-show</button><button class="rbtn rbtn--more${o.offline ? ' is-disabled' : ''}" aria-label="More">${ic('more', 18)}</button></div>`;
  return `<article class="rl${o.cls ? ' ' + o.cls : ''}"><div class="rl__head"><span class="rl__time">${time}</span><span class="rl__name">${name}</span><span class="rl__len">${o.len || '30 min'}</span></div>${foot}</article>`;
};

/* ---------- data ---------- */
function monthGrid(year, month, cellFn, o = {}) {
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<div class="cal__cell cal__cell--pad"></div>';
  for (let d = 1; d <= days; d++) cells += cellFn(d, (first + d - 1) % 7);
  return `<div class="cal${o.cls ? ' ' + o.cls : ''}"><div class="cal__dow">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(x => `<span>${x}</span>`).join('')}</div><div class="cal__grid">${cells}</div></div>`;
}

/* ---------- SCREENS ---------- */
const S = [];
const add = (flow, id, title, w, render, note) => S.push({ flow, id, title, w, render, note });

/* ===== Family · Booking ===== */
add('Family · Booking', 'Main', '1 · Pick a day', 1280, () => {
  const open = { 2: 3, 4: 5, 7: 9, 9: 4, 11: 7, 14: 12, 16: 6, 18: 10, 21: 14, 23: 8, 25: 11, 28: 16, 30: 10 };
  const cal = monthGrid(2026, 8, (d) => {
    const n = open[d];
    if (!n) return `<div class="cal__cell cal__cell--off"><span class="cal__num">${d}</span></div>`;
    return `<div class="cal__cell cal__cell--open${d === 14 ? ' is-sel' : ''}"><span class="cal__num">${d}</span><span class="cal__meta">${n} open</span></div>`;
  });
  return familyApp('Book a lesson', `
    ${pageHead('Book a lesson', 'Pick a day to see Coach Dana’s open times.', `<div class="picker"><span class="picker__label">Booking for</span><span class="picker__val">${avatar('MC', 'xs')}Mia Chen${ic('chevD', 16)}</span></div>`)}
    <div class="split split--cal">
      ${card(`
        <div class="calbar"><button class="iconbtn" aria-label="Previous month">${ic('chevL', 18)}</button><div class="calbar__title">September 2026</div><button class="iconbtn" aria-label="Next month">${ic('chevR', 18)}</button>
          <div class="calbar__r">${seg(['Aug', 'Sep', 'Oct'], 1)}</div></div>
        ${cal}
        <div class="legend"><span class="legend__item"><i class="sw sw--open"></i>Open times</span><span class="legend__item"><i class="sw sw--sel"></i>Selected</span><span class="legend__item"><i class="sw sw--off"></i>No lessons</span></div>`)}
      <div class="stack">
        ${card(`
          ${eyebrow('Monday, September 14')}
          <div class="dayprev__big"><span class="num">12</span> open times</div>
          <div class="dayprev__rows">
            ${kv('Morning', '6:00 – 11:30 AM')}
            ${kv('Afternoon', '1:30 – 5:00 PM')}
            ${kv('Lessons', '30–60 min · $50–$80')}
          </div>
          ${btn('See times', 'primary', { block: true, iconR: 'arrowR' })}`, { cls: 'card--accent' })}
        ${help('Booking window', 'You can see three months ahead. A repeating booking can run past that — you set the end date when you book.')}
      </div>
    </div>`, { width: 'wide' });
}, 'Dropped the redundant “Jump to week” column; unavailable days recede instead of shouting in grey; a day preview shows what’s open before you commit to clicking.');

add('Family · Booking', 'Timeline', '2 · Pick your times', 1280, () => {
  const days = [['Sun', 13, 'No ice', 'off'], ['Mon', 14, '2 picked', 'sel', 2], ['Tue', 15, 'No ice', 'off'], ['Wed', 16, '6 open', ''], ['Thu', 17, 'No ice', 'off'], ['Fri', 18, '1 picked', 'has', 1], ['Sat', 19, 'No ice', 'off']];
  const strip = `<div class="daystrip"><button class="iconbtn">${ic('chevL', 18)}</button>${days.map(([dw, n, s, st, c]) => `<div class="dchip${st ? ' dchip--' + st : ''}"><span class="dchip__dow">${dw}</span><span class="dchip__n">${n}</span><span class="dchip__s">${s}</span>${c ? `<span class="dchip__count">${c}</span>` : ''}</div>`).join('')}<button class="iconbtn">${ic('chevR', 18)}</button></div>`;
  const slot = (t, end, len, price, st) => `<div class="slot slot--${st} slot--${len}"><span class="slot__time">${t}<small> – ${end}</small></span><span class="slot__len">${len} min</span><span class="slot__price">${st === 'taken' ? 'Taken' : '$' + price}</span><span class="slot__mark">${st === 'mine' ? ic('check', 14) : ''}</span></div>`;
  const am = [['6:00', '6:30', 'open'], ['6:30', '7:00', 'open'], ['7:00', '7:30', 'taken'], ['7:30', '8:00', 'open'], ['8:00', '8:30', 'open'], ['8:30', '9:00', 'taken'], ['9:00', '9:30', 'open'], ['9:30', '10:00', 'mine'], ['10:00', '10:30', 'taken'], ['10:30', '11:00', 'open'], ['11:00', '11:30', 'open']];
  const hours = (labels) => `<div class="tl__hours">${labels.map(l => `<span>${l}</span>`).join('')}</div>`;
  return familyApp('Book a lesson', `
    ${pageHead('Monday, September 14', '12 of 16 times still open · picks are kept as you move between days', `<div class="picker"><span class="picker__label">Booking for</span><span class="picker__val">${avatar('MC', 'xs')}Mia Chen${ic('chevD', 16)}</span></div>`, `<a class="link">${ic('arrowL', 14)} September</a>`)}
    ${strip}
    <div class="split split--tl">
      ${card(`
        <div class="tl">
          <div class="tl__sec"><div class="tl__label">Morning ice <span>30 min · $50</span></div>
            <div class="tl__col">${am.map(([a, b, s]) => slot(a + ' AM', b, 30, 50, s)).join('')}</div></div>
          <div class="tl__sec"><div class="tl__label">Afternoon <span>30–60 min</span></div><div class="tl__gap">${ic('ban', 14)}Not on the ice 11:30 AM – 1:30 PM</div>
            <div class="tl__col">${slot('1:30 PM', '2:00', 30, 50, 'open')}${slot('2:00 PM', '2:30', 30, 50, 'taken')}${slot('2:30 PM', '3:00', 30, 50, 'open')}${slot('3:00 PM', '4:00', 60, 80, 'mine')}${slot('4:00 PM', '5:00', 60, 80, 'open')}</div></div>
        </div>
        <div class="legend"><span class="legend__item"><i class="sw sw--open"></i>Open</span><span class="legend__item"><i class="sw sw--sel"></i>Your pick</span><span class="legend__item"><i class="sw sw--taken"></i>Taken</span><span class="legend__note">Taller = longer lesson</span></div>`, { title: 'Open times', sub: 'Tap any open time to add it.' })}
      <div class="stack sticky">
        ${card(`
          <div class="picks">
            ${[['Mon 14', '9:30 AM', '30 min', 50], ['Mon 14', '3:00 PM', '60 min', 80], ['Fri 18', '8:00 AM', '30 min', 50]].map(([d, t, l, p]) => `<div class="pick"><div class="pick__when"><b>${d} · ${t}</b><small>${l}</small></div><span class="pick__price">$${p}</span><button class="iconbtn iconbtn--sm" aria-label="Remove">${ic('x', 14)}</button></div>`).join('')}
          </div>
          <div class="total"><span>3 lessons · 2 hr</span><span class="total__v">$180</span></div>
          ${btn('Continue', 'primary', { block: true, lg: true, iconR: 'arrowR' })}
          <p class="fine">You can make these repeat on the next step.</p>`, { title: 'Your picks', sub: 'For Mia Chen' })}
      </div>
    </div>`, { width: 'wide' });
}, 'Vertical, measured timeline: height is duration, so 30- and 60-minute lessons stay honest without rotating labels 90° — and it already works at phone width (the open problem from the annotation).');

add('Family · Booking', 'Recurring', '3 · Confirm & repeat', 1280, () => familyApp('Book a lesson', `
  ${pageHead('Confirm your lessons', 'Mia Chen with Coach Dana Whitfield', '', `<a class="link">${ic('arrowL', 14)} Pick times</a>`)}
  ${card(`
    ${row(`<span class="dateblock"><b>14</b><small>Sep</small></span>${rowTitle('Monday · 9:30 AM', '30 minutes')}`, '<span class="money">$50</span>')}
    ${row(`<span class="dateblock"><b>14</b><small>Sep</small></span>${rowTitle('Monday · 3:00 PM', '60 minutes')}`, '<span class="money">$80</span>')}
  `, { title: 'This week', pad: false })}
  ${card(`
    ${toggle('Repeat these lessons', true, 'Both times repeat on the same schedule.')}
    <div class="grid2">
      ${field('Repeats', 'Every week', { select: true })}
      ${field('Until', 'Mon, Dec 14, 2026', { select: true, lead: 'calendar', hint: 'Defaults to three months out.' })}
    </div>
    <div class="summary"><div>${kv('Lessons', '14 weeks × 2 = 28 lessons')}${kv('First week', '<b>$130</b>')}</div><div class="summary__note">${ic('info', 14)}You pay Dana directly — BladeBook only sends reminders.</div></div>
  `, { title: 'Repeat' })}
  ${actions(btn('Back', 'secondary'), btn('Book 28 lessons', 'primary', { lg: true }))}
`, { width: 'narrow' }), 'Repeat settings read as one sentence (“every week until Dec 14”) and the button says exactly how many lessons it will book.');

add('Family · Booking', 'Confirmation', '4 · Result', 1280, () => familyApp('Book a lesson', `
  <div class="hero hero--success"><span class="hero__icon">${ic('check', 26)}</span><div><h1 class="h1">30 lessons booked for Mia</h1><p class="lede">A confirmation email is on its way. 2 dates couldn’t be booked — everything else is confirmed.</p></div></div>
  <div class="grid2">
    ${card(`<div class="series"><div class="series__title">${ic('repeat', 16)}Mondays · 9:30 AM</div><div class="series__sub">30 min · $50 · weekly, Sep 14 – Dec 28</div><div class="meter meter--ok"><span style="width:87.5%"></span></div><div class="series__foot"><b>14 booked</b><span>2 unavailable</span></div></div>`)}
    ${card(`<div class="series"><div class="series__title">${ic('repeat', 16)}Mondays · 3:00 PM</div><div class="series__sub">60 min · $80 · weekly, Sep 14 – Dec 28</div><div class="meter meter--ok"><span style="width:100%"></span></div><div class="series__foot"><b>16 booked</b><span>All dates</span></div></div>`)}
  </div>
  ${card(`
    ${row(`<span class="roundicon roundicon--warn">${ic('x', 16)}</span>${rowTitle('Monday, Oct 12 · 9:30 AM', 'That time was taken or no longer exists.')}`, btn('Pick another time', 'secondary', { sm: true }))}
    ${row(`<span class="roundicon roundicon--warn">${ic('x', 16)}</span>${rowTitle('Monday, Nov 23 · 9:30 AM', 'That time was taken or no longer exists.')}`, btn('Pick another time', 'secondary', { sm: true }))}
  `, { title: '2 dates need another time', sub: 'Or leave them — the rest of your bookings are confirmed.', pad: false })}
  ${actions('', btn('View my bookings', 'primary'))}
`), 'Partial success leads with the win, shows each series as a progress bar, and puts “Pick another time” on the exact row that needs it.');

/* ===== Family · Sign up ===== */
const famHelp = help('How signing up works', 'Your coach gives you a code. You create an account, add the skater (you or your child), and your coach approves them. Booking opens as soon as they do — usually within a day.');
add('Family · Sign up', 'ClientCodeEmpty', '1a · Coach code — empty', 1280, () => wizard('Family sign up', FAM_STEPS, 0, card(`
  <h1 class="h1">Join your coach on BladeBook</h1><p class="lede">Enter the code your coach gave you.</p>
  ${field('Coach code', 'e.g. ABCD-1234', { placeholder: true, focus: true, mono: true, hint: 'It links your account to your coach’s lessons.' })}
  <div class="empty-coach">${ic('user', 20)}<span>Your coach will appear here so you can check it’s the right one.</span></div>
  ${btn('Continue', 'primary', { block: true, lg: true, disabled: true })}
  <p class="fine center">No code? Ask your coach — every coach has their own.</p>`), famHelp), 'One font, one primary action, one help panel. The disabled button tells you what’s missing instead of a separate warning line.');

add('Family · Sign up', 'ClientCode', '1b · Coach code — found', 1280, () => wizard('Family sign up', FAM_STEPS, 0, card(`
  <h1 class="h1">Join your coach on BladeBook</h1><p class="lede">Enter the code your coach gave you.</p>
  ${field('Coach code', 'DANA-7K2Q', { mono: true, ok: true })}
  <div class="found">${avatar('DW', 'lg')}<div><div class="found__name">Coach Dana Whitfield</div><div class="found__sub">Pelham Civic Center · Figure skating</div></div>${badge('Code found', 'success', 'check')}</div>
  ${btn('Continue with Dana', 'primary', { block: true, lg: true, iconR: 'arrowR' })}
  <p class="fine center">Wrong coach? Check the code with them.</p>`), famHelp), 'Confirmation of the coach is a clear identity card; the button names who you’re continuing with.');

add('Family · Sign up', 'ClientDetails', '2 · Your details', 1280, () => wizard('Family sign up', FAM_STEPS, 1, card(`
  <h1 class="h1">About you</h1><p class="lede">The person who books and pays for lessons.</p>
  <div class="grid2">${field('Full name', 'Grace Chen')}${field('Mobile phone', '(205) 555-0143')}</div>
  ${field('Email', 'grace.chen@example.com', { hint: 'For logging in, confirmations and reminders.' })}
  ${field('Password', '•••••••••••', { focus: true })}
  ${pwRules()}
  <div class="fieldset"><div class="label">Who are the lessons for?</div>${seg(['Me', 'My child (parent)', 'My child (guardian)'], 1, { block: true })}<div class="hint">You’ll add your child on step 4.</div></div>
  ${check('Text me reminders too', true, 'Email reminders always go out. Texts arrive the morning of a lesson. Msg & data rates may apply; reply STOP to stop.')}
  ${actions(btn('Back', 'ghost', { icon: 'arrowL' }), btn('Create account', 'primary', { lg: true }))}`),
  `<div class="stack">${card(`${eyebrow('Signing up with')}<div class="found found--plain">${avatar('DW')}<div><div class="found__name">Coach Dana Whitfield</div><div class="found__sub mono">DANA-7K2Q</div></div></div>`)}${help('Signing up for your child?', 'Sign up as yourself. You add your child as a skater on the next step.')}</div>`),
  'Name and phone share a row, password rules tick off live, and the “who is it for” choice is one segmented control instead of three stacked buttons.');

const verify = (ctx, steps, idx, email, extra, aside) => wizard(ctx, steps, idx, card(`
  <div class="mailicon">${ic('mail', 26)}</div>
  <h1 class="h1 center">Check your email</h1><p class="lede center">We sent a 6-digit code to <b>${email}</b>.<br>It expires in 24 hours.</p>
  ${codeBoxes(['4', '8', '2', '9', '', ''])}
  ${btn('Verify email', 'primary', { block: true, lg: true, disabled: true })}
  <p class="fine center"><a class="link">Resend code</a> · <a class="link">Use a different email</a></p>${extra || ''}`, { cls: 'card--center' }), aside);
add('Family · Sign up', 'ClientVerify', '3 · Verify email', 1280, () => verify('Family sign up', FAM_STEPS, 2, 'grace.chen@example.com', '',
  help('Why a code?', 'It proves the email is yours before lesson reminders go there. Can’t find it? Check spam for “Your verification code” from BladeBook.')), 'Six real boxes (the original showed four), a centred focus, and the help text moved out of the way.');

add('Family · Sign up', 'ClientSkaters', '4 · Add skaters', 1280, () => wizard('Family sign up', FAM_STEPS, 3, card(`
  <h1 class="h1">Who’s skating?</h1><p class="lede">Add everyone who will take lessons with Coach Dana.</p>
  <div class="skater">${avatar('MC')}<div class="skater__text"><b>Mia Chen</b><small>Under 18 · your child</small></div>${btn('Edit', 'ghost', { sm: true, icon: 'pencil' })}</div>
  <div class="skater skater--edit">
    <div class="grid2 grid2--wide">${field('Skater’s full name', 'Leo Chen', { focus: true })}<div class="fieldset"><div class="label">Under 18?</div>${seg(['Yes', 'No'], 0)}</div></div>
    <div class="skater__actions">${btn('Cancel', 'ghost', { sm: true })}${btn('Add skater', 'secondary', { sm: true })}</div>
  </div>
  <button class="addrow">${ic('plus', 16)}Add another skater</button>
  ${actions(btn('Back', 'ghost', { icon: 'arrowL' }), btn('Send to Coach Dana', 'primary', { lg: true, iconR: 'arrowR' }))}`),
  help('What happens next', 'Coach Dana approves each skater before they can be booked. You can add more skaters later from your account.')), 'Skaters are proper list items with avatars; the inline add form is visually contained so you can tell what’s saved from what isn’t.');

add('Family · Sign up', 'ClientSkatersSelf', '4 · Skater — myself', 1280, () => wizard('Family sign up', FAM_STEPS, 3, card(`
  <h1 class="h1">You’re the skater</h1><p class="lede">Check your details — this is who Coach Dana will see.</p>
  <div class="skater">${avatar('JR')}<div class="skater__text"><b>Jordan Reyes ${badge('You', 'primary')}</b><small>Adult · from your account details</small></div>${btn('Edit', 'ghost', { sm: true, icon: 'pencil' })}</div>
  ${check('I’m 18 or older', true, 'If you’re under 18, a parent or guardian needs to sign up and add you as their skater.')}
  <p class="fine">Booking for someone else? <a class="link">Change who the lessons are for</a>.</p>
  ${actions(btn('Back', 'ghost', { icon: 'arrowL' }), btn('Send to Coach Dana', 'primary', { lg: true, iconR: 'arrowR' }))}`),
  help('Skating yourself', 'Reminders, confirmations and payment reminders all come to you. Coach Dana still approves you before you can book — usually within a day.')), 'Fixed the garbled copy in the original (“If youFamilies book…”) and made the age confirmation an explicit checkbox.');

add('Family · Sign up', 'ClientDone', '5 · Pending approval', 1280, () => wizard('Family sign up', FAM_STEPS, 4, card(`
  <div class="hero hero--success hero--stack"><span class="hero__icon">${ic('check', 26)}</span><div><h1 class="h1">You’re in</h1><p class="lede">Signed in as grace.chen@example.com. One thing left: Coach Dana’s approval.</p></div></div>
  <div class="listbox">
    ${row(`${avatar('MC', 'sm')}${rowTitle('Mia Chen', 'with Coach Dana Whitfield')}`, badge('Waiting for approval', 'warning', 'clock'))}
    ${row(`${avatar('LC', 'sm')}${rowTitle('Leo Chen', 'with Coach Dana Whitfield')}`, badge('Waiting for approval', 'warning', 'clock'))}
  </div>
  <p class="fine">We’ll email you as soon as Coach Dana approves. Booking opens for each skater once they’re approved.</p>
  ${btn('Go to my account', 'primary', { block: true, lg: true })}`),
  help('While you wait', 'Look around your account — booking stays closed until each skater is approved. Added the wrong skater? You can edit or remove them until then.')), 'Status is a badge per skater, not a paragraph; one clear next step.');

/* ===== Family · My bookings ===== */
const bookingsBody = () => `
  ${pageHead('My bookings', 'Lessons with Coach Dana Whitfield', btn('Book a lesson', 'primary', { icon: 'plus' }))}
  <div class="tabs"><span class="tabs__t is-on">Upcoming <b>14</b></span><span class="tabs__t">Past</span><span class="tabs__t">Cancelled</span></div>
  ${card(`
    ${row(`<span class="dateblock"><b>13</b><small>Oct</small></span>${rowTitle('Tue · 4:00 PM', `Mia · 30 min · $50`)}`, `${badge('Repeats', 'neutral', 'repeat')}${btn('Cancel', 'ghost', { sm: true })}`)}
    ${row(`<span class="dateblock"><b>20</b><small>Oct</small></span>${rowTitle('Tue · 4:00 PM', `Mia · 30 min · $50`)}`, `${badge('Repeats', 'neutral', 'repeat')}${btn('Cancel', 'ghost', { sm: true })}`)}
    ${row(`<span class="dateblock"><b>24</b><small>Oct</small></span>${rowTitle('Sat · 9:00 AM', `Noah · 60 min · $80`)}`, btn('Cancel', 'ghost', { sm: true }))}
  `, { title: 'Next up', pad: false })}
  ${card(row(`<span class="roundicon">${ic('repeat', 18)}</span>${rowTitle('Mia · Tuesdays 4:00 PM, every week', 'Until Dec 29 · 12 lessons left')}`, btn('Change', 'secondary', { sm: true })), { title: 'Repeating lessons', pad: false })}`;
add('Family · My bookings', 'ClientMyBookings', '1 · My bookings', 1280, () => familyApp('My bookings', bookingsBody()), 'Date blocks make the list scannable; repeating lessons are tagged inline so you know what a single cancel affects.');

add('Family · My bookings', 'ClientCancelConfirm', '2 · Cancel a lesson', 1280, () => familyApp('My bookings', bookingsBody(), {
  overlay: `<div class="scrim"></div><div class="dialog" role="dialog">
    <div class="dialog__icon dialog__icon--danger">${ic('calOff', 22)}</div>
    <h2 class="h2">Cancel Mia’s lesson?</h2>
    <div class="dialog__what"><b>Tue, Oct 13 · 4:00 PM</b><span>30 min · $50</span></div>
    ${banner('warning', 'Inside the 24-hour notice period', 'Dana may charge a late cancellation fee.')}
    <p class="fine">The time goes back on Dana’s calendar and Dana will be told, because it’s a late cancellation. Other lessons in this series aren’t affected.</p>
    <div class="dialog__actions">${btn('Keep lesson', 'secondary')}${btn('Cancel lesson', 'danger')}</div></div>`
}), 'A real modal over the list, keeping context. “Keep” is the safe default; the fee warning is promoted to a banner.');

add('Family · My bookings', 'ClientRecurrence', '3 · Change a repeating lesson', 1280, () => familyApp('My bookings', `
  ${pageHead('Mia · Tuesdays 4:00 PM', 'Every week until Dec 29. You can shorten this or make it less frequent — to add lessons, book again.', '', `<a class="link">${ic('arrowL', 14)} My bookings</a>`)}
  <div class="split split--even">
    ${card(`
      ${radioCard('End it earlier', 'Last lesson: Nov 24', false, 'calendar')}
      ${radioCard('Make it less frequent', `Every ${'<span class="inline-select">2 weeks ' + ic('chevD', 14) + '</span>'}`, true, 'repeat')}
      ${radioCard('Cancel all future lessons', 'Today’s lesson is kept', false, 'calOff')}`, { title: 'What do you want to change?' })}
    ${card(`
      <div class="timeline-list">
        ${[['Tue, Oct 13 · 4:00 PM', 'Kept — first lesson of the new pattern', 'keep'], ['Tue, Oct 20 · 4:00 PM', 'Cancelled', 'cut'], ['Tue, Oct 27 · 4:00 PM', 'Kept', 'keep'], ['Tue, Nov 3 · 4:00 PM', 'Cancelled', 'cut'], ['Tue, Nov 10 · 4:00 PM', 'Kept', 'keep'], ['Tue, Nov 17 · 4:00 PM', 'Cancelled', 'cut']].map(([d, s, k]) => `<div class="tli tli--${k}"><span class="tli__dot">${ic(k === 'keep' ? 'check' : 'x', 12)}</span><span class="tli__d">${d}</span><span class="tli__s">${s}</span></div>`).join('')}
      </div>
      ${banner('warning', '', 'Cancelled times are released — switching back to weekly won’t get these slots back.')}
      `, { title: 'What this will do', sub: '3 lessons cancelled · 3 families can book these times' })}
  </div>
  ${actions(btn('Back', 'secondary'), btn('Cancel 3 lessons', 'danger', { lg: true }))}`, { width: 'wide' }), 'Choice on the left, consequence on the right — every affected date is previewed as kept or cancelled before you commit.');

add('Family · My bookings', 'ClientBookingResubmit', '4 · Result after an error', 1280, () => familyApp('Book a lesson', `
  <div class="hero hero--success"><span class="hero__icon">${ic('check', 26)}</span><div><h1 class="h1">Fridays booked for Mia</h1><p class="lede">Your first attempt hit an error, so here’s everything as it stands now. Nothing was booked twice.</p></div></div>
  ${card(`
    ${row(`<span class="roundicon roundicon--ok">${ic('check', 16)}</span>${rowTitle('Fridays · 4:00 PM, every week', 'Booked just now')}`, '<b>12 lessons</b>')}
    ${row(`<span class="roundicon roundicon--ok">${ic('check', 16)}</span>${rowTitle('Mondays · 4:00 PM', 'Booked by your first attempt')}`, '<b>12 lessons</b>')}
    ${row(`<span class="roundicon roundicon--warn">${ic('x', 16)}</span>${rowTitle('Fri, Nov 27 · 4:00 PM', 'That time was taken or no longer exists')}`, btn('Pick another time', 'secondary', { sm: true }))}
  `, { title: 'Your lessons', pad: false })}
  ${card(`<div class="decide"><div>${rowTitle('You also have Wednesdays at 4:00 PM', 'Booked by your earlier attempt. Do you still want them?')}</div><div class="decide__btns">${btn('Cancel them', 'secondary')}${btn('Keep them', 'primary')}</div></div>`, { cls: 'card--attn' })}`), 'Reassurance first (“nothing was booked twice”), then a single decision card for the leftover Wednesdays.');

add('Family · My bookings', 'ClientNoTimesYet', '5 · Coach hasn’t posted times', 1280, () => familyApp('Book a lesson', `
  ${pageHead('Book a lesson', 'Coach Dana Whitfield', `<div class="picker"><span class="picker__label">Booking for</span><span class="picker__val">${avatar('MC', 'xs')}Mia Chen${ic('chevD', 16)}</span></div>`)}
  ${card(`
    <div class="calbar"><button class="iconbtn">${ic('chevL', 18)}</button><div class="calbar__title">October 2026</div><button class="iconbtn">${ic('chevR', 18)}</button></div>
    <div class="cal-wrap">${monthGrid(2026, 9, d => `<div class="cal__cell cal__cell--off"><span class="cal__num">${d}</span></div>`, { cls: 'cal--ghost' })}
      <div class="cal-empty"><span class="cal-empty__icon">${ic('calendar', 24)}</span><h2 class="h2">No lesson times yet</h2><p>Dana hasn’t posted any times. Check back soon.</p></div></div>`)}`, { width: 'wide' }), 'An empty calendar now has an empty state that says why, rather than a lone line of text.');

/* ===== Coach · Sign up ===== */
const coachSteps = (i) => i;
add('Coach · Sign up', 'CoachAccount', '1 · Account', 1280, () => wizard('Coach sign up', COACH_STEPS, 0, card(`
  <h1 class="h1">Start coaching on BladeBook</h1><p class="lede">Scheduling, lessons and payment reminders in one place.</p>
  ${field('Your name, as families will see it', 'Dana Whitfield', { hint: 'Shown on your booking page and in every email families get.' })}
  ${field('Login email', 'dana.whitfield@gmail.com', { hint: 'You’ll log in with this. Your daily report comes here.' })}
  ${field('Password', '•••••••••••', { focus: true })}
  ${pwRules()}
  ${btn('Create account', 'primary', { block: true, lg: true })}`),
  `<aside class="help"><div class="help__title">${ic('info', 16)}Setup takes four steps</div><ol class="numlist"><li>Create your account</li><li>Verify your login email with a code</li><li>How families reach and pay you</li><li>Confirm your business email <small>— skipped if it’s your login email</small></li></ol><div class="help__body">Then build your teaching week and share your coach code.</div></aside>`), 'Same wizard frame as family sign-up, so both sides of the product feel like one app.');

add('Coach · Sign up', 'CoachVerify', '2 · Verify login email', 1280, () => verify('Coach sign up', COACH_STEPS, 1, 'dana.whitfield@gmail.com', '',
  `<aside class="help"><div class="help__title">${ic('info', 16)}Two emails, maybe one</div><div class="help__body"><p><b>Login email</b> — private. You sign in with it; your daily report goes there. Verified now, with a code.</p><p><b>Business email</b> — the reply address families see. Same as login? Already verified. Different? It gets its own link.</p></div></aside>`), 'Identical verify pattern to families; the two-email explainer is structured rather than a wall of text.');

const bizForm = (same) => card(`
  <h1 class="h1">How families reach you</h1><p class="lede">You can change any of this later from your profile.</p>
  <div class="fieldset"><div class="label">Business email</div>
    ${seg(['Use my login email', 'Use a different email'], same ? 0 : 1, { block: true })}
    ${same ? `<div class="input input--readonly"><span class="input__val">dana.whitfield@gmail.com</span>${badge('Verified', 'success', 'check')}</div><div class="hint">Same as your login email — no extra check needed.</div>`
           : `<div class="input is-focus"><span class="input__val">lessons@danawhitfieldskating.com</span></div><div class="hint">We’ll send a confirmation link to this address.</div>`}
  </div>
  <div class="grid3">${field('Time zone', 'Central — Chicago', { select: true })}<div class="fieldset"><div class="label">Currency</div>${seg(['USD', 'CAD'], 0, { block: true })}</div>${field('Late-cancel notice', '24 hours', { select: true })}</div>
  ${field('How families pay you', 'Venmo @dana-whitfield-skates, or cash at the rink. Please pay within a week of the lesson.', { area: true, hint: 'Included in payment reminders. BladeBook doesn’t take payments itself.' })}
  ${btn(same ? 'Finish setup' : 'Save and continue', 'primary', { block: true, lg: true })}`);
const bizHelp = help('Why a business email?', 'It’s the only address families see. Emails go out as “Dana Whitfield via BladeBook” and replies come to you. Your login email stays private unless you choose it here.');
add('Coach · Sign up', 'CoachBusiness', '3 · Business details — different email', 1280, () => wizard('Coach sign up', COACH_STEPS, 2, bizForm(false), bizHelp), 'The same-vs-different email choice is an explicit toggle up front, so the confirmation step that follows is expected.');
add('Coach · Sign up', 'CoachBusinessSame', '3 · Business details — same email', 1280, () => wizard('Coach sign up', COACH_STEPS, 2, bizForm(true), bizHelp), 'Same layout, with a verified badge — and the button changes to “Finish setup” because step 4 is skipped.');

const codeCard = () => `<div class="codecard"><div><div class="codecard__label">Your coach code</div><div class="codecard__code">DANA-7K2Q</div><div class="codecard__sub">Families enter this to sign up with you.</div></div>${btn('Copy', 'secondary', { icon: 'copy' })}</div>`;
add('Coach · Sign up', 'CoachConfirm', '4 · Confirm business email', 1280, () => wizard('Coach sign up', COACH_STEPS, 3, card(`
  <div class="mailicon">${ic('mail', 26)}</div>
  <h1 class="h1 center">Confirm your business email</h1><p class="lede center">We sent a link (not a code) to<br><b>lessons@danawhitfieldskating.com</b></p>
  ${banner('info', 'Families can’t reach you until this is confirmed.', '')}
  <p class="fine center"><a class="link">Resend link</a> · <a class="link">Change address</a> · <a class="link">Use my login email instead</a></p>
  <hr class="hr">
  ${codeCard()}
  ${row(`<span class="roundicon">${ic('lock', 16)}</span>${rowTitle('Build your teaching week', 'Unlocks when your business email is confirmed')}`, '', { muted: true, cls: 'row--boxed' })}
  ${btn('Go to my dashboard', 'primary', { block: true, lg: true })}`, { cls: 'card--center' }),
  help('Why confirm this one?', 'A typo here would send every family’s replies to a stranger — and nobody would notice. Confirming proves the address is yours.')), 'Locked next step is shown as locked (with why), and the coach code is a hero element you can copy.');

add('Coach · Sign up', 'CoachAllSet', '4 · All set (same email)', 1280, () => wizard('Coach sign up', COACH_STEPS, 4, card(`
  <div class="hero hero--success hero--stack"><span class="hero__icon">${ic('check', 26)}</span><div><h1 class="h1">You’re all set</h1><p class="lede">Families will reach you at <b>dana.whitfield@gmail.com</b> — already verified.</p></div></div>
  ${codeCard()}
  <div class="nextup"><div>${eyebrow('Next up')}<div class="nextup__title">Build your teaching week</div><div class="nextup__sub">Set your blocks, lesson lengths and prices.</div></div>${btn('Start', 'primary', { lg: true, iconR: 'arrowR' })}</div>`),
  help('Want a different address later?', 'Change your business email any time from your profile. A new address gets a confirmation link before families see it.')), 'One celebratory moment, then the two things a new coach needs: the code to share and the next task.');

add('Coach · Sign up', 'CoachProfileEmail', 'Profile · business email', 1280, () => coachApp('Profile', `
  ${pageHead('Profile', 'How families see and reach you')}
  <div class="tabs"><span class="tabs__t is-on">Business email</span><span class="tabs__t">Visibility</span><span class="tabs__t">Payments</span><span class="tabs__t">Account</span></div>
  ${card(`
    ${radioCard('lessons@danawhitfieldskating.com', 'Current · confirmed', true, 'mail')}
    ${radioCard('dana.whitfield@gmail.com', 'Your login email · verified', false, 'mail')}
    <div class="rcard"><span class="rcard__icon">${ic('mail', 20)}</span><div class="rcard__text"><div class="rcard__title">dana@pelhamfsc.org</div><div class="rcard__sub">Confirmed</div></div><a class="link link--danger">Remove</a><span class="radio"></span></div>
    <button class="addrow">${ic('plus', 16)}Use a new address</button>`, { title: 'Business email', sub: 'The reply address on lesson reminders and other automatic emails. Replies come here.' })}
  ${actions('', btn('Cancel', 'secondary') + btn('Save', 'primary'))}`), 'Profile gets sub-tabs so business email, visibility and account settings live together.');

/* ===== Coach · Schedule creator ===== */
add('Coach · Schedule creator', 'SchedHabit', 'Your teaching week', 1360, () => {
  const am = ['6:00', '6:30', '7:00', '7:30', '8:00', '8:30', '9:00', '9:30', '10:00', '10:30', '11:00'];
  const col = (dow, on, slots, foot) => `<div class="wk__col${on ? '' : ' wk__col--off'}"><div class="wk__dow">${dow}</div>${on ? slots + `<div class="wk__foot">${foot}</div>` : `<div class="wk__none">${ic('ban', 16)}<span>No lessons</span></div>`}</div>`;
  const s = (t, cls = '') => `<span class="wslot ${cls}">${t}</span>`;
  const morning = (off = []) => `<div class="wk__tag">30 min · $50</div>` + am.map(t => s(t, off.includes(t) ? 'wslot--off' : '')).join('');
  return coachApp('Schedule', `
    ${pageHead('Your teaching week', 'Repeats every week — no dates, just the shape of your week.', badge('Live since Sept 2024 · edited Jun 11', 'success', 'refresh'), `<a class="link">${ic('arrowL', 14)} Schedule</a>`)}
    <div class="split split--sched">
      <div class="stack">
        ${card(`
          <div class="block"><span class="block__bar block__bar--other"></span><div class="block__text"><div class="block__name">Morning ice ${badge('Live', 'success')}</div><div class="block__meta">Mon · Wed · Fri · 6:00–11:30 AM · 30 min · $50</div></div><button class="iconbtn iconbtn--sm">${ic('more', 16)}</button></div>
          <div class="block is-editing"><span class="block__bar"></span><div class="block__text"><div class="block__name">Afternoon power hours ${badge('Editing', 'primary')}</div><div class="block__meta">Mon · 3:00–5:00 PM · 60 min · $80</div></div><button class="iconbtn iconbtn--sm">${ic('more', 16)}</button></div>
          <button class="addrow">${ic('plus', 16)}Add a block with a different length or price</button>`, { title: 'Blocks', sub: 'Each block has one lesson length and price.' })}
        ${card(`
          ${field('Name', 'Afternoon power hours', { optional: true })}
          <div class="grid2">${field('Starts', '3:00 PM', { select: true })}${field('Ends', '5:00 PM', { select: true })}</div>
          <div class="grid2">${field('Lesson length', '60 minutes', { select: true })}${field('Price per lesson', '80.00', { prefix: '$', suffix: 'USD' })}</div>
          <div class="fieldset"><div class="label">Days</div><div class="days">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => `<span class="day${i === 1 ? ' is-on' : ''}${[1, 3, 5].includes(i) ? ' has-other' : ''}">${d}</span>`).join('')}</div><div class="hint">Dot = Morning ice already runs that day.</div></div>
          ${banner('success', '', 'No clash on Monday — Morning ice ends 11:30 AM, this block starts 3:00 PM.')}`, { title: 'Edit block', action: `<span class="muted-sm">2 of 2</span>` })}
      </div>
      ${card(`
        <div class="wkbar">${seg(['All blocks', 'This block only'], 0)}<div class="legend"><span class="legend__item"><i class="sw sw--sel"></i>Editing</span><span class="legend__item"><i class="sw sw--open"></i>Other blocks</span><span class="legend__item"><i class="sw sw--offd"></i>Switched off</span></div></div>
        <div class="wk">
          ${col('Sun', false)}
          ${col('Mon', true, morning() + `<span class="wk__break">Break 11:30–3:00</span><div class="wk__tag wk__tag--edit">60 min · $80</div>` + s('3:00', 'wslot--edit wslot--60') + s('4:00', 'wslot--edit wslot--60'), '13 · $710')}
          ${col('Tue', false)}
          ${col('Wed', true, morning(), '11 · $550')}
          ${col('Thu', false)}
          ${col('Fri', true, morning(['10:00', '10:30']), '9 · $450')}
          ${col('Sat', false)}
        </div>
        <div class="wktotal"><span>Click a time to switch it off — an off slot is your break.</span><b>33 lessons a week · $1,710</b></div>`, { title: 'Every week, all blocks together' })}
    </div>
    <div class="stickybar">${btn('Back', 'secondary')}<span class="stickybar__note">Nothing is published until you review.</span>${btn('Review & publish', 'primary', { lg: true, iconR: 'arrowR' })}</div>`, { width: 'full' });
}, 'Kept the winning composite preview, but cleaned it up: one accent for “editing”, neutral chips for other blocks, dashed for off, and a fixed action bar.');

/* ===== Coach · Dashboard & time off ===== */
add('Coach · Dashboard & time off', 'CoachDashboard', '1 · Dashboard', 1280, () => coachApp('Schedule', `
  ${banner('success', 'Schedule saved. 6 families emailed.', '')}
  ${pageHead('Good morning, Dana', 'Tuesday, October 13')}
  <div class="stats">${stat('This week', '33 lessons', '$1,710 expected', 'calendar')}${stat('Unpaid', '$230', '4 lessons in Sep', 'card')}${stat('Waiting for approval', '2 skaters', 'Mia & Leo Chen', 'users')}</div>
  <div class="grid2">
    <div class="action-card action-card--primary"><span class="action-card__icon">${ic('repeat', 22)}</span><div class="action-card__title">Edit weekly schedule</div><div class="action-card__sub">Your normal week. Repeats until you change it.</div><div class="action-card__meta">Mon · Wed · Fri · 2 blocks ${ic('arrowR', 16)}</div></div>
    <div class="action-card"><span class="action-card__icon">${ic('calOff', 22)}</span><div class="action-card__title">Add time off or a special schedule</div><div class="action-card__sub">Vacation, a tournament, a camp or holiday hours — for a set range of dates.</div><div class="action-card__meta">Add dates ${ic('arrowR', 16)}</div></div>
  </div>
  ${card(`
    ${row(`<span class="roundicon roundicon--alt">${ic('spark', 16)}</span>${rowTitle('Summer camp week', 'Special schedule')}`, `<span class="muted">Sep 14 – 20</span>${btn('Edit', 'ghost', { sm: true })}`)}
    ${row(`<span class="roundicon">${ic('calOff', 16)}</span>${rowTitle('Thanksgiving break', 'No lessons')}`, `<span class="muted">Nov 22 – 28</span>${btn('Edit', 'ghost', { sm: true })}`)}
  `, { title: 'Time off and special schedules', pad: false })}`), 'A real dashboard: the save toast, three numbers a coach actually checks, then the two ways into the schedule.');

add('Coach · Dashboard & time off', 'CoachAwayChoose', '2 · Time off or special schedule?', 1280, () => coachApp('Schedule', `
  ${pageHead('Add dates', 'What’s different about these dates?', '', `<a class="link">${ic('arrowL', 14)} Schedule</a>`)}
  <div class="grid2">
    <div class="choice is-on"><span class="choice__icon">${ic('calOff', 24)}</span><div class="choice__title">No lessons</div><div class="choice__sub">Vacation, a tournament, an absence you know about in advance. Just a name and dates.</div><span class="radio is-on"></span></div>
    <div class="choice"><span class="choice__icon">${ic('spark', 24)}</span><div class="choice__title">Special schedule</div><div class="choice__sub">A camp or holiday hours — different times, lengths or prices for a set of dates.</div><span class="radio"></span></div>
  </div>
  ${banner('info', 'Sick today?', 'Use <a class="link">Cancel this day</a> on your week view instead. It cancels lessons without changing your schedule, and you choose whether slots can be rebooked.')}
  ${actions(btn('Back', 'secondary'), btn('Continue', 'primary', { iconR: 'arrowR' }))}`), 'Two large, equal choices with a clear selection state and a proper Continue.');

const timeOff = (err) => coachApp('Schedule', `
  ${pageHead('Time off', 'Every date in this range becomes a day with no lessons. Families can’t book them.', '', `<a class="link">${ic('arrowL', 14)} Add dates</a>`)}
  ${card(`
    ${field('Name', err ? 'Family visit' : 'Labor Day weekend', { optional: true })}
    <div class="grid2">
      ${field('First day off', err ? 'Mon, Nov 23, 2026' : 'Mon, Sep 7, 2026', { lead: 'calendar', error: err })}
      ${field('Last day off', err ? 'Tue, Nov 24, 2026' : 'Tue, Sep 8, 2026', { lead: 'calendar', error: err })}
    </div>
    ${err ? banner('danger', 'These dates overlap Thanksgiving break (Nov 22 – 28)', 'Edit <a class="link">Thanksgiving break</a> to change those days, or choose dates outside it.')
          : banner('warning', '1 booked lesson will be cancelled', 'You’ll see exactly which one on the next step — nothing changes until you accept.')}
  `)}
  ${actions(btn('Back', 'secondary'), btn('Review changes', 'primary', { iconR: 'arrowR', disabled: err }))}`);
add('Coach · Dashboard & time off', 'CoachTimeOff', '3 · Time off — name & dates', 1280, () => timeOff(false), 'Impact is surfaced early as a warning, with the promise that nothing happens until review.');
add('Coach · Dashboard & time off', 'CoachTimeOffOverlap', '3 · Time off — overlap', 1280, () => timeOff(true), 'Fields themselves go into an error state and Continue is disabled, so the problem can’t be skimmed past.');

add('Coach · Dashboard & time off', 'CoachScheduleReview', '4 · Review changes', 1280, () => coachApp('Schedule', `
  ${pageHead('Review your changes', 'Weekly schedule · repeats every week until you change it', '', `<a class="link">${ic('arrowL', 14)} Edit week</a>`)}
  <div class="impact">${stat('Cancelled', '1 lesson')}${stat('Repriced', '4 lessons')}${stat('Families emailed', '3')}</div>
  <div class="alertcard">
    <div class="alertcard__head">${ic('alert', 20)}<div><div class="alertcard__title">Check this price — it’s a big change</div><div class="alertcard__body">Morning ice drops from <b>$50</b> to <b>$5</b> — a 90% cut. If it’s a typo, families get emailed twice: once for the mistake, once for the fix.</div></div></div>
    ${check('I’ve checked the new price', false)}
  </div>
  ${card(row(`${avatar('MC', 'sm')}${rowTitle('Mia C.', 'Wed, Sep 2 · 6:30 AM')}`, badge('Cancelled', 'danger')), { title: '1 lesson will be cancelled', sub: 'The family is emailed with a link to book another time.', pad: false })}
  ${card(`
    ${row(`${avatar('LM', 'sm')}${rowTitle('Leo M.', 'Fri, Sep 4 · 10:00 AM')}`, '<span class="delta"><s>$50</s>' + ic('arrowR', 14) + '<b>$5</b></span>')}
    ${row(`${avatar('MC', 'sm')}${rowTitle('Mia C.', 'Mon, Sep 7 · 6:00 AM')}`, '<span class="delta"><s>$50</s>' + ic('arrowR', 14) + '<b>$5</b></span>')}
    ${row(`${avatar('MC', 'sm')}${rowTitle('Mia C.', 'Mon, Sep 21 · 6:00 AM')}`, '<span class="delta"><s>$50</s>' + ic('arrowR', 14) + '<b>$5</b></span>')}
    ${row(`${avatar('EA', 'sm')}${rowTitle('Ella A.', 'Mon, Sep 28 · 7:00 AM')}`, '<span class="delta"><s>$50</s>' + ic('arrowR', 14) + '<b>$5</b></span>')}
    <div class="card__note">Families will be told: “Good news — some lessons are now cheaper.”</div>`, { title: '4 upcoming lessons will change price', pad: false })}
  ${help('Your 24-hour notice period', 'A price increase never reaches a lesson in the next 24 hours. A decrease, like this one, applies to every upcoming lesson.')}
  <div class="stickybar">${btn('Back', 'secondary')}<span class="stickybar__note">Nothing changes until you accept.</span>${btn('Accept & email 3 families', 'primary', { lg: true, disabled: true })}</div>`), 'Impact summary up top, one strong alert with its checkbox, then itemised consequences; the accept button names its side-effect.');

add('Coach · Dashboard & time off', 'CoachChangeStatus', '5 · After saving — needs attention', 1280, () => coachApp('Schedule', `
  ${pageHead('Your schedule')}
  ${banner('danger', 'We’re having trouble applying this change', 'We’ve been alerted, and your families haven’t been notified yet.')}
  ${card(`
    ${row(`${avatar('NC', 'sm')}${rowTitle('Noah C.', 'Mon, Sep 14 · 6:30 AM')}`, badge('Family not told', 'warning'))}
    <div class="card__note">The family wasn’t told and may have come to the rink. You can waive this on <a class="link">Payments</a> and contact the family directly.</div>`, { title: 'Due to be cancelled, but its time passed first', pad: false })}
  ${card(`
    <ol class="progress">
      <li class="is-done"><span class="progress__dot">${ic('check', 12)}</span><div><b>Straight after Accept</b><small>Applying your changes to 14 lessons…</small></div></li>
      <li class="is-done"><span class="progress__dot">${ic('check', 12)}</span><div><b>Then</b><small>Changes applied. Emailing 6 families…</small></div></li>
      <li><span class="progress__dot"></span><div><b>Finally</b><small>Done — 6 families emailed.</small></div></li>
    </ol>`, { title: 'What you’ll see normally' })}`), 'Status is a stepper, not three loose lines, and the one lesson needing action links straight to where you fix it.');

/* ===== Coach · Week, payments & lessons ===== */
const weekGrid = (opts = {}) => {
  const L = (t, n, st = '') => `<div class="wl${st ? ' wl--' + st : ''}"><span class="wl__t">${t}</span><span class="wl__n">${n}</span></div>`;
  const d = [['Sun', 11, [], 'past'], ['Mon', 12, [L('6:00', 'Mia C.', 'past'), L('6:30', 'Open', 'past open'), L('7:00', 'Ella A.', 'past')], 'past'], ['Tue', 13, [], 'today'], ['Wed', 14, [L('6:00', 'Sam R.'), L('6:30', 'Mia C.'), L('7:00', 'Held', 'held')]], ['Thu', 15, []], ['Fri', 16, [L('6:00', 'Leo M.'), L('6:30', 'Open', 'open'), L('7:00', 'Noah C.')]], ['Sat', 17, []]];
  return `<div class="week">${d.map(([dw, n, ls, st]) => `<div class="week__col${st ? ' week__col--' + st : ''}"><div class="week__head"><span>${dw}</span><b>${n}</b>${st === 'today' ? '<em>Today</em>' : ''}</div><div class="week__body">${ls.length ? ls.join('') : '<div class="week__empty">No lessons</div>'}</div>${ls.length && st !== 'past' ? `<button class="week__cancel">Cancel day</button>` : ''}</div>`).join('')}</div>`;
};
add('Coach · Week, payments & lessons', 'CoachWeekView', '1 · Week view', 1280, () => coachApp('Schedule', `
  ${pageHead('Week of Oct 11', 'Past lessons are greyed and can’t be cancelled.', `<div class="btngroup"><button class="iconbtn">${ic('chevL', 18)}</button>${btn('Today', 'secondary', { sm: true })}<button class="iconbtn">${ic('chevR', 18)}</button></div>${btn('Cancel rest of week', 'danger-outline', { icon: 'calOff' })}`)}
  ${card(weekGrid(), { pad: false })}
  <div class="legend"><span class="legend__item"><i class="sw sw--booked"></i>Booked</span><span class="legend__item"><i class="sw sw--open"></i>Open</span><span class="legend__item"><i class="sw sw--held"></i>Held</span><span class="legend__item"><i class="sw sw--off"></i>Past</span></div>`, { width: 'wide' }), 'A proper calendar week with today marked; “Cancel day” sits on each day, “Cancel rest of week” is a page action. (Set “today” to Tuesday so Wednesday’s lessons are actually cancellable — the original said Wednesday afternoon.)');

add('Coach · Week, payments & lessons', 'CoachCancelPreview', '2 · Cancel preview', 1280, () => coachApp('Schedule', `
  ${pageHead('Cancel 4 lessons, Wed 14 – Sat 17', 'For each lesson, choose whether the time can be rebooked.', '', `<a class="link">${ic('arrowL', 14)} Week of Oct 11</a>`)}
  ${card(`
    <div class="tablehead"><span>Lesson</span><span>After cancelling</span></div>
    ${[['SR', 'Sam R.', 'Wed 14 · 6:00 AM', 0], ['MC', 'Mia C.', 'Wed 14 · 6:30 AM', 1], ['LM', 'Leo M.', 'Fri 16 · 6:00 AM', 0], ['NC', 'Noah C.', 'Fri 16 · 7:00 AM', 0]].map(([a, n, t, h]) => row(`${avatar(a, 'sm')}${rowTitle(n, t)}`, seg(['Release for rebooking', 'Hold — keep closed'], h))).join('')}
    <div class="card__note">${ic('alert', 14)} A held slot stays unbookable — this can’t be undone.</div>`, { pad: false, title: 'Lessons', action: `<a class="link">Release all</a>` })}
  <div class="stickybar">${btn('Back', 'secondary')}<span class="stickybar__note">4 families will be emailed with a link to book another time.</span>${btn('Cancel 4 lessons', 'danger', { lg: true })}</div>`), 'Release/Hold gets descriptive labels and a bulk “Release all”; the irreversibility note is attached to the choice it applies to.');

add('Coach · Week, payments & lessons', 'CoachPayments', '3 · Payments', 1280, () => coachApp('Payments', `
  ${pageHead('Payments', 'Track who’s paid. BladeBook doesn’t take payments — you mark them here.')}
  <div class="filters">${field('From', 'Sep 1, 2026', { lead: 'calendar' })}${field('To', 'Sep 30, 2026', { lead: 'calendar' })}${seg(['Unpaid', 'All'], 0)}</div>
  <div class="stats">${stat('Unpaid', '$230', '4 lessons')}${stat('No-shows', '1', '$50 unpaid')}${stat('Not recorded', '1', 'Check attendance')}</div>
  ${card(`
    <table class="table"><thead><tr><th>Skater</th><th>Lesson</th><th>Attendance</th><th class="r">Amount</th><th class="r"></th></tr></thead><tbody>
    ${[['MC', 'Mia C.', 'Wed, Sep 2 · 6:30 AM', ['Attended', 'success'], 50], ['LM', 'Leo M.', 'Fri, Sep 4 · 10:00 AM', ['No-show', 'danger'], 50], ['EA', 'Ella A.', 'Mon, Sep 7 · 7:00 AM', ['Not recorded', 'warning'], 50], ['PR', 'Priya R.', 'Mon, Sep 7 · 3:00 PM', ['Attended', 'success'], 80]].map(([a, n, t, [s, v], p]) => `<tr><td><span class="cellname">${avatar(a, 'sm')}${n}</span></td><td>${t}</td><td>${badge(s, v)}</td><td class="r money">$${p}</td><td class="r"><span class="cellbtns">${btn('Waive', 'ghost', { sm: true })}${btn('Mark paid', 'secondary', { sm: true, icon: 'check' })}</span></td></tr>`).join('')}
    </tbody></table>
    <div class="card__note">${ic('info', 14)} No-shows show the full lesson price until you mark them paid or waived. Lessons in another currency are listed separately and never added together.</div>`, { pad: false })}`, { width: 'wide' }), 'A real table with a totals row up top; the date range is pre-filled to the current month instead of an empty list.');

add('Coach · Week, payments & lessons', 'CoachLessonList', '4 · Lesson list — attendance', 1280, () => coachApp('Lessons', `
  ${pageHead('Lessons', 'Correct anything recorded at the rink. Corrections happen here, never in the rinkside app.')}
  <div class="filters">${field('From', 'Sep 14, 2026', { lead: 'calendar' })}${field('To', 'Sep 20, 2026', { lead: 'calendar' })}</div>
  ${card(`
    ${row(`${avatar('NC', 'sm')}${rowTitle('Noah C.', 'Mon, Sep 14 · 6:30 AM')}`, seg(['Attended', 'No-show'], 0))}
    ${row(`${avatar('PR', 'sm')}${rowTitle('Priya R.', 'Mon, Sep 14 · 3:00 PM')}`, seg(['Attended', 'No-show'], 0))}
    ${row(`${avatar('SR', 'sm')}${rowTitle('Sam R.', 'Mon, Sep 14 · 9:00 AM')}`, seg(['Attended', 'No-show'], 1))}
    ${row(`${avatar('EA', 'sm')}${rowTitle('Ella A. ' + badge('Not recorded', 'warning'), 'Wed, Sep 16 · 7:00 AM')}`, seg(['Attended', 'No-show'], -1), { cls: 'row--attn' })}
    <div class="card__note">${ic('info', 14)} Ella’s lesson has no attendance — the rinkside app may still be holding it, or nobody recorded it.</div>`, { pad: false })}`), 'Lessons sorted by time (the original listed 3 PM before Wednesday), and the unrecorded lesson is flagged on its own row.');

add('Coach · Week, payments & lessons', 'CoachProfileVisibility', '5 · Profile — visibility & texts', 1280, () => coachApp('Profile', `
  ${pageHead('Profile', 'How families see and reach you')}
  <div class="tabs"><span class="tabs__t">Business email</span><span class="tabs__t is-on">Visibility</span><span class="tabs__t">Payments</span><span class="tabs__t">Account</span></div>
  ${card(`
    ${toggle('Phone number', true, '(205) 555-0142')}
    ${toggle('Email address', true, 'lessons@danawhitfieldskating.com')}
    ${toggle('Cash', true, 'Families can pay you in cash at the rink.')}
    ${toggle('Venmo', true, '@dana-skates')}
    ${toggle('Cash App', false, 'Off. $danaskates is kept; switching it back on asks you to check it.')}
    ${toggle('PayPal', false, 'Add your handle, then switch it on.')}
    <div class="card__note">${ic('info', 14)} Payment instructions always appear in payment-reminder emails, and replies always reach your business email — whichever of these are on.</div>`, { title: 'What families can see', sub: 'Only families you’ve confirmed — never someone who has only entered your coach code.', pad: false })}
  ${card(`
    ${toggle('Text me when a family cancels', false, 'To (205) 555-0142. Msg & data rates may apply. Reply STOP to stop.')}
    <div class="smsprev"><div class="smsprev__label">Example</div><div class="smsprev__bubble">BladeBook: Mia R. cancelled Tue 14 Oct 4:00pm. See email.</div></div>`, { title: 'Texts to you', pad: false })}
  ${actions('', btn('Cancel', 'secondary') + btn('Save', 'primary'))}`), 'Switches instead of checkboxes for on/off settings, and the SMS example is shown as an actual message bubble.');

/* ===== Rinkside app ===== */
add('Rinkside app', 'RinkToday', '1 · Today’s lessons', 390, () => phone(`
  ${rinkLesson('Sam R.', '6:00', 'present', { at: '6:02 AM' })}
  ${rinkLesson('Mia C.', '6:30', 'open', { cls: 'rl--now' })}
  ${rinkLesson('Noah C.', '7:00')}
  ${rinkLesson('Leo M.', '7:30')}
  ${rinkLesson('Priya R.', '8:00')}
  <p class="phone__hint">Tap a name for the family’s contact details.</p>`, { progress: [1, 5, 'Next: Mia C. 6:30'] }), 'Big Present / No-show buttons for gloved hands; destructive Cancel moved behind “…” so it can’t be hit by accident. A progress bar shows how much of the morning is recorded.');

add('Rinkside app', 'RinkOffline', '2 · No signal', 390, () => phone(`
  <div class="pbanner pbanner--warn">${ic('wifiOff', 18)}<div><b>No signal</b><span>2 check-ins saved on this phone. They’ll send automatically.</span></div></div>
  ${rinkLesson('Sam R.', '6:00', 'present', { at: '6:02 AM', saved: true })}
  ${rinkLesson('Mia C.', '6:30', 'noshow', { saved: true })}
  ${rinkLesson('Noah C.', '7:00', 'open', { offline: true })}
  <p class="phone__hint">${ic('lock', 13)} Cancelling and contact details need a connection.</p>`, { offline: true, progress: [2, 5, 'Saved, not sent'] }), 'Offline state is one banner plus a per-lesson “saved on phone” chip; unavailable actions are disabled rather than repeated as errors.');

add('Rinkside app', 'RinkNotLoaded', '3 · Haven’t loaded', 390, () => phone(`
  <div class="pempty"><span class="pempty__icon">${ic('wifiOff', 28)}</span><h2 class="h2">Today’s lessons haven’t loaded</h2><p>Open the app with signal before you leave for the rink, and they’ll be saved for offline use.</p>${btn('Try again', 'primary', { block: true, lg: true, icon: 'refresh' })}</div>`, { offline: true }), 'Empty state with an icon, explanation and one big retry.');

add('Rinkside app', 'RinkCancelConfirm', '4 · Cancel one lesson', 390, () => phone(`
  ${rinkLesson('Mia C.', '6:30')}
  ${rinkLesson('Noah C.', '7:00')}
  ${rinkLesson('Leo M.', '7:30')}`, {
  overlay: `<div class="scrim"></div><div class="sheet"><span class="sheet__grab"></span><h2 class="h2">Cancel Noah C. · 7:00 AM?</h2><p class="fine">The family will be emailed. This can’t be undone.</p>
    <div class="fieldset"><div class="label">After cancelling</div>${seg(['Release the slot', 'Hold it'], 0, { block: true })}</div>
    ${btn('Cancel lesson', 'danger', { block: true, lg: true })}${btn('Keep lesson', 'secondary', { block: true, lg: true })}</div>`
}), 'Native-feeling bottom sheet; the destructive button is full-width but paired with an equally large “Keep”.');

add('Rinkside app', 'RinkCouldntSend', '5 · Couldn’t be sent', 390, () => phone(`
  <div class="pbanner pbanner--danger">${ic('alert', 18)}<div><b>2 check-ins couldn’t be sent</b><span>The phone’s clock didn’t match the lesson time.</span></div></div>
  <article class="rl rl--issue"><div class="rl__head"><span class="rl__name">Leo M.</span></div><div class="rl__meta">Mon, Oct 12 · 7:30 AM<br>Recorded <b>Present</b> at 3:12 AM</div><div class="rl__btns">${btn('Record on website', 'secondary', { sm: true })}${btn('Dismiss', 'ghost', { sm: true })}</div></article>
  <article class="rl rl--issue"><div class="rl__head"><span class="rl__name">Ella A.</span>${badge('Removed tomorrow', 'warning')}</div><div class="rl__meta">Fri, Oct 9 · 6:00 AM<br>Recorded <b>No-show</b> at 11:48 PM</div><div class="rl__btns">${btn('Record on website', 'secondary', { sm: true })}${btn('Dismiss', 'ghost', { sm: true })}</div></article>`), 'Each failed check-in is its own card with the two possible actions; expiry is a badge, not a sentence.');

add('Rinkside app', 'RinkFamilyCancelled', '6 · Family had cancelled', 390, () => phone(`
  <article class="rl rl--cancelled"><div class="rl__head"><span class="rl__time">7:00</span><span class="rl__name"><s>Noah C.</s></span>${badge('Cancelled', 'neutral')}</div><div class="rl__meta">The family cancelled at 6:50 AM, after you recorded it — your phone had no signal, so it hadn’t reached you. Nothing more to do.</div></article>
  ${rinkLesson('Leo M.', '7:30', 'open', { cls: 'rl--now' })}
  ${rinkLesson('Priya R.', '8:00')}`, { progress: [3, 5, 'Next: Leo M. 7:30'] }), 'The cancelled lesson stays in place (struck through) so the coach’s mental model of the morning isn’t disturbed.');

window.BB_SCREENS = S;
