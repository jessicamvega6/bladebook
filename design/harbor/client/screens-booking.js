/* Client website — booking and My bookings.
   FeatureDecriptions/Bookings: and cancelation.md; ADR-006 d3, d4, d4a, d4b; ADR-009 d4; ADR-015 d1a; §7 privacy.
   Registers SCREENS book / book-times / book-result / bookings / recurrence, MODALS bkConfirm / bkCancel,
   ACTIONS bk*, and the 'Book a lesson' and 'My bookings' PRESETS.
   A family sees only open versus taken; who holds a taken time is never shown. Their own lessons show as theirs. */

const BK_MONTHS = ['2026-10', '2026-11', '2026-12'];          // the booking page shows three months (UI limit only)
const bkUi = () => (state.ui.book ??= { sid: null, month: BK_MONTHS[0], day: null, week: false, sel: [], repeat: false, every: 1, until: '', result: null, lastReq: null, noSchedule: false });
const bkState = () => (state.ui.bk ??= { arr: {}, rec: null, who: 'all', all: false, seq: 0 });
const bkKid = () => { const u = bkUi(), kids = myActiveKids(); if (!u.sid || !kids.some(k => k.id === u.sid)) u.sid = kids[0] && kids[0].id; return student(u.sid); };
const bkOpen = iso => bkUi().noSchedule ? [] : openSlots(iso);
const bkHasSchedule = iso => !bkUi().noSchedule && slotsOn(iso).length > 0;
const bkMinutesUntil = (iso, t) => Math.round((parseIso(iso) - parseIso(TODAY)) / 864e5) * 1440 + t - NOW_MIN;
const bkInsideNotice = l => { const m = bkMinutesUntil(l.iso, l.t); return m > 0 && m < NOTICE_H * 60; };
const bkEveryLabel = n => n === 1 ? 'every week' : `every ${n} weeks`;
const bkWeeksBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / (7 * 864e5));
const bkMonthLabel = ym => { const [y, m] = ym.split('-').map(Number); return `${MON_LONG[m - 1]} ${y}`; };
const bkShortMonth = ym => MON[Number(ym.split('-')[1]) - 1];

/* Waiting families never see the booking pages (ADR-022 d6). */
const bkPendingGate = () => shell(card(`<div class="pempty"><span class="pempty__icon">${ic('lock', 22)}</span><b>Booking opens once Coach ${esc(coachFirst())} approves</b><span class="muted">Until then you can see your own account and skaters. We’ll email you as soon as you’re approved.</span>${B('Back to home', 'secondary', '', { href: href('home') })}</div>`));

/* ---------- skater picker ---------- */
function bkPicker() {
  const kids = myActiveKids(), k = bkKid();
  if (kids.length < 2) return `<div class="picker"><span class="picker__label">Booking for</span><span class="picker__val">${avatar(initials(k.name), 'xs')}${esc(k.name)}</span></div>`;
  return `<div class="picker"><span class="picker__label">Booking for</span>${SEG(kids.map(x => esc(firstName(x.name))), kids.findIndex(x => x.id === k.id), 'bkKid')}</div>`;
}

/* ================= 1 · Pick a day ================= */
SCREENS.book = () => {
  if (isPendingFamily()) return bkPendingGate();
  const u = bkUi(), k = bkKid(), [y, m] = u.month.split('-').map(Number);
  const first = `${u.month}-01`, days = new Date(y, m, 0).getDate();
  const totalOpen = Array.from({ length: days }, (_, i) => bkOpen(`${u.month}-${String(i + 1).padStart(2, '0')}`).length).reduce((a, b) => a + b, 0);
  const anySchedule = BK_MONTHS.some(ym => { const [yy, mm] = ym.split('-').map(Number); for (let d = 1; d <= new Date(yy, mm, 0).getDate(); d++) if (bkHasSchedule(`${ym}-${String(d).padStart(2, '0')}`)) return true; return false; });
  const mi = BK_MONTHS.indexOf(u.month);
  const cell = d => {
    const iso = `${u.month}-${String(d).padStart(2, '0')}`, n = bkOpen(iso).length;
    const mine = myLessons().filter(l => l.iso === iso && l.sid === k.id).length;
    const tag = specialOn(iso) && specialOn(iso).kind === 'timeoff' ? '<span class="bk-calnote">No lessons</span>' : '';
    if (!n) return `<div class="cal__cell cal__cell--off${iso === TODAY ? ' bk-today' : ''}"><span class="cal__num">${d}</span>${mine ? `<span class="bk-calmine">${ic('check', 11)}${esc(firstName(k.name))}</span>` : tag}</div>`;
    return `<button type="button" class="cal__cell cal__cell--open${iso === TODAY ? ' bk-today' : ''}"${actAttr('bkDay', [iso])} aria-label="${dLong(iso)}, ${n} open times"><span class="cal__num">${d}</span><span class="bk-cellfoot">${mine ? `<span class="bk-calmine">${ic('check', 11)}${esc(firstName(k.name))}</span>` : ''}<span class="cal__meta">${n} open</span></span></button>`;
  };
  // Week links on the left, one per calendar row (FeatureDecriptions/Bookings:).
  const firstDow = parseIso(first).getDay(), rows = Math.ceil((firstDow + days) / 7);
  const weeks = Array.from({ length: rows }, (_, r) => {
    const sun = addDays(first, r * 7 - firstDow), sat = addDays(sun, 6);
    let open = 0; for (let i = 0; i < 7; i++) open += bkOpen(addDays(sun, i)).length;
    return open ? `<button type="button" class="bk-week"${actAttr('bkWeek', [sun])}><b>Week ${r + 1}</b><span>${dShort(sun)} – ${dShort(sat)}</span></button>` : `<div class="bk-week bk-week--off"><b>Week ${r + 1}</b><span>Nothing open</span></div>`;
  }).join('');
  const calbar = `<div class="calbar"><button type="button" class="iconbtn" aria-label="Previous month"${mi > 0 ? actAttr('bkMonth', [BK_MONTHS[mi - 1]]) : ' disabled'}>${ic('chevL', 18)}</button><div class="calbar__title">${bkMonthLabel(u.month)}</div><button type="button" class="iconbtn" aria-label="Next month"${mi < BK_MONTHS.length - 1 ? actAttr('bkMonth', [BK_MONTHS[mi + 1]]) : ' disabled'}>${ic('chevR', 18)}</button></div>`;
  if (!anySchedule) return shell(`
    ${pageHead('Book a lesson', `Coach ${esc(coachName())}`, bkPicker())}
    ${card(`${calbar}<div class="cal-wrap">${monthGrid(y, m - 1, d => `<div class="cal__cell cal__cell--off"><span class="cal__num">${d}</span></div>`, { cls: 'cal--ghost' })}
      <div class="cal-empty"><span class="cal-empty__icon">${ic('calendar', 24)}</span><h2 class="h2">No lesson times yet</h2><p>${esc(coachFirst())} hasn’t posted any times. We’ll email you as soon as booking opens.</p>${B('Email me when times appear', 'secondary', 'bkNotify', { icon: 'mail' })}</div></div>`)}`, { width: 'wide' });
  return shell(`
    ${pageHead('Book a lesson', `Pick a day to see Coach ${esc(coachFirst())}’s open times for ${esc(firstName(k.name))}.`, bkPicker())}
    <div class="split split--cal bk-split">
      ${card(`${calbar}
        <div class="bk-scroll"><div class="bk-calgrid"><div class="bk-weeks"><div class="bk-weeks__h">Jump to</div>${weeks}</div>${monthGrid(y, m - 1, cell)}</div></div>
        <div class="legend"><span class="legend__item"><i class="sw sw--open"></i>Open times</span><span class="legend__item"><i class="sw sw--off"></i>Nothing open</span><span class="legend__item">${ic('check', 12)}${esc(firstName(k.name))} has a lesson</span><span class="legend__note">${plural(totalOpen, 'open time')} in ${MON_LONG[m - 1]}</span></div>`)}
      <div class="stack">
        ${card(`<div class="bk-months">${BK_MONTHS.map(ym => { let n = 0; const [yy, mm] = ym.split('-').map(Number); for (let d = 1; d <= new Date(yy, mm, 0).getDate(); d++) n += bkOpen(`${ym}-${String(d).padStart(2, '0')}`).length; return `<button type="button" class="bk-month${ym === u.month ? ' is-on' : ''}"${actAttr('bkMonth', [ym])}><b>${MON_LONG[mm - 1]}</b><span>${plural(n, 'open time')}</span></button>`; }).join('')}</div>`, { title: 'Months' })}
        ${help('Booking window', 'You can see three months ahead. A repeating booking can run past that: you set the end date when you book.')}
      </div>
    </div>`, { width: 'wide' });
};

/* ================= 2 · Pick your times ================= */
function bkSlotState(iso, s, k) {
  const u = bkUi();
  const own = myLessonAt(iso, s.t);
  if (own) return { st: 'yours', who: student(own.sid) };
  if (lessonsOn(iso).some(l => l.t === s.t)) return { st: 'taken' };
  if (iso < TODAY || (iso === TODAY && s.t <= NOW_MIN)) return { st: 'past' };
  if (u.sel.some(x => x.iso === iso && x.t === s.t)) return { st: 'sel' };
  return { st: 'open' };
}
function bkSlot(iso, s, k) {
  const { st, who } = bkSlotState(iso, s, k), end = fmtT(s.t + s.len).replace(' AM', '').replace(' PM', '');
  const price = priceFor(k.id, s);
  const label = st === 'yours' ? `${esc(firstName(who.name))}’s lesson` : st === 'taken' ? 'Taken' : st === 'past' ? 'Past' : money(price);
  const cls = `slot slot--${s.len} ${st === 'sel' ? 'slot--mine' : st === 'taken' || st === 'past' ? 'slot--taken' : st === 'yours' ? 'slot--taken bk-yours' : 'slot--open'}`;
  const inner = `<span class="slot__time">${fmtT(s.t)}<small> – ${end}</small></span><span class="slot__len">${s.len} min</span><span class="slot__price">${label}</span><span class="slot__mark">${st === 'sel' ? ic('check', 14) : st === 'yours' ? ic('check', 12) : ''}</span>`;
  if (st === 'open' || st === 'sel') return `<button type="button" class="${cls}"${actAttr('bkToggle', [iso, s.t])} aria-pressed="${st === 'sel'}">${inner}</button>`;
  return `<div class="${cls}">${inner}</div>`;
}
SCREENS['book-times'] = () => {
  if (isPendingFamily()) return bkPendingGate();
  const u = bkUi(), k = bkKid(), iso = u.day || TODAY, sun = weekStart(iso);
  const strip = `<div class="daystrip bk-strip"><button type="button" class="iconbtn" aria-label="Previous week"${actAttr('bkDay', [addDays(iso, -7)])}>${ic('chevL', 18)}</button>${Array.from({ length: 7 }, (_, i) => {
    const d = addDays(sun, i), n = bkOpen(d).length, c = u.sel.filter(x => x.iso === d).length, on = d === iso;
    const s = !bkHasSchedule(d) ? 'No ice' : n ? `${n} open` : 'Full';
    return `<button type="button" class="dchip${on ? ' dchip--sel' : !n ? ' dchip--off' : c ? ' dchip--has' : ''}"${actAttr('bkDay', [d])}><span class="dchip__dow">${DOW[dowOf(d)]}</span><span class="dchip__n">${parseIso(d).getDate()}</span><span class="dchip__s">${s}</span>${c ? `<span class="dchip__count">${c}</span>` : ''}</button>`;
  }).join('')}<button type="button" class="iconbtn" aria-label="Next week"${actAttr('bkDay', [addDays(iso, 7)])}>${ic('chevR', 18)}</button></div>`;
  const slots = slotsOn(iso), sp = specialOn(iso);
  const groups = []; for (const s of slots) { const g = groups[groups.length - 1]; if (g && g.block === s.block) g.slots.push(s); else groups.push({ block: s.block, slots: [s] }); }
  const body = !bkHasSchedule(iso)
    ? `<div class="pempty"><span class="pempty__icon">${ic('calOff', 22)}</span><b>${sp && sp.kind === 'timeoff' ? `${esc(coachFirst())} is away (${esc(sp.name)})` : `No lessons on ${DOW_LONG[dowOf(iso)]}s`}</b><span class="muted">Pick another day above.</span></div>`
    : `${sp ? banner('info', esc(sp.name), `Special hours from ${dShort(sp.sd)} to ${dShort(sp.ed)}.`) : ''}<div class="tl">${groups.map((g, gi) => {
        const prev = groups[gi - 1], gap = prev ? `<div class="tl__gap">${ic('ban', 14)}Not on the ice ${fmtT(prev.slots[prev.slots.length - 1].t + prev.slots[0].len)} – ${fmtT(g.slots[0].t)}</div>` : '';
        const p = priceFor(k.id, g.slots[0]);
        return `<div class="tl__sec"><div class="tl__label">${esc(g.block)} <span>${g.slots[0].len} min · ${money(p)}</span></div>${gap}<div class="tl__col">${g.slots.map(s => bkSlot(iso, s, k)).join('')}</div></div>`;
      }).join('')}</div>
      <div class="legend"><span class="legend__item"><i class="sw sw--open"></i>Open</span><span class="legend__item"><i class="sw sw--sel"></i>Your pick</span><span class="legend__item"><i class="sw sw--taken"></i>Taken</span><span class="legend__item"><i class="sw bk-sw-yours"></i>Your family’s lesson</span><span class="legend__note">Taller = longer lesson</span></div>`;
  const picks = u.sel.slice().sort((a, b) => (a.iso + String(a.t).padStart(4, '0')).localeCompare(b.iso + String(b.t).padStart(4, '0')));
  const total = picks.reduce((s, x) => s + x.price, 0), mins = picks.reduce((s, x) => s + x.len, 0);
  const n = bkOpen(iso).length, all = slotsOn(iso).length;
  return shell(`
    ${pageHead(u.week ? `Week of ${dShort(sun)}` : dLong(iso), u.week ? `${dLong(iso)} · ${plural(n, 'open time')} · pick times on any day this week` : bkHasSchedule(iso) ? `${n} of ${all} times still open · picks are kept as you move between days` : 'No lesson times on this day', bkPicker(), crumb('book', MON_LONG[parseIso(iso).getMonth()]))}
    ${strip}
    <div class="split split--tl">
      ${card(body, { title: 'Open times', sub: 'Tap an open time to add it. Tap it again to remove it.' })}
      <div class="stack sticky">
        ${card(picks.length ? `
          <div class="picks">${picks.map(x => `<div class="pick"><div class="pick__when"><b>${DOW[dowOf(x.iso)]} ${parseIso(x.iso).getDate()} · ${fmtT(x.t)}</b><small>${x.len} min</small></div><span class="pick__price">${money(x.price)}</span><button type="button" class="iconbtn iconbtn--sm" aria-label="Remove"${actAttr('bkToggle', [x.iso, x.t])}>${ic('x', 14)}</button></div>`).join('')}</div>
          <div class="total"><span>${plural(picks.length, 'lesson')} · ${mins >= 60 ? `${Math.floor(mins / 60)} hr${mins % 60 ? ' ' + (mins % 60) + ' min' : ''}` : mins + ' min'}</span><span class="total__v">${money(total)}</span></div>
          ${B('Continue', 'primary', 'bkContinue', { block: true, lg: true, iconR: 'arrowR' })}
          <p class="fine">You can make these repeat on the next step.</p>`
          : `<p class="fine">No times picked yet.</p>${B('Continue', 'primary', '', { block: true, lg: true, iconR: 'arrowR', disabled: true })}`, { title: 'Your picks', sub: `For ${esc(k.name)}` })}
      </div>
    </div>`, { width: 'wide' });
};

/* ================= 3 · Confirm & repeat (pop-up) ================= */
/** Every date a request would book: each pick, repeated every N weeks up to the end date when Repeat is on. */
function bkOccurrences(u) {
  const out = [];
  for (const x of u.sel) {
    if (!u.repeat) { out.push({ ...x, series: `${x.iso}|${x.t}` }); continue; }
    for (let d = x.iso; d <= u.until; d = addDays(d, 7 * u.every)) out.push({ ...x, iso: d, series: `${dowOf(x.iso)}|${x.t}` });
  }
  return out;
}
const bkMaxUntil = u => { const f = u.sel.map(x => x.iso).sort()[0] || TODAY; return addDays(f, 365); };
const bkUntilError = u => !u.repeat ? '' : !u.until ? 'Pick an end date.' : u.until < (u.sel.map(x => x.iso).sort()[0] || TODAY) ? 'The end date is before your first lesson.' : u.until > bkMaxUntil(u) ? 'A repeating booking can run up to 12 months.' : '';
MODALS.bkConfirm = () => {
  const u = bkUi(), k = bkKid(), occ = bkOccurrences(u), err = bkUntilError(u);
  const picks = u.sel.slice().sort((a, b) => (a.iso + String(a.t).padStart(4, '0')).localeCompare(b.iso + String(b.t).padStart(4, '0')));
  const first = picks.reduce((s, x) => s + x.price, 0), all = occ.reduce((s, x) => s + x.price, 0);
  const dis = !u.repeat ? ' disabled' : '';
  return `<div class="dialog__icon">${ic('calendar', 22)}</div>
    <h2 class="h2">Book for ${esc(firstName(k.name))}</h2>
    <p class="fine">With Coach ${esc(coachName())}.</p>
    <div class="bk-dlist">${picks.map(x => row(`<span class="dateblock"><b>${parseIso(x.iso).getDate()}</b><small>${MON[parseIso(x.iso).getMonth()]}</small></span>${rowTitle(`${DOW_LONG[dowOf(x.iso)]} · ${fmtT(x.t)}`, `${x.len} minutes`)}`, `<span class="money">${money(x.price)}</span>`)).join('')}</div>
    ${CHK('Repeat these lessons', u.repeat, 'bkRepeat', [], 'Every time you picked repeats on the same day of the week.')}
    <div class="grid2">
      <div class="field"><label class="label" for="bk-every">Repeats</label><select id="bk-every" class="ctl" data-bind="ui.book.every" data-num="1"${dis}>${[1, 2, 3, 4].map(n => `<option value="${n}"${n === u.every ? ' selected' : ''}>${n === 1 ? 'Every week' : `Every ${n} weeks`}</option>`).join('')}</select></div>
      <div class="field${err ? ' field--error' : ''}"><label class="label" for="bk-until">Until</label><input id="bk-until" class="ctl${err ? ' is-error' : ''}" type="date" value="${u.until}" max="${bkMaxUntil(u)}" data-bind="ui.book.until" data-live="1"${dis}><div class="hint${err ? ' hint--error' : ''}">${err ? ic('alert', 14) + err : 'Starts three months out. Up to 12 months.'}</div></div>
    </div>
    <div class="summary"><div>${kv('Lessons', u.repeat ? `${plural(occ.length, 'lesson')} until ${dShort(u.until)}` : plural(occ.length, 'lesson'))}${kv(u.repeat ? 'First week' : 'Total', `<b>${money(first)}</b>`)}${u.repeat ? kv('All lessons', money(all)) : ''}</div><div class="summary__note">${ic('info', 14)}You pay ${esc(coachFirst())} directly. BladeBook only sends reminders.</div></div>
    <div class="dialog__actions">${B('Back', 'secondary', 'closeModal')}${B(`Book ${plural(occ.length, 'lesson')}`, 'primary', 'bkBook', { disabled: !!err || !occ.length })}</div>`;
};

/* ================= 4 · Result ================= */
SCREENS['book-result'] = () => {
  if (isPendingFamily()) return bkPendingGate();
  const r = bkUi().result;
  if (!r) return shell(card(`<div class="pempty"><b>Nothing booked yet</b>${B('Book a lesson', 'primary', '', { href: href('book') })}</div>`));
  const k = student(r.sid), booked = r.items.filter(x => x.res === 'booked'), mine = r.items.filter(x => x.res === 'mine'), skipped = r.items.filter(x => x.res === 'skipped');
  const resubmit = mine.length > 0;
  const series = r.series.map(sr => {
    const its = r.items.filter(x => x.series === sr.key), b = its.filter(x => x.res === 'booked').length, mn = its.filter(x => x.res === 'mine').length, sk = its.filter(x => x.res === 'skipped').length;
    const pct = its.length ? Math.round((b + mn) / its.length * 100) : 0;
    return card(`<div class="series"><div class="series__title">${ic(sr.repeat ? 'repeat' : 'calendar', 16)}${sr.title}</div><div class="series__sub">${sr.sub}</div><div class="meter meter--ok"><span style="width:${pct}%"></span></div><div class="series__foot"><b>${b ? `${b} booked` : 'None new'}${mn ? ` · ${mn} already yours` : ''}</b><span>${sk ? `${sk} unavailable` : 'All dates'}</span></div></div>`);
  }).join('');
  const heroTitle = resubmit ? `${esc(firstName(k.name))}’s lessons, as they stand now` : booked.length ? `${plural(booked.length, 'lesson')} booked for ${esc(firstName(k.name))}` : `Nothing new was booked for ${esc(firstName(k.name))}`;
  const heroSub = resubmit ? 'Some of these times were already booked for ' + esc(firstName(k.name)) + ', so nothing was booked twice.' + (booked.length ? ' A confirmation email is on its way for the new ones.' : '')
    : `${booked.length ? 'A confirmation email is on its way. ' : ''}${skipped.length ? `${plural(skipped.length, 'date')} couldn’t be booked${booked.length ? '. Everything else is confirmed.' : '.'}` : ''}`;
  return shell(`
    <div class="hero ${booked.length || resubmit ? 'hero--success' : 'bk-hero--warn'}"><span class="hero__icon">${ic(booked.length || resubmit ? 'check' : 'alert', 26)}</span><div><h1 class="h1">${heroTitle}</h1><p class="lede">${heroSub}</p></div></div>
    <div class="grid2 bk-series">${series}</div>
    ${mine.length ? card(mine.slice(0, 6).map(x => row(`<span class="roundicon roundicon--ok">${ic('check', 16)}</span>${rowTitle(`${dDow(x.iso)} · ${fmtT(x.t)}`, `Already booked for ${esc(firstName(k.name))}`)}`, `<span class="muted">${x.len} min</span>`)).join('') + (mine.length > 6 ? `<div class="card__note">and ${plural(mine.length - 6, 'more date')} already booked for ${esc(firstName(k.name))}</div>` : ''),
      { title: `Already booked for ${esc(firstName(k.name))}`, sub: 'From an earlier booking. They weren’t booked again.', pad: false }) : ''}
    ${skipped.length ? card(skipped.map(x => row(`<span class="roundicon roundicon--warn">${ic('x', 16)}</span>${rowTitle(`${dDow(x.iso)} · ${fmtT(x.t)}`, x.why)}`, B('Pick another time', 'secondary', 'bkPickDay', { sm: true, args: [x.iso] }))).join(''),
      { title: `${plural(skipped.length, 'date')} need${skipped.length === 1 ? 's' : ''} another time`, sub: 'Or leave them. The rest of your bookings are confirmed.', pad: false }) : ''}
    ${r.dropped && r.dropped.length ? r.dropped.map(dp => card(`<div class="decide"><div>${rowTitle(`You also have ${DOW_LONG[dp.dow]}s at ${fmtT(dp.t)} booked`, `From your earlier attempt (${plural(dp.count, 'lesson')}). Do you still want them?`)}</div><div class="decide__btns">${B('Cancel them', 'secondary', 'bkDroppedCancel', { args: [dp.key] })}${B('Keep them', 'primary', 'bkDroppedKeep', { args: [dp.key] })}</div></div>`, { cls: 'card--attn' })).join('') : ''}
    <div class="actions"><div>${B('Book more', 'secondary', '', { href: href('book') })}</div><div class="actions__r">${B('View my bookings', 'primary', '', { href: href('bookings') })}</div></div>`);
};

/* ================= My bookings ================= */
const bkKey = l => l.recurrenceId || (l.recurring ? `${l.sid}-${dowOf(l.iso)}-${l.t}` : null);
function bkArrangements() {
  const groups = {};
  for (const l of myLessons()) { const k = bkKey(l); if (k) (groups[k] ??= []).push(l); }
  return Object.entries(groups).map(([key, ls]) => {
    ls.sort((a, b) => a.iso.localeCompare(b.iso));
    const meta = bkState().arr[key] || {}, up = ls.filter(l => !isStarted(l)), future = ls.filter(l => l.iso > TODAY);
    return { key, sid: ls[0].sid, dow: dowOf(ls[0].iso), t: ls[0].t, len: ls[0].len, price: ls[0].price, interval: meta.interval || 1, end: meta.end || ls[ls.length - 1].iso, lessons: ls, up, future, ended: !!meta.ended };
  }).filter(a => a.up.length && !a.ended).sort((a, b) => (a.sid + a.dow + a.t).localeCompare(b.sid + b.dow + b.t));
}
SCREENS.bookings = () => {
  if (isPendingFamily()) return bkPendingGate();
  const b = bkState(), kids = myActiveKids();
  const whoIdx = b.who === 'all' ? 0 : kids.findIndex(k => k.id === b.who) + 1;
  const upAll = myLessons().filter(l => !isStarted(l) && (b.who === 'all' || l.sid === b.who)).sort((x, y) => (x.iso + String(x.t).padStart(4, '0')).localeCompare(y.iso + String(y.t).padStart(4, '0')));
  const up = b.all ? upAll : upAll.slice(0, 10);
  const recent = myLessons().filter(l => isPast(l) && (b.who === 'all' || l.sid === b.who)).sort((x, y) => y.iso.localeCompare(x.iso) || y.t - x.t).slice(0, 4);
  const arrs = bkArrangements().filter(a => b.who === 'all' || a.sid === b.who);
  const lrow = l => { const k = student(l.sid), rec = bkKey(l) ? bkArrangements().find(a => a.key === bkKey(l)) : null;
    return row(`<span class="dateblock"><b>${parseIso(l.iso).getDate()}</b><small>${MON[parseIso(l.iso).getMonth()]}</small></span>${rowTitle(`${DOW[dowOf(l.iso)]} · ${fmtT(l.t)}${l.iso === TODAY ? ' ' + badge('Today', 'primary') : ''}`, `${esc(firstName(k.name))} · ${l.len} min · ${money(l.price)}`)}`,
      `${rec ? badge(rec.interval === 1 ? 'Repeats weekly' : `Every ${rec.interval} weeks`, 'neutral', 'repeat') : ''}${B('Cancel', 'ghost', 'bkCancelOpen', { sm: true, args: [l.id] })}`); };
  return shell(`
    ${pageHead('My bookings', `Lessons with Coach ${esc(coachName())}`, B('Book a lesson', 'primary', '', { href: href('book'), icon: 'plus' }))}
    ${kids.length > 1 ? `<div class="bk-filter">${SEG(['Everyone', ...kids.map(k => esc(firstName(k.name)))], whoIdx, 'bkWho')}</div>` : ''}
    ${card(up.length ? up.map(lrow).join('') + (upAll.length > 10 ? `<div class="card__foot">${B(b.all ? 'Show fewer' : `Show all ${upAll.length}`, 'secondary', 'bkShowAll', { sm: true })}</div>` : '')
      : `<div class="pempty"><span class="pempty__icon">${ic('calendar', 22)}</span><b>Nothing booked</b><span class="muted">Book a time with Coach ${esc(coachFirst())}.</span>${B('Book a lesson', 'primary', '', { href: href('book') })}</div>`,
      { title: 'Upcoming', sub: up.length ? `${plural(upAll.length, 'lesson')}. Cancelling one doesn’t change the rest of its series.` : '', pad: false })}
    ${arrs.length ? card(arrs.map(a => { const k = student(a.sid); return row(`<span class="roundicon">${ic('repeat', 18)}</span>${rowTitle(`${esc(firstName(k.name))} · ${DOW_LONG[a.dow]}s ${fmtT(a.t)}, ${bkEveryLabel(a.interval)}`, `Until ${dShort(a.end)} · ${plural(a.up.length, 'lesson')} left`)}`, B('Change', 'secondary', 'bkRecOpen', { sm: true, args: [a.key] })); }).join(''),
      { title: 'Repeating lessons', sub: 'Shorten a series, make it less frequent, or stop it. To add lessons, book again.', pad: false }) : ''}
    ${recent.length ? card(recent.map(l => row(`<span class="dateblock bk-dateblock--past"><b>${parseIso(l.iso).getDate()}</b><small>${MON[parseIso(l.iso).getMonth()]}</small></span>${rowTitle(`${DOW[dowOf(l.iso)]} · ${fmtT(l.t)}`, `${esc(firstName(student(l.sid).name))} · ${l.len} min · ${money(l.price)}`)}`, statusOf(l) === 'NOT_RECORDED' ? '' : statusBadge(l), { muted: true })).join(''), { title: 'Recent', pad: false }) : ''}`);
};

MODALS.bkCancel = m => {
  const l = state.lessons.find(x => x.id === m.id), k = student(l.sid), late = bkInsideNotice(l), rec = bkKey(l);
  return `<div class="dialog__icon dialog__icon--danger">${ic('calOff', 22)}</div>
    <h2 class="h2">Cancel ${esc(firstName(k.name))}’s lesson?</h2>
    <div class="dialog__what"><b>${dDow(l.iso)} · ${fmtT(l.t)}</b><span>${l.len} min · ${money(l.price)}</span></div>
    ${late ? banner('warning', `Inside the ${NOTICE_H}-hour notice period`, `${esc(coachFirst())} may charge a late cancellation fee.`) : `<p class="fine">Cancelling within ${NOTICE_H} hours of a lesson may incur a late cancellation fee.</p>`}
    <p class="fine">The time goes back on ${esc(coachFirst())}’s calendar and ${esc(coachFirst())} will be told.${rec ? ' Other lessons in this series aren’t affected.' : ''}</p>
    <div class="dialog__actions">${B('Keep lesson', 'secondary', 'closeModal')}${B('Cancel lesson', 'danger', 'bkCancel')}</div>`;
};

/* ================= Change a repeating lesson ================= */
function bkRecPlan(a, r) {
  // "Future" excludes today's lesson (cancelation.md); a lesson today is always kept.
  const fut = a.lessons.filter(l => l.iso > TODAY);
  if (r.mode === 0) return fut.map(l => ({ l, cut: !!r.end && l.iso > r.end }));
  if (r.mode === 1) { const anchor = fut[0] && fut[0].iso; return fut.map(l => ({ l, cut: bkWeeksBetween(anchor, l.iso) % r.interval !== 0 })); }
  return fut.map(l => ({ l, cut: true }));
}
const bkRecError = (a, r) => r.mode === 0 ? (!r.end ? 'Pick a new last date.' : r.end >= a.end ? `Pick a date before ${dShort(a.end)}. To add lessons, book again.` : r.end < TODAY ? 'Pick a date from today on.' : '')
  : r.mode === 1 ? (r.interval <= a.interval ? 'Pick a less frequent option.' : '') : '';
SCREENS.recurrence = () => {
  if (isPendingFamily()) return bkPendingGate();
  const b = bkState(), a = bkArrangements().find(x => x.key === (b.rec && b.rec.key));
  if (!a) return shell(card(`<div class="pempty"><b>That repeating lesson has ended</b>${B('Back to my bookings', 'secondary', '', { href: href('bookings') })}</div>`));
  const r = b.rec, k = student(a.sid), plan = bkRecPlan(a, r), cut = plan.filter(p => p.cut), err = bkRecError(a, r), late = cut.some(p => bkInsideNotice(p.l));
  const opt = (i, icon, title, sub, extra = '') => `<div class="bk-opt"><button type="button" class="rcard${r.mode === i ? ' is-on' : ''}"${actAttr('bkRecMode', [i])} aria-pressed="${r.mode === i}"><span class="rcard__icon">${ic(icon, 20)}</span><span class="rcard__text"><span class="rcard__title">${title}</span><span class="rcard__sub">${sub}</span></span><span class="radio${r.mode === i ? ' is-on' : ''}"></span></button>${r.mode === i ? extra : ''}</div>`;
  const shown = plan.slice(0, 10);
  return shell(`
    ${pageHead(`${esc(firstName(k.name))} · ${DOW_LONG[a.dow]}s ${fmtT(a.t)}`, `${bkEveryLabel(a.interval)[0].toUpperCase() + bkEveryLabel(a.interval).slice(1)} until ${dShort(a.end)}. You can shorten this or make it less frequent. To add lessons, book again.`, '', crumb('bookings', 'My bookings'))}
    <div class="split split--even">
      ${card(`
        ${opt(0, 'calendar', 'End it earlier', `Last lesson now: ${dShort(a.end)}`, `<div class="bk-optfield">${INP('bk-rec-end', 'New last date', 'ui.bk.rec.end', { type: 'date', live: true, error: err })}</div>`)}
        ${opt(1, 'repeat', 'Make it less frequent', a.interval >= 4 ? 'Already every 4 weeks, the least often' : `Now ${bkEveryLabel(a.interval)}`, a.interval >= 4 ? '' : `<div class="bk-optfield">${SEL('bk-rec-int', 'Repeats', 'ui.bk.rec.interval', [1, 2, 3, 4].filter(n => n > a.interval).map(n => [n, `Every ${n} weeks`]), { num: true })}</div>`)}
        ${opt(2, 'calOff', 'Cancel all future lessons', a.lessons.some(l => l.iso === TODAY && !isStarted(l)) ? 'Today’s lesson is kept' : `${plural(plan.length, 'lesson')} from tomorrow on`)}`, { title: 'What do you want to change?' })}
      ${card(`
        ${shown.length ? `<div class="timeline-list">${shown.map(p => `<div class="tli tli--${p.cut ? 'cut' : 'keep'}"><span class="tli__dot">${ic(p.cut ? 'x' : 'check', 12)}</span><span class="tli__d">${dDow(p.l.iso)} · ${fmtT(p.l.t)}</span><span class="tli__s">${p.cut ? 'Cancelled' : 'Kept'}</span></div>`).join('')}</div>${plan.length > shown.length ? `<p class="fine">and ${plural(plan.length - shown.length, 'more lesson')}: ${plural(plan.slice(10).filter(p => p.cut).length, 'cancelled', 'cancelled')}</p>` : ''}` : '<p class="fine">No lessons after today.</p>'}
        ${late ? banner('warning', `Inside the ${NOTICE_H}-hour notice period`, `One of these is less than ${NOTICE_H} hours away. ${esc(coachFirst())} may charge a late cancellation fee for it.`) : ''}
        ${cut.length ? banner('warning', '', 'Cancelled times are released for other families. Switching back won’t get them back.') : ''}`,
        { title: 'What this will do', sub: err ? 'Fix the choice on the left to see the result.' : `${plural(cut.length, 'lesson')} cancelled · ${plural(plan.length - cut.length, 'lesson')} kept` })}
    </div>
    <div class="actions"><div>${B('Back', 'secondary', '', { href: href('bookings') })}</div><div class="actions__r">${B(cut.length ? `Cancel ${plural(cut.length, 'lesson')}` : 'Nothing to cancel', 'danger', 'bkRecApply', { lg: true, disabled: !!err || !cut.length })}</div></div>`, { width: 'wide' });
};

/* ================= actions ================= */
const bkSortSel = u => u.sel.sort((a, b) => (a.iso + String(a.t).padStart(4, '0')).localeCompare(b.iso + String(b.t).padStart(4, '0')));
Object.assign(ACTIONS, {
  bkKid(i) { const u = bkUi(); u.sid = myActiveKids()[i].id; u.sel = []; },
  bkMonth(ym) { bkUi().month = ym; },
  bkDay(iso) { const u = bkUi(); u.day = iso; u.week = false; if (BK_MONTHS.includes(iso.slice(0, 7))) u.month = iso.slice(0, 7); go('book-times'); },
  bkPickDay(iso) { ACTIONS.bkDay(iso); },
  bkWeek(sun) { const u = bkUi(); let d = sun; for (let i = 0; i < 7; i++) if (bkOpen(addDays(sun, i)).length) { d = addDays(sun, i); break; } u.day = d; u.week = true; go('book-times'); },
  bkToggle(iso, t) {
    const u = bkUi(), k = bkKid(), i = u.sel.findIndex(x => x.iso === iso && x.t === t);
    if (i >= 0) { u.sel.splice(i, 1); return; }
    const s = slotsOn(iso).find(x => x.t === t); if (!s || bkSlotState(iso, s, k).st !== 'open') return;
    u.sel.push({ iso, t, len: s.len, price: priceFor(k.id, s) }); bkSortSel(u);
  },
  bkContinue() { const u = bkUi(); if (!u.sel.length) return; if (!u.until) u.until = addDays(u.sel[0].iso, 91); state.modal = { kind: 'bkConfirm' }; },
  bkRepeat() { const u = bkUi(); u.repeat = !u.repeat; if (u.repeat && !u.until) u.until = addDays(u.sel[0].iso, 91); },
  bkNotify() { state.flash = `We’ll email ${state.me.email} when Coach ${coachFirst()} posts times.`; },
  /** Book every occurrence. A taken or vanished time is skipped and reported; a time already held by this skater is recognised, never booked twice (ADR-006 d4b). */
  bkBook() {
    const u = bkUi(), b = bkState(), k = bkKid();
    if (bkUntilError(u) || !u.sel.length) return;
    const series = [], items = [], seriesRid = {};
    for (const x of u.sel) {
      const key = u.repeat ? `${dowOf(x.iso)}|${x.t}` : `${x.iso}|${x.t}`;
      if (series.some(s => s.key === key)) continue;
      const rid = u.repeat ? `r${++b.seq}` : null; seriesRid[key] = rid;
      if (rid) b.arr[rid] = { interval: u.every, end: u.until };
      series.push({ key, repeat: u.repeat, dow: dowOf(x.iso), t: x.t, rid,
        title: u.repeat ? `${DOW_LONG[dowOf(x.iso)]}s · ${fmtT(x.t)}` : `${dDow(x.iso)} · ${fmtT(x.t)}`,
        sub: u.repeat ? `${x.len} min · ${money(x.price)} · ${bkEveryLabel(u.every)}, ${dShort(x.iso)} – ${dShort(u.until)}` : `${x.len} min · ${money(x.price)}` });
    }
    let n = state.lessons.length;
    for (const o of bkOccurrences(u)) {
      const it = { iso: o.iso, t: o.t, len: o.len, series: u.repeat ? o.series : `${o.iso}|${o.t}` };
      const own = myLessonAt(o.iso, o.t);
      const slot = slotsOn(o.iso).find(s => s.t === o.t && s.len === o.len);
      if (own && own.sid === k.id) it.res = 'mine';
      else if (!slot) { it.res = 'skipped'; it.why = specialOn(o.iso) && specialOn(o.iso).kind === 'timeoff' ? `${coachFirst()} is away (${specialOn(o.iso).name}).` : 'That time no longer exists on the schedule.'; }
      else if (lessonsOn(o.iso).some(l => l.t === o.t)) { it.res = 'skipped'; it.why = 'That time was taken.'; }
      else {
        it.res = 'booked';
        state.lessons.push({ id: 'k' + (++n), sid: k.id, iso: o.iso, t: o.t, len: o.len, price: priceFor(k.id, slot), status: 'BOOKED', pay: 'UNPAID', recurring: u.repeat, recurrenceId: seriesRid[it.series] || null });
      }
      items.push(it);
    }
    state.lessons.sort((a, c) => (a.iso + String(a.t).padStart(4, '0')).localeCompare(c.iso + String(c.t).padStart(4, '0')));
    // A resubmission that leaves out a series the earlier request held: ask, never guess (ADR-006 d4b, decision 4).
    const dropped = [];
    if (items.some(i => i.res === 'mine') && u.lastReq && u.lastReq.sid === k.id) {
      for (const p of u.lastReq.series) {
        if (series.some(s => s.repeat && s.dow === p.dow && s.t === p.t)) continue;
        const left = myLessons().filter(l => l.sid === k.id && l.recurrenceId === p.rid && !isStarted(l));
        if (left.length) dropped.push({ key: p.rid, dow: p.dow, t: p.t, count: left.length });
      }
    }
    u.result = { sid: k.id, series, items, dropped };
    u.lastReq = { sid: k.id, series: series.filter(s => s.repeat).map(s => ({ dow: s.dow, t: s.t, rid: s.rid })) };
    // Keep the earlier attempt's recurrence ids for series the resubmission recognised, so a later drop still finds them.
    for (const p of u.lastReq.series) { const hit = myLessons().find(l => l.sid === k.id && dowOf(l.iso) === p.dow && l.t === p.t && l.recurrenceId); if (hit) p.rid = hit.recurrenceId; }
    u.sel = []; u.repeat = false; u.until = ''; u.every = 1;
    state.modal = null; go('book-result');
  },
  bkDroppedKeep(key) { const r = bkUi().result; r.dropped = r.dropped.filter(d => d.key !== key); state.flash = 'Kept. Those lessons stay booked.'; },
  bkDroppedCancel(key) {
    const r = bkUi().result, d = r.dropped.find(x => x.key === key);
    const cut = myLessons().filter(l => l.recurrenceId === key && l.iso > TODAY);
    state.lessons = state.lessons.filter(l => !cut.includes(l));
    bkState().arr[key] = { ...(bkState().arr[key] || {}), ended: true };
    r.dropped = r.dropped.filter(x => x.key !== key);
    state.flash = `${plural(cut.length, 'lesson')} on ${DOW_LONG[d.dow]}s at ${fmtT(d.t)} cancelled. Coach ${coachFirst()} has been told.`;
  },
  bkWho(i) { const b = bkState(); b.who = i === 0 ? 'all' : myActiveKids()[i - 1].id; b.all = false; },
  bkShowAll() { const b = bkState(); b.all = !b.all; },
  bkCancelOpen(id) { state.modal = { kind: 'bkCancel', id }; },
  bkCancel() {
    const l = state.lessons.find(x => x.id === state.modal.id), k = student(l.sid);
    state.lessons = state.lessons.filter(x => x !== l);
    state.modal = null; state.flash = `${firstName(k.name)}’s lesson on ${dDow(l.iso)} at ${fmtT(l.t)} is cancelled. Coach ${coachFirst()} has been told.`;
  },
  bkRecOpen(key) { const a = bkArrangements().find(x => x.key === key); bkState().rec = { key, mode: 1, end: '', interval: Math.min(4, a.interval + 1) }; if (a.interval >= 4) bkState().rec.mode = 0; go('recurrence'); },
  bkRecMode(i) { bkState().rec.mode = i; },
  bkRecApply() {
    const b = bkState(), r = b.rec, a = bkArrangements().find(x => x.key === r.key);
    if (!a || bkRecError(a, r)) return;
    const cut = bkRecPlan(a, r).filter(p => p.cut).map(p => p.l), k = student(a.sid);
    state.lessons = state.lessons.filter(l => !cut.includes(l));
    const meta = b.arr[r.key] ||= {};
    if (r.mode === 0) meta.end = r.end; else if (r.mode === 1) meta.interval = r.interval; else meta.ended = true;
    if (r.mode !== 0 && !meta.end) meta.end = a.end;
    b.rec = null;
    go('bookings');
    state.flash = `${firstName(k.name)}’s ${DOW_LONG[a.dow]} lessons: ${plural(cut.length, 'lesson')} cancelled. ${r.mode === 2 ? 'The series has stopped.' : r.mode === 1 ? `Now every ${r.interval} weeks.` : `Last lesson ${dShort(r.end)}.`} Coach ${coachFirst()} has been told.`;
  },
});

/* ================= presets ================= */
const bkSel = (st, sid, list) => { const u = bkUi(); Object.assign(u, { sid, month: list[0][0].slice(0, 7), day: list[0][0], week: false, sel: [], repeat: false, every: 1, until: '' }); for (const [iso, t] of list) ACTIONS.bkToggle(iso, t); };
/** Stage a request directly, the way a resubmitted request arrives: times already held by this skater included. */
const bkStage = (sid, list) => { const u = bkUi(); u.sid = sid; u.sel = list.map(([iso, t]) => { const s = slotsOn(iso).find(x => x.t === t); return { iso, t, len: s.len, price: priceFor(sid, s) }; }); };
PRESETS.push(
  { id: 'ClientBookCalendar', file: 'book-calendar', group: 'Book a lesson', title: '1 · Pick a day', note: 'Redesigned from Forest Main: October with open-time counts per day, week links on the left, the three bookable months, and a skater switch.', setup: st => { st.screen = 'book'; } },
  { id: 'ClientBookNoTimes', file: 'book-no-times', group: 'Book a lesson', title: '1 · Coach hasn’t posted times', note: 'Redesigned from Forest ClientNoTimesYet: the same page when the coach has no schedule yet, with a ghost calendar and an email-me action.', setup: st => { st.screen = 'book'; st.ui.book = { month: '2026-10', sel: [], noSchedule: true }; } },
  { id: 'ClientBookTimes', file: 'book-times', group: 'Book a lesson', title: '2 · Pick your times', note: 'Redesigned from Forest Timeline: Monday, Oct 19 as a measured timeline, two times picked for Mia; taken times say only “Taken”, the family’s own lessons are named.', setup: st => { st.screen = 'book-times'; bkSel(st, 's1', [['2026-10-19', 570], ['2026-10-19', 960]]); } },
  { id: 'ClientBookConfirm', file: 'book-confirm', group: 'Book a lesson', title: '3 · Confirm & repeat', note: 'Redesigned from Forest Recurring: the pop-up with Repeat ticked, every week until Jan 18, and the lesson count on the button.', setup: st => { st.screen = 'book-times'; bkSel(st, 's1', [['2026-10-19', 570], ['2026-10-19', 960]]); Object.assign(st.ui.book, { repeat: true, every: 1, until: '2027-01-18' }); st.modal = { kind: 'bkConfirm' }; } },
  { id: 'ClientBookResult', file: 'book-result', group: 'Book a lesson', title: '4 · Result — some dates skipped', note: 'Redesigned from Forest Confirmation: Mondays at 9:00 for Mia. Another family took Nov 9 while Grace was choosing, Thanksgiving week is time off, and the holiday camp week has no 30-minute times.', setup: st => {
    st.screen = 'book-times'; bkSel(st, 's1', [['2026-11-02', 540]]); Object.assign(st.ui.book, { repeat: true, every: 1, until: '2027-01-18' });
    st.lessons.push({ id: 'k-other', sid: 's3', iso: '2026-11-09', t: 540, len: 30, price: 50, status: 'BOOKED', pay: 'UNPAID', recurring: false });
    ACTIONS.bkBook(); } },
  { id: 'ClientBookResubmit', file: 'book-result-resubmit', group: 'Book a lesson', title: '4 · Result after resubmitting', note: 'Redesigned from Forest ClientBookingResubmit: the first attempt (Mondays 9:30 and Wednesdays 7:00) hit an error after booking. The resubmission recognises the Mondays as Mia’s, books Fridays, and asks about the Wednesdays.', setup: st => {
    st.screen = 'book-times';
    bkSel(st, 's1', [['2026-10-19', 570], ['2026-10-21', 420]]); Object.assign(st.ui.book, { repeat: true, every: 1, until: '2026-12-14' }); ACTIONS.bkBook();
    bkStage('s1', [['2026-10-19', 570], ['2026-10-16', 510]]); Object.assign(st.ui.book, { repeat: true, every: 1, until: '2026-12-14' }); ACTIONS.bkBook(); } },
  { id: 'ClientBookings', file: 'bookings', group: 'My bookings', title: 'My bookings', note: 'Redesigned from Forest ClientMyBookings: upcoming lessons by date with Cancel on each, a filter per skater, the repeating series with Change, and recent attendance.', setup: st => { st.screen = 'bookings'; } },
  { id: 'ClientBookingsCancel', file: 'bookings-cancel', group: 'My bookings', title: 'Cancel a lesson', note: 'Redesigned from Forest ClientCancelConfirm. None of the sample lessons falls inside 24 hours, so Grace has booked Mia at 10:30 this morning to show the “may incur a fee” warning.', setup: st => { st.screen = 'bookings'; st.lessons.push({ id: 'k-today', sid: 's1', iso: TODAY, t: 630, len: 30, price: 50, status: 'BOOKED', pay: 'UNPAID', recurring: false }); st.modal = { kind: 'bkCancel', id: 'k-today' }; } },
  { id: 'ClientRecurrence', file: 'recurrence', group: 'My bookings', title: 'Change a repeating lesson', note: 'Redesigned from Forest ClientRecurrence: Mia’s Wednesdays at 6:30 reduced to every 2 weeks, with every affected date previewed as kept or cancelled.', setup: st => { const a = bkArrangements().find(x => x.sid === 's1' && x.dow === 3 && x.t === 390); ACTIONS.bkRecOpen(a.key); st.ui.bk.rec.mode = 1; st.ui.bk.rec.interval = 2; } },
);
