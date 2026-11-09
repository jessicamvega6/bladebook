/* Client website — booking and My bookings.
   FeatureDecriptions/Bookings: and cancelation.md; ADR-006 d3, d4, d4a, d4b; ADR-009 d4; ADR-015 d1a; §7 privacy;
   sharing a lesson: ADR-026 d4–d5, ADR-033 (share-check at the share step), FeatureDecriptions/Schedule lesson split.
   Registers SCREENS book / book-times / book-result / bookings / recurrence, MODALS bkConfirm / bkCancel / bkWithdraw,
   ACTIONS bk*, and the 'Book a lesson' and 'My bookings' PRESETS.
   A family sees only open versus taken; who holds a taken time is never shown. Their own lessons show as theirs.
   Many coaches (ADR-025 d3, d5, d7): the page shows one coach at a time, chosen from a Coach dropdown. Switching coach keeps
   the times already picked with other coaches; switching skater clears them. A pick that overlaps the skater's lesson or
   pick with another coach is warned about, never refused. Booking sends one request per coach. */

const BK_MONTHS = ['2026-10', '2026-11', '2026-12'];          // the booking page shows three months (UI limit only)
/** The booking window's last day: the end of the month two months ahead (ADR-031 d3). The day view never leaves
    TODAY..BK_LAST (B5, owner 2026-11-08). */
const BK_LAST = (() => { const [y, m] = BK_MONTHS[BK_MONTHS.length - 1].split('-').map(Number); return toIso(new Date(y, m, 0)); })();
const bkInWindow = iso => iso >= TODAY && iso <= BK_LAST;
const bkClamp = iso => iso < TODAY ? TODAY : iso > BK_LAST ? BK_LAST : iso;
/** One message for every date that couldn't be booked, whatever the cause, so no family learns about another's
    booking (ADR-MASTER "Booking a time"; B1, owner 2026-11-08; wording 2026-11-09). */
const BK_UNAVAILABLE = 'That time was taken or no longer exists.';
const bkUi = () => (state.ui.book ??= { sid: null, coach: null, month: BK_MONTHS[0], day: null, week: false, sel: [], repeat: false, every: 1, until: '', result: null, lastReq: null, noSchedule: false, share: '' });
const bkState = () => (state.ui.bk ??= { arr: {}, rec: null, who: 'all', coach: 'all', all: false, seq: 0 });
/** Skaters who can be booked: approved with at least one coach. */
const bkKids = () => myKids().filter(k => myCoachIds().some(cid => linkOf(k, cid) === 'ACTIVE'));
const bkKid = () => { const u = bkUi(), kids = bkKids(); if (!u.sid || !kids.some(k => k.id === u.sid)) u.sid = kids[0] && kids[0].id; return student(u.sid); };
/** The coach whose times are showing: one the skater is approved with. */
const bkCid = () => { const u = bkUi(), k = bkKid(), ok = myCoachIds().filter(cid => k && linkOf(k, cid) === 'ACTIVE'); if (!ok.includes(u.coach)) u.coach = ok[0] || DANA; return u.coach; };
const bkC = () => coachById(bkCid());
const bkOpen = iso => bkUi().noSchedule ? [] : openSlotsFor(bkCid(), iso);
const bkHasSchedule = iso => !bkUi().noSchedule && slotsFor(bkCid(), iso).length > 0;
const bkMinutesUntil = (iso, t) => Math.round((parseIso(iso) - parseIso(TODAY)) / 864e5) * 1440 + t - NOW_MIN;
/** The coach's notice period. 24 hours for every coach in MVP; per-coach notice periods are Phase 2 (B6, owner 2026-11-08). */
const bkNotice = l => coachById(lcoach(l)).notice || NOTICE_H;
/** After a family cancels: the coach is told only when a lesson was inside the notice period (ADR-009 d9, owner 2026-10-12). */
const bkToldLate = (lessons, coach) => lessons.some(l => bkInsideNotice(l)) ? ` Coach ${coachById(coach).first} has been told, because it’s a late cancellation.` : '';
/** The selected coach's cancellation notice period, shown on both booking pages (owner, 2026-10-13). */
const bkNoticeHelp = c => help(`Cancelling with Coach ${esc(c.first)}`, `Coach ${esc(c.first)} asks for ${c.notice || NOTICE_H} hours’ notice. Cancelling later than that may be charged.`);
const bkInsideNotice = l => { const m = bkMinutesUntil(l.iso, l.t); return m > 0 && m < bkNotice(l) * 60; };
const bkSortT = list => list.slice().sort((a, b) => (a.iso + String(a.t).padStart(4, '0')).localeCompare(b.iso + String(b.t).padStart(4, '0')));
/** Picks grouped by coach, in the family's coach order. */
const bkByCoach = list => myCoachIds().map(cid => ({ cid, c: coachById(cid), ps: bkSortT(list.filter(x => x.coach === cid)) })).filter(g => g.ps.length);

/* ---------- clashes across coaches (ADR-025 d5) ---------- */
const bkOverlap = (a, alen, b, blen) => a < b + blen && b < a + alen;
/** The skater's lesson or pick with another coach that a time overlaps, if any. Warned about, never refused. */
function bkClash(cid, sid, iso, t, len) {
  const l = state.lessons.find(l => l.iso === iso && lcoach(l) !== cid && (l.sid === sid || (l.with || []).some(w => w.sid === sid)) && bkOverlap(t, len, l.t, l.len));
  if (l) return { coach: lcoach(l), t: l.t, len: l.len, booked: true };
  const p = bkUi().sel.find(x => x.iso === iso && x.coach !== cid && bkOverlap(t, len, x.t, x.len));
  return p ? { coach: p.coach, t: p.t, len: p.len, booked: false } : null;
}
const bkClashText = cl => `${cl.booked ? 'Lesson' : 'Your pick'} with Coach ${esc(coachById(cl.coach).first)} at ${fmtT(cl.t)}`;
const bkEveryLabel = n => n === 1 ? 'every week' : `every ${n} weeks`;
/** How often a lesson's series repeats, from the series itself (1 to 4 weeks, ADR-006 d4a; B12, owner 2026-11-09). '' if it doesn't repeat. */
const bkRepeatsLabel = l => { const k = bkKey(l); if (!k) return ''; const n = (bkState().arr[k] || {}).interval || 1; return n === 1 ? 'repeats weekly' : `repeats every ${n} weeks`; };
const bkWeeksBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / (7 * 864e5));
const bkMonthLabel = ym => { const [y, m] = ym.split('-').map(Number); return `${MON_LONG[m - 1]} ${y}`; };
const bkShortMonth = ym => MON[Number(ym.split('-')[1]) - 1];

/* Waiting families never see the booking pages (ADR-022 d6). */
const bkPendingGate = () => shell(card(`<div class="pempty"><span class="pempty__icon">${ic('lock', 22)}</span><b>Booking opens once ${coachOr(waitingByCoach().map(w => w.cid).concat(waitingByCoach().length ? [] : [DANA]))} approves</b><span class="muted">Until then you can see your own account and skaters. You can book here as soon as you’re approved.</span>${B('Back to home', 'secondary', '', { href: href('home') })}</div>`));

/* ---------- skater and coach pickers ---------- */
function bkPicker() {
  const kids = bkKids(), k = bkKid();
  const who = kids.length < 2 ? `<div class="picker"><span class="picker__label">Booking for</span><span class="picker__val">${avatar(initials(k.name), 'xs')}${esc(k.name)}</span></div>`
    : `<div class="picker"><span class="picker__label">Booking for</span>${SEG(kids.map(x => esc(firstName(x.name))), kids.findIndex(x => x.id === k.id), 'bkKid')}</div>`;
  return `<div class="bk-pickers">${who}${bkCoachPick(k)}</div>`;
}
/** Coach dropdown: the coaches this skater is with. One still to approve them is listed but can't be picked. */
function bkCoachPick(k) {
  const cid = bkCid(), ids = myCoachIds().filter(id => linkOf(k, id));
  if (ids.length < 2) return '';
  const opts = ids.map(id => { const ok = linkOf(k, id) === 'ACTIVE', n = bkUi().sel.filter(x => x.coach === id).length;
    return `<option value="${id}"${id === cid ? ' selected' : ''}${ok ? '' : ' disabled'}>Coach ${esc(cName(coachById(id)))}${ok ? (n ? ` · ${plural(n, 'pick')}` : '') : ' · waiting to approve'}</option>`; }).join('');
  return `<div class="picker"><label class="picker__label" for="bk-coach">Coach</label><select id="bk-coach" class="ctl bk-coachsel" data-bind="ui.book.coach">${opts}</select></div>`;
}

/* ================= 1 · Pick a day ================= */
SCREENS.book = () => {
  if (isPendingFamily()) return bkPendingGate();
  const u = bkUi(), k = bkKid(), cid = bkCid(), c = bkC(), [y, m] = u.month.split('-').map(Number);
  const first = `${u.month}-01`, days = new Date(y, m, 0).getDate();
  const totalOpen = Array.from({ length: days }, (_, i) => bkOpen(`${u.month}-${String(i + 1).padStart(2, '0')}`).length).reduce((a, b) => a + b, 0);
  const anySchedule = BK_MONTHS.some(ym => { const [yy, mm] = ym.split('-').map(Number); for (let d = 1; d <= new Date(yy, mm, 0).getDate(); d++) if (bkHasSchedule(`${ym}-${String(d).padStart(2, '0')}`)) return true; return false; });
  const mi = BK_MONTHS.indexOf(u.month);
  const cell = d => {
    const iso = `${u.month}-${String(d).padStart(2, '0')}`, n = bkOpen(iso).length;
    const mine = myLessons().filter(l => l.iso === iso && l.sid === k.id && lcoach(l) === cid).length;
    const sp = specialFor(cid, iso), tag = sp && sp.kind === 'timeoff' ? '<span class="bk-calnote">No lessons</span>' : '';
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
    ${pageHead('Book a lesson', `Coach ${esc(cName(c))}`, bkPicker())}
    ${card(`${calbar}<div class="cal-wrap">${monthGrid(y, m - 1, d => `<div class="cal__cell cal__cell--off"><span class="cal__num">${d}</span></div>`, { cls: 'cal--ghost' })}
      <div class="cal-empty"><span class="cal-empty__icon">${ic('calendar', 24)}</span><h2 class="h2">No lesson times yet</h2><p>${esc(c.first)} hasn’t posted any times. Check back soon.</p></div></div>`)}`, { width: 'wide' });
  return shell(`
    ${pageHead('Book a lesson', `Pick a day to see Coach ${esc(c.first)}’s open times for ${esc(firstName(k.name))}.`, bkPicker())}
    ${bkOtherPicks(cid)}
    <div class="split split--cal bk-split">
      ${card(`${calbar}
        <div class="bk-scroll"><div class="bk-calgrid"><div class="bk-weeks"><div class="bk-weeks__h">Jump to</div>${weeks}</div>${monthGrid(y, m - 1, cell)}</div></div>
        <div class="legend"><span class="legend__item"><i class="sw sw--open"></i>Open times</span><span class="legend__item"><i class="sw sw--off"></i>Nothing open</span><span class="legend__item">${ic('check', 12)}${esc(firstName(k.name))} has a lesson</span><span class="legend__note">${plural(totalOpen, 'open time')} in ${MON_LONG[m - 1]}</span></div>`)}
      <div class="stack">
        ${card(`<div class="bk-months">${BK_MONTHS.map(ym => { let n = 0; const [yy, mm] = ym.split('-').map(Number); for (let d = 1; d <= new Date(yy, mm, 0).getDate(); d++) n += bkOpen(`${ym}-${String(d).padStart(2, '0')}`).length; return `<button type="button" class="bk-month${ym === u.month ? ' is-on' : ''}"${actAttr('bkMonth', [ym])}><b>${MON_LONG[mm - 1]}</b><span>${plural(n, 'open time')}</span></button>`; }).join('')}</div>`, { title: 'Months' })}
        ${bkNoticeHelp(c)}
        ${help('Booking window', 'You can see three months ahead. A repeating booking can run past that: you set the end date when you book.')}
        ${myCoachIds().filter(id => linkOf(k, id) === 'ACTIVE').length > 1 ? help('More than one coach', `Pick a coach above to see their times. Times you’ve picked with one coach stay picked when you switch.`) : ''}
      </div>
    </div>`, { width: 'wide' });
};

/* ================= 2 · Pick your times ================= */
function bkSlotState(cid, iso, s, k) {
  const u = bkUi();
  // Every time that has already started says "Past", booked or not (owner, 2026-10-13).
  if (iso < TODAY || (iso === TODAY && s.t <= NOW_MIN)) return { st: 'past' };
  const own = myLessonAt(cid, iso, s.t);
  if (own) return { st: 'yours', who: student(own.sid) };
  if (lessonsFor(cid, iso).some(l => l.t === s.t)) return { st: 'taken' };
  if (u.sel.some(x => x.coach === cid && x.iso === iso && x.t === s.t)) return { st: 'sel' };
  return { st: 'open' };
}
function bkSlot(cid, iso, s, k) {
  const { st, who } = bkSlotState(cid, iso, s, k), end = fmtT(s.t + s.len).replace(' AM', '').replace(' PM', '');
  const price = priceAt(cid, k.id, s), cl = (st === 'open' || st === 'sel') && bkClash(cid, k.id, iso, s.t, s.len);
  const label = st === 'yours' ? `${esc(firstName(who.name))}’s lesson` : st === 'taken' ? 'Taken' : st === 'past' ? 'Past' : money(price);
  const cls = `slot slot--${s.len} ${st === 'sel' ? 'slot--mine' : st === 'taken' || st === 'past' ? 'slot--taken' : st === 'yours' ? 'slot--taken bk-yours' : 'slot--open'}${cl ? ' bk-clash' : ''}`;
  const len = cl ? `<span class="slot__len bk-clash__note" title="Overlaps ${bkClashText(cl).replace(/^L/, 'l').replace(/^Y/, 'y')}">${ic('alert', 12)}Overlaps ${esc(coachById(cl.coach).first)} ${fmtShortT(cl.t)}</span>` : `<span class="slot__len">${s.len} min</span>`;
  const inner = `<span class="slot__time">${fmtT(s.t)}<small> – ${end}</small></span>${len}<span class="slot__price">${label}</span><span class="slot__mark">${st === 'sel' ? ic('check', 14) : st === 'yours' ? ic('check', 12) : ''}</span>`;
  if (st === 'open' || st === 'sel') return `<button type="button" class="${cls}"${actAttr('bkToggle', [iso, s.t, cid])} aria-pressed="${st === 'sel'}">${inner}</button>`;
  return `<div class="${cls}">${inner}</div>`;
}
/** Times already picked with other coaches, so a family switching coach can see they're kept. */
function bkOtherPicks(cid) {
  const other = bkByCoach(bkUi().sel).filter(g => g.cid !== cid);
  if (!other.length) return '';
  return banner('info', `Your picks with ${other.map(g => `Coach ${esc(g.c.first)} (${g.ps.length})`).join(' and ')} are kept`, `They’re in Your picks and are booked together with these when you continue.`);
}
/** The Your picks panel: grouped by coach when there's more than one, each with its own total. Never one total across
    coaches: each family pays each coach directly, possibly in different currencies (ADR-025 d7). */
function bkPicksPanel(u, k) {
  const groups = bkByCoach(u.sel), multi = groups.length > 1, all = u.sel;
  if (!all.length) return `<p class="fine">No times picked yet.</p>${B('Continue', 'primary', '', { block: true, lg: true, iconR: 'arrowR', disabled: true })}`;
  const mins = all.reduce((s, x) => s + x.len, 0), hrs = mins >= 60 ? `${Math.floor(mins / 60)} hr${mins % 60 ? ' ' + (mins % 60) + ' min' : ''}` : mins + ' min';
  const pick = x => { const cl = bkClash(x.coach, k.id, x.iso, x.t, x.len);
    return `<div class="pick${cl ? ' bk-pick--clash' : ''}"><div class="pick__when"><b>${DOW[dowOf(x.iso)]} ${parseIso(x.iso).getDate()} · ${fmtT(x.t)}</b><small>${x.len} min${cl ? ` · ${ic('alert', 11)}overlaps` : ''}</small></div><span class="pick__price">${money(x.price)}</span><button type="button" class="iconbtn iconbtn--sm" aria-label="Remove"${actAttr('bkToggle', [x.iso, x.t, x.coach])}>${ic('x', 14)}</button></div>`; };
  const body = groups.map(g => `${multi ? `<div class="bk-pickcoach"><b>Coach ${esc(cName(g.c))}</b><span>${money(g.ps.reduce((s, x) => s + x.price, 0))}</span></div>` : ''}<div class="picks">${g.ps.map(pick).join('')}</div>`).join('');
  return `${body}
    <div class="total"><span>${plural(all.length, 'lesson')} · ${hrs}</span>${multi ? `<span class="bk-total-note">Paid to each coach separately</span>` : `<span class="total__v">${money(all.reduce((s, x) => s + x.price, 0))}</span>`}</div>
    ${B('Continue', 'primary', 'bkContinue', { block: true, lg: true, iconR: 'arrowR' })}
    <p class="fine">You can make these repeat on the next step.</p>`;
}
SCREENS['book-times'] = () => {
  if (isPendingFamily()) return bkPendingGate();
  const u = bkUi(), k = bkKid(), cid = bkCid(), c = bkC(), iso = u.day || TODAY, sun = weekStart(iso);
  // The strip and its arrows stay inside the booking window (B5): a day before today or past BK_LAST can't be opened.
  const prevOk = sun > TODAY, nextOk = addDays(sun, 7) <= BK_LAST;
  const strip = `<div class="daystrip bk-strip"><button type="button" class="iconbtn" aria-label="Previous week"${prevOk ? actAttr('bkDay', [bkClamp(addDays(iso, -7))]) : ' disabled'}>${ic('chevL', 18)}</button>${Array.from({ length: 7 }, (_, i) => {
    const d = addDays(sun, i), n = bkOpen(d).length, c = u.sel.filter(x => x.coach === cid && x.iso === d).length, on = d === iso;
    if (!bkInWindow(d)) return `<button type="button" class="dchip dchip--off" disabled aria-label="${dLong(d)}: outside the booking window"><span class="dchip__dow">${DOW[dowOf(d)]}</span><span class="dchip__n">${parseIso(d).getDate()}</span><span class="dchip__s">—</span></button>`;
    const s = !bkHasSchedule(d) ? 'No ice' : n ? `${n} open` : 'Full';
    return `<button type="button" class="dchip${on ? ' dchip--sel' : !n ? ' dchip--off' : c ? ' dchip--has' : ''}"${actAttr('bkDay', [d])}><span class="dchip__dow">${DOW[dowOf(d)]}</span><span class="dchip__n">${parseIso(d).getDate()}</span><span class="dchip__s">${s}</span>${c ? `<span class="dchip__count">${c}</span>` : ''}</button>`;
  }).join('')}<button type="button" class="iconbtn" aria-label="Next week"${nextOk ? actAttr('bkDay', [bkClamp(addDays(iso, 7))]) : ' disabled'}>${ic('chevR', 18)}</button></div>`;
  const slots = slotsFor(cid, iso), sp = specialFor(cid, iso);
  const groups = []; for (const s of slots) { const g = groups[groups.length - 1]; if (g && g.block === s.block) g.slots.push(s); else groups.push({ block: s.block, slots: [s] }); }
  const body = !bkHasSchedule(iso)
    ? `<div class="pempty"><span class="pempty__icon">${ic('calOff', 22)}</span><b>${sp && sp.kind === 'timeoff' ? `${esc(c.first)} is away (${esc(sp.name)})` : `No lessons with ${esc(c.first)} on ${DOW_LONG[dowOf(iso)]}s`}</b><span class="muted">Pick another day above.</span></div>`
    : `${sp ? banner('info', esc(sp.name), `Special hours from ${dShort(sp.sd)} to ${dShort(sp.ed)}.`) : ''}<div class="tl">${groups.map((g, gi) => {
        const prev = groups[gi - 1], gap = prev ? `<div class="tl__gap">${ic('ban', 14)}Not on the ice ${fmtT(prev.slots[prev.slots.length - 1].t + prev.slots[0].len)} – ${fmtT(g.slots[0].t)}</div>` : '';
        const p = priceAt(cid, k.id, g.slots[0]);
        return `<div class="tl__sec"><div class="tl__label">${esc(g.block)} <span>${g.slots[0].len} min · ${money(p)}</span></div>${gap}<div class="tl__col">${g.slots.map(s => bkSlot(cid, iso, s, k)).join('')}</div></div>`;
      }).join('')}</div>
      <div class="legend"><span class="legend__item"><i class="sw sw--open"></i>Open</span><span class="legend__item"><i class="sw sw--sel"></i>Your pick</span><span class="legend__item"><i class="sw sw--taken"></i>Taken</span><span class="legend__item"><i class="sw bk-sw-yours"></i>Your family’s lesson</span>${multiCoach() ? `<span class="legend__item">${ic('alert', 12)}Overlaps another coach’s lesson</span>` : ''}<span class="legend__note">Taller = longer lesson</span></div>`;
  const n = bkOpen(iso).length, all = slotsFor(cid, iso).length;
  return shell(`
    ${pageHead(u.week ? `Week of ${dShort(sun)}` : dLong(iso), u.week ? `${dLong(iso)} · ${plural(n, 'open time')} · pick times on any day this week` : bkHasSchedule(iso) ? `${n} of ${all} times still open · picks are kept as you move between days` : 'No lesson times on this day', bkPicker(), crumb('book', MON_LONG[parseIso(iso).getMonth()]))}
    ${strip}
    ${bkOtherPicks(cid)}
    <div class="split split--tl">
      ${card(body, { title: `Coach ${esc(c.first)}’s open times`, sub: 'Tap an open time to add it. Tap it again to remove it.' })}
      <div class="stack sticky">
        ${card(bkPicksPanel(u, k), { title: 'Your picks', sub: `For ${esc(k.name)}` })}
        ${bkNoticeHelp(c)}
      </div>
    </div>`, { width: 'wide' });
};

/* ================= 3 · Confirm & repeat (pop-up) ================= */
/** Every date a request would book: each pick, repeated every N weeks up to the end date when Repeat is on. */
function bkOccurrences(u) {
  const out = [];
  for (const x of u.sel) {
    if (!u.repeat) { out.push({ ...x, series: `${x.coach}|${x.iso}|${x.t}` }); continue; }
    for (let d = x.iso; d <= u.until; d = addDays(d, 7 * u.every)) out.push({ ...x, iso: d, series: `${x.coach}|${dowOf(x.iso)}|${x.t}` });
  }
  return out;
}
/** Every date the request would book that overlaps the skater's lesson with another coach, or another date in the same
    request with another coach. Listed in the pop-up before booking; booking anyway is allowed (ADR-025 d5). */
function bkClashList(u, k, occ) {
  const out = [], seen = new Set();
  for (const o of occ) {
    const l = state.lessons.find(l => l.iso === o.iso && lcoach(l) !== o.coach && (l.sid === k.id || (l.with || []).some(w => w.sid === k.id)) && bkOverlap(o.t, o.len, l.t, l.len));
    const p = l ? null : occ.find(q => q.iso === o.iso && q.coach !== o.coach && bkOverlap(o.t, o.len, q.t, q.len));
    const hit = l ? { coach: lcoach(l), t: l.t, booked: true } : p ? { coach: p.coach, t: p.t, booked: false } : null;
    if (!hit) continue;
    const key = [o.iso, ...[`${o.coach}${o.t}`, `${hit.coach}${hit.t}`].sort()].join('|'); if (seen.has(key)) continue; seen.add(key);
    out.push({ iso: o.iso, a: o, b: hit });
  }
  return out;
}
const bkMaxUntil = u => { const f = u.sel.map(x => x.iso).sort()[0] || TODAY; return addDays(f, 365); };
const bkUntilError = u => !u.repeat ? '' : !u.until ? 'Pick an end date.' : u.until < (u.sel.map(x => x.iso).sort()[0] || TODAY) ? 'The end date is before your first lesson.' : u.until > bkMaxUntil(u) ? 'A repeating booking can run up to 12 months.' : '';
/* Share this lesson (ADR-026 d4–d5, ADR-033). Only on times whose block takes 2 or more skaters; families never see how many.
   One skater code per request. Only a skater ACTIVE with the lesson's coach can be added, by invitation or as a sibling
   (ADR-033 d1). The share-check endpoint (ADR-033 d2a, POST /api/client/share-check) answers as soon as the code is in:
   a display name, "Ella A.", and onCoachRoster, true only for ACTIVE. Never the family, and a PENDING skater answers
   false like one the coach has never had. The booking transaction's check stays the authority. */
const bkShareable = x => (slotsFor(x.coach, x.iso).find(s => s.t === x.t) || {}).maxSkaters >= 2;
/** The coach of the lesson being shared: the coach of the first pick that can be shared. */
const bkShareCoach = u => (u.sel.find(bkShareable) || {}).coach || DANA;
/* The share-check is a network call, so a whole code is first 'checking', then answered or 'failed' (ADR-033 2a, amended
   2026-10-20). An answer counts only for the exact code and coach it was asked about: changing either asks again.
   u.shareChk = { key: '<code>|<coach>', at: 'checking' | 'done' | 'failed' }. The demo answers after a short pause, and the
   demo bar's "Make the share-check fail" box makes it fail. Static pages have no network: a preset that sets no shareChk
   shows the answer. */
let DEMO_SHARE_FAILS = false;
const BK_SHARE_WAIT_MS = 700;
function bkShareAsk(u, key) {
  u.shareChk = { key, at: 'checking' };
  setTimeout(() => { if (u.shareChk && u.shareChk.key === key && u.shareChk.at === 'checking') { u.shareChk.at = DEMO_SHARE_FAILS ? 'failed' : 'done'; render(); } }, BK_SHARE_WAIT_MS);
}
function bkShareState(u, k) {
  const raw = String(u.share || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!raw) return { st: 'empty' };
  if (raw.length < 8) return { st: 'typing' };   // 3 letters + 5 random (ADR-026 d4, 2026-10-13)
  if (k.shareCode && k.shareCode.replace(/[^A-Z0-9]/g, '') === raw) return { st: 'self', s: k };   // the page knows its own skater's code; no call
  const key = `${raw}|${bkShareCoach(u)}`, chk = u.shareChk && u.shareChk.key === key ? u.shareChk : null;
  if (!chk && typeof document !== 'undefined') { bkShareAsk(u, key); return { st: 'checking' }; }
  if (chk && chk.at === 'checking') return { st: 'checking' };
  if (chk && chk.at === 'failed') return { st: 'failed' };
  const s = state.students.find(x => x.shareCode && x.shareCode.replace(/[^A-Z0-9]/g, '') === raw);
  if (!s) return { st: 'wrong' };   // share-check 404
  const sibling = s.client === state.me.name, onCoachRoster = linkOf(s, bkShareCoach(u)) === 'ACTIVE';
  return { st: onCoachRoster ? 'found' : sibling ? 'siblingWaiting' : 'notStudent', s, name: shortName(s.name), sibling };
}
function bkShareBox(u, k, picks) {
  const can = picks.filter(bkShareable); if (!can.length) return '';
  const sibs = myKids().filter(x => x.id !== k.id);   // a sibling can be added only once the coach has accepted them (ADR-033 d1)
  const sh = bkShareState(u, k), s = sh.s, fn = s && esc(firstName(s.name)), coach = esc(coachById(can[0].coach).first);
  const err = sh.st === 'wrong' ? 'That code doesn’t match a skater. Check it with the other family.' : sh.st === 'self' ? `That’s ${esc(firstName(k.name))}’s own code. Enter the other skater’s code.`
    : sh.st === 'notStudent' ? `${esc(sh.name)} isn’t one of Coach ${coach}’s students yet. ${fn}’s family can sign up with Coach ${coach}’s code, and once Coach ${coach} accepts ${fn} you can share a lesson.`
    : sh.st === 'siblingWaiting' ? `${fn} is not available to add until Coach ${coach} accepts them.`
    : sh.st === 'failed' ? 'Couldn’t check that code. Try again.' : '';
  const which = can.length < picks.length ? ` Only ${can.map(x => `${DOW[dowOf(x.iso)]} ${fmtT(x.t)}`).join(' and ')} can be shared.` : '';
  const found = sh.st !== 'found' ? '' : `<div class="found">${avatar(initials(s.name), 'sm')}<div><div class="found__name">${esc(sh.name)}</div><div class="found__sub">${!sh.sibling ? 'Their family gets an email to accept.' : `In your family, so ${fn} is added directly. No invitation.`}</div></div>${badge('Code found', 'success', 'check')}</div>`;
  return `<div class="bk-share"><div class="bk-share__head">${ic('users', 16)}<b>Share this lesson</b><span class="label__opt">Optional</span></div>
    <p class="fine">Enter another skater’s share code${sibs.length ? ', or add one of your own skaters' : ''}. Only Coach ${coach}’s students can share a lesson. Another family must accept before their skater joins. Once they join, the lesson’s price is split: each skater pays ${money(can[0].price / 2)} instead of ${money(can[0].price)}.${u.repeat ? ' Every lesson in the series is shared.' : ''}${which}</p>
    ${INP('bk-share', 'Skater’s share code', 'ui.book.share', { live: true, mono: true, placeholder: 'e.g. LIL-6T2NB', error: err, hint: sh.st === 'typing' ? 'Keep typing. Book stays off until the whole code is in, or the box is empty.' : sh.st === 'checking' ? 'Checking the code… Book stays off until it’s checked.' : '' })}
    ${sh.st === 'failed' ? `<div class="bk-share__retry">${B('Try again', 'secondary', 'bkShareRetry', { sm: true, icon: 'refresh' })}<span class="fine">Book stays off until the code is checked, or the box is empty.</span></div>` : ''}
    ${found}
    ${sibs.length ? `<div class="bk-share__sibs"><div class="label">Your skaters</div><div class="listbox">${sibs.map(x => { const ok = linkOf(x, can[0].coach) === 'ACTIVE', xf = esc(firstName(x.name)), on = ok && sh.s === x;
      return row(`${avatar(initials(x.name), 'sm')}${rowTitle(esc(x.name), ok ? `Coach ${coach}’s student · added directly, no invitation` : !myCoachIds().some(cid => linkOf(x, cid)) ? 'Not with a coach yet' : `Not available to add until Coach ${coach} accepts them`)}`,
        ok ? (on ? badge('Added', 'success', 'check') : B(`Add ${xf}`, 'secondary', 'bkShareSib', { sm: true, args: [x.id] })) : badge('Not available', 'neutral', 'lock'), { muted: !ok }); }).join('')}</div></div>` : ''}</div>`;
}
/** A typed code must check out before the booking can continue (ADR-026 d5): a skater not on the coach's student list
    stops the booking at the share step, and nothing is booked (ADR-033 d2). Book stays off while the code is being
    typed, is being checked, couldn't be checked, or answered anything but 'found' (ADR-033 2a, amended 2026-10-20). */
const bkShareBlocks = (u, k) => { const st = bkShareState(u, k).st; return u.sel.some(bkShareable) && st !== 'empty' && st !== 'found'; };
MODALS.bkConfirm = () => {
  const u = bkUi(), k = bkKid(), occ = bkOccurrences(u), err = bkUntilError(u);
  const picks = bkSortT(u.sel), groups = bkByCoach(u.sel), multi = groups.length > 1;
  const first = picks.reduce((s, x) => s + x.price, 0), all = occ.reduce((s, x) => s + x.price, 0);
  const dis = !u.repeat ? ' disabled' : '';
  const clashes = bkClashList(u, k, occ), kf = esc(firstName(k.name));
  const prow = x => row(`<span class="dateblock"><b>${parseIso(x.iso).getDate()}</b><small>${MON[parseIso(x.iso).getMonth()]}</small></span>${rowTitle(`${DOW_LONG[dowOf(x.iso)]} · ${fmtT(x.t)}`, `${x.len} minutes`)}`, `<span class="money">${money(x.price)}</span>`);
  const sumFor = g => { const o = occ.filter(x => x.coach === g.cid); return kv(`Coach ${esc(g.c.first)}`, `${plural(o.length, 'lesson')} · <b>${money(o.reduce((s, x) => s + x.price, 0))}</b>`); };
  return `<div class="dialog__icon">${ic('calendar', 22)}</div>
    <h2 class="h2">Book for ${kf}</h2>
    <p class="fine">${multi ? `With ${plural(groups.length, 'coach', 'coaches')}. Each coach gets their own booking and confirmation email.` : `With Coach ${esc(cName(groups[0].c))}.`}</p>
    ${groups.map(g => `${multi ? `<div class="bk-dlist__h">Coach ${esc(cName(g.c))}</div>` : ''}<div class="bk-dlist">${g.ps.map(prow).join('')}</div>`).join('')}
    ${CHK('Repeat these lessons', u.repeat, 'bkRepeat', [], 'Every time you picked repeats on the same day of the week.')}
    <div class="grid2">
      <div class="field"><label class="label" for="bk-every">Repeats</label><select id="bk-every" class="ctl" data-bind="ui.book.every" data-num="1"${dis}>${[1, 2, 3, 4].map(n => `<option value="${n}"${n === u.every ? ' selected' : ''}>${n === 1 ? 'Every week' : `Every ${n} weeks`}</option>`).join('')}</select></div>
      <div class="field${err ? ' field--error' : ''}"><label class="label" for="bk-until">Until</label><input id="bk-until" class="ctl${err ? ' is-error' : ''}" type="date" value="${u.until}" max="${bkMaxUntil(u)}" data-bind="ui.book.until" data-live="1"${dis}><div class="hint${err ? ' hint--error' : ''}">${err ? ic('alert', 14) + err : 'Starts three months out. Up to 12 months.'}</div></div>
    </div>
    ${clashes.length ? `<div class="bk-clashes">${banner('warning', `${plural(clashes.length, 'clash', 'clashes')} with ${kf}’s other lessons`, `${kf} can’t be in two places at once. You can still book, for example back-to-back lessons at the same rink.`)}
      <div class="listbox">${clashes.slice(0, 6).map(x => row(`<span class="roundicon roundicon--warn">${ic('alert', 16)}</span>${rowTitle(dDow(x.iso), `${fmtT(x.a.t)} with Coach ${esc(coachById(x.a.coach).first)} overlaps ${x.b.booked ? 'the lesson' : 'your pick'} at ${fmtT(x.b.t)} with Coach ${esc(coachById(x.b.coach).first)}`)}`)).join('')}${clashes.length > 6 ? `<div class="card__note">and ${plural(clashes.length - 6, 'more date')}</div>` : ''}</div></div>` : ''}
    ${bkShareBox(u, k, picks)}
    <div class="summary"><div>${kv('Lessons', u.repeat ? `${plural(occ.length, 'lesson')} until ${dShort(u.until)}` : plural(occ.length, 'lesson'))}${multi ? groups.map(sumFor).join('') : `${kv(u.repeat ? 'First week' : 'Total', `<b>${money(first)}</b>`)}${u.repeat ? kv('All lessons', money(all)) : ''}`}</div><div class="summary__note">${ic('info', 14)}${multi ? 'You pay each coach directly' : `You pay ${esc(groups[0].c.first)} directly`}. BladeBook only sends reminders.</div>${multiCoach() ? `<div class="summary__note">${ic('clock', 14)}Coaches can have different cancellation notice periods.</div>` : ''}</div>
    <div class="dialog__actions">${B('Back', 'secondary', 'closeModal')}${B(clashes.length ? `Book anyway · ${plural(occ.length, 'lesson')}` : `Book ${plural(occ.length, 'lesson')}`, 'primary', 'bkBook', { disabled: !!err || !occ.length || bkShareBlocks(u, k) })}</div>`;
};

/* ================= 4 · Result ================= */
/** What happened to the share code: an invitation to the other family, or a sibling added (ADR-026 d5). */
function bkShareResult(r, k) {
  const sh = r.share, s = student(sh.sid), fn = esc(firstName(s.name)), kf = esc(firstName(k.name)), coach = esc(coachById(sh.coach || DANA).first), n = plural(sh.n, 'lesson');
  if (!sh.sibling) return banner('info', `Invitation sent to ${esc(sh.name)}’s family`, `They get an email to accept sharing ${sh.n === 1 ? 'the lesson' : `all ${n}`} with Coach ${coach}, and ${fn} joins once they do. Until then it’s ${kf}’s lesson alone. You can withdraw the invitation from My bookings until they answer.`, 'users');
  return banner('success', `${fn} added to ${kf}’s ${sh.n === 1 ? 'lesson' : n}`, `${fn} is in your family, so there’s no invitation.`, 'users');
}
SCREENS['book-result'] = () => {
  if (isPendingFamily()) return bkPendingGate();
  const r = bkUi().result;
  if (!r) return shell(card(`<div class="pempty"><b>Nothing booked yet</b>${B('Book a lesson', 'primary', '', { href: href('book') })}</div>`));
  const k = student(r.sid), kf = esc(firstName(k.name)), booked = r.items.filter(x => x.res === 'booked'), mine = r.items.filter(x => x.res === 'mine'), skipped = r.items.filter(x => x.res === 'skipped');
  const failed = r.failed || [], cids = [...new Set(r.series.map(x => x.coach))], perCoach = cids.length > 1;
  const resubmit = mine.length > 0;
  const seriesCard = sr => {
    const its = r.items.filter(x => x.series === sr.key), b = its.filter(x => x.res === 'booked').length, mn = its.filter(x => x.res === 'mine').length, sk = its.filter(x => x.res === 'skipped').length;
    const pct = its.length ? Math.round((b + mn) / its.length * 100) : 0;
    return card(`<div class="series"><div class="series__title">${ic(sr.repeat ? 'repeat' : 'calendar', 16)}${sr.title}</div><div class="series__sub">${sr.sub}</div><div class="meter meter--ok"><span style="width:${pct}%"></span></div><div class="series__foot"><b>${b ? `${b} booked` : 'None new'}${mn ? ` · ${mn} already yours` : ''}</b><span>${sk ? `${sk} unavailable` : 'All dates'}</span></div></div>`);
  };
  const skippedCard = list => list.length ? card(list.map(x => row(`<span class="roundicon roundicon--warn">${ic('x', 16)}</span>${rowTitle(`${dDow(x.iso)} · ${fmtT(x.t)}`, x.why)}`, B('Pick another time', 'secondary', 'bkPickDay', { sm: true, args: [x.iso, x.coach] }))).join(''),
    { title: `${plural(list.length, 'date')} need${list.length === 1 ? 's' : ''} another time`, sub: 'Or leave them. The rest of your bookings are confirmed.', pad: false }) : '';
  /* One section per coach (owner, 2026-10-13): each coach's request succeeds or fails on its own (ADR-025 d3). A failed
     request booked nothing with that coach; Try again resends only that coach's picks, and a time already booked for the
     skater is recognised, never booked twice (ADR-006 d4b). */
  const section = cid => {
    const c = coachById(cid), its = r.items.filter(x => x.coach === cid), nb = its.filter(x => x.res === 'booked').length, sk = its.filter(x => x.res === 'skipped');
    const head = `<div class="bk-rescoach">${avatar(initials(cName(c)), 'sm')}<div><b>Coach ${esc(cName(c))}</b><span>${failed.includes(cid) ? 'Not booked' : `${nb ? `${plural(nb, 'lesson')} booked · confirmation email sent` : 'Nothing new booked'}${sk.length ? ` · ${plural(sk.length, 'date')} unavailable` : ''}`}</span></div>${failed.includes(cid) ? badge('Didn’t go through', 'danger', 'alert') : nb || its.some(x => x.res === 'mine') ? badge('Booked', 'success', 'check') : ''}</div>`;
    if (failed.includes(cid)) return `${head}${card(`<div class="decide"><div>${rowTitle(`Nothing was booked with Coach ${esc(c.first)}`, `Something went wrong sending ${kf}’s ${plural(its.length, 'lesson')} with Coach ${esc(c.first)}. ${cids.filter(id => !failed.includes(id)).length ? `Lessons with ${cids.filter(id => !failed.includes(id)).map(id => `Coach ${esc(coachById(id).first)}`).join(' and ')} are booked and aren’t affected.` : ''} Trying again books only these, and nothing is booked twice.`)}</div><div class="decide__btns">${B('Try again', 'primary', 'bkRetry', { args: [cid], icon: 'refresh' })}</div></div>`, { cls: 'card--attn' })}`;
    return `${head}<div class="grid2 bk-series">${r.series.filter(x => x.coach === cid).map(seriesCard).join('')}</div>${skippedCard(sk)}`;
  };
  const okCount = booked.length;
  const heroTitle = failed.length ? (okCount ? `${plural(okCount, 'lesson')} booked for ${kf}, but not with Coach ${failed.map(id => esc(coachById(id).first)).join(' or ')}` : `Nothing was booked for ${kf}`)
    : resubmit ? `${kf}’s lessons, as they stand now` : okCount ? `${plural(okCount, 'lesson')} booked for ${kf}` : `Nothing new was booked for ${kf}`;
  const heroSub = failed.length ? `Each coach’s booking goes through on its own. Try again below for the ${failed.length === 1 ? 'one' : 'ones'} that didn’t.`
    : resubmit ? 'Some of these times were already booked for ' + kf + ', so nothing was booked twice.' + (okCount ? ' A confirmation email is on its way for the new ones.' : '')
    : `${okCount ? `A confirmation email is on its way${perCoach ? ' from each coach' : ''}. ` : ''}${skipped.length ? `${plural(skipped.length, 'date')} couldn’t be booked${okCount ? '. Everything else is confirmed.' : '.'}` : ''}`;
  const ok = (okCount || resubmit) && !failed.length;
  return shell(`
    <div class="hero ${ok ? 'hero--success' : 'bk-hero--warn'}"><span class="hero__icon">${ic(ok ? 'check' : 'alert', 26)}</span><div><h1 class="h1">${heroTitle}</h1><p class="lede">${heroSub}</p></div></div>
    ${r.share ? bkShareResult(r, k) : ''}
    ${perCoach || failed.length ? cids.map(section).join('') : `<div class="grid2 bk-series">${r.series.map(seriesCard).join('')}</div>${skippedCard(skipped)}`}
    ${mine.length ? card(mine.slice(0, 6).map(x => row(`<span class="roundicon roundicon--ok">${ic('check', 16)}</span>${rowTitle(`${dDow(x.iso)} · ${fmtT(x.t)}${perCoach ? ` · Coach ${esc(coachById(x.coach).first)}` : ''}`, `Already booked for ${kf}`)}`, `<span class="muted">${x.len} min</span>`)).join('') + (mine.length > 6 ? `<div class="card__note">and ${plural(mine.length - 6, 'more date')} already booked for ${kf}</div>` : ''),
      { title: `Already booked for ${kf}`, sub: 'From an earlier booking. They weren’t booked again.', pad: false }) : ''}
    ${r.dropped && r.dropped.length ? r.dropped.map(dp => card(`<div class="decide"><div>${rowTitle(`You also have ${DOW_LONG[dp.dow]}s at ${fmtT(dp.t)} booked`, `From your earlier attempt (${plural(dp.count, 'lesson')}). Do you still want them?`)}</div><div class="decide__btns">${B('Cancel them', 'secondary', 'bkDroppedCancel', { args: [dp.key] })}${B('Keep them', 'primary', 'bkDroppedKeep', { args: [dp.key] })}</div></div>`, { cls: 'card--attn' })).join('') : ''}
    <div class="actions"><div>${B('Book more', 'secondary', '', { href: href('book') })}</div><div class="actions__r">${B('View my bookings', 'primary', '', { href: href('bookings') })}</div></div>`);
};

/* ================= Leaving a shared lesson (owner, 2026-10-13; ADR-026 P2, P4) ================= */
/** When the staying family must answer by: the start of the coach's notice period before the lesson. */
function bkAnswerBy(l) { const m = l.t - bkNotice(l) * 60, d = Math.floor(m / 1440); return `${dDow(addDays(l.iso, d))} at ${fmtT(m - d * 1440)}`; }
/** One skater leaves a shared lesson. Late: the one staying keeps their share. In time: the one staying is asked (askFull). */
function bkLeaveShared(l, sid, late) {
  if (l.sid === sid) { const w = l.with.shift(); Object.assign(l, { sid: w.sid, status: w.status, pay: w.pay, paidBy: w.paidBy, price: w.price }); }
  else l.with = l.with.filter(w => w.sid !== sid);
  if (!l.with.length) delete l.with;
  if (!late) l.askFull = { left: sid };
}
/** The staying family's choice, on Home and My bookings: keep it private at the full price, or cancel with no charge. */
function bkAskFullCards() {
  return myLessons().filter(l => l.askFull && !isStarted(l)).map(l => { const k = esc(firstName(student(l.sid).name)), who = esc(shortName(student(l.askFull.left).name));
    return card(`<div class="decide"><div>${rowTitle(`${who} can’t make ${k}’s shared lesson on ${dDow(l.iso)} at ${fmtT(l.t)}`, `Keep it as a private lesson for ${k} at the full ${money(l.full)} (${k}’s share was ${money(l.price)}), or cancel it with no charge. If you don’t answer by ${bkAnswerBy(l)}, it’s cancelled with no charge.`)}</div><div class="decide__btns">${B('Cancel, no charge', 'secondary', 'bkFullCancel', { args: [l.id] })}${B(`Keep at ${money(l.full)}`, 'primary', 'bkFullKeep', { args: [l.id] })}</div></div>`, { cls: 'card--attn' }); }).join('');
}

/* ================= My bookings ================= */
const bkKey = l => l.recurrenceId || (l.recurring ? `${lcoach(l)}-${l.sid}-${dowOf(l.iso)}-${l.t}` : null);
function bkArrangements() {
  const groups = {};
  for (const l of myLessons()) { const k = bkKey(l); if (k) (groups[k] ??= []).push(l); }
  return Object.entries(groups).map(([key, ls]) => {
    ls.sort((a, b) => a.iso.localeCompare(b.iso));
    const meta = bkState().arr[key] || {}, up = ls.filter(l => !isStarted(l)), future = ls.filter(l => l.iso > TODAY);
    // Shared while any lesson still to come has another skater, joined or invited (ADR-031 d9; B4, owner 2026-11-09).
    const shared = up.some(l => (l.with && l.with.length) || l.invited);
    return { key, sid: ls[0].sid, coach: lcoach(ls[0]), dow: dowOf(ls[0].iso), t: ls[0].t, len: ls[0].len, price: ls[0].price, interval: meta.interval || 1, end: meta.end || ls[ls.length - 1].iso, lessons: ls, up, future, shared, ended: !!meta.ended };
  }).filter(a => a.up.length && !a.ended).sort((a, b) => (a.sid + a.dow + a.t).localeCompare(b.sid + b.dow + b.t));
}
/* Shared lessons (ADR-026 d5 step 6). Family A sees the invited skater's display name and the invitation's status, nothing
   else. Family B sees the lesson they joined, with their share of the price, and can cancel it like Family A.
   Pricing and leaving (owner, 2026-10-13; ADR-026 P2, P4): the lesson's set price is split between the skaters. Whoever
   leaves, booker or invited, the same rules apply. Late (inside the notice period): the one leaving may be charged their
   share of the late-cancellation fee (half, for two skaters); the one staying keeps their share of the price. In time: the one staying is asked to keep it as a private
   lesson at the full price, or cancel with no charge; no answer by the start of the notice period cancels it, no charge. */
const bkInviteOf = l => l.inviteId ? state.invites.find(i => i.id === l.inviteId)
  : state.invites.find(i => i.fromSkater === l.sid && i.skater === l.invited && i.t === l.t && (i.series ? i.dow === dowOf(l.iso) && l.iso >= i.first && l.iso <= i.last : i.iso === l.iso));
const bkJoined = () => state.lessons.filter(l => l.with && !myKids().some(k => k.id === l.sid) && l.with.some(w => myKids().some(k => k.id === w.sid)));
const bkSkaterOf = l => myKids().some(k => k.id === l.sid) ? l.sid : l.with.find(w => myKids().some(k => k.id === w.sid)).sid;
function bkShareLine(l) {
  const mine = myKids().some(k => k.id === l.sid);
  if (!mine) return `${ic('users', 12)}Shared with ${esc(shortName(student(l.sid).name))}`;
  if (l.with && l.with.length) return `${ic('users', 12)}Shared with ${l.with.map(w => esc(shortName(student(w.sid).name))).join(' and ')}`;
  if (!l.invited) return '';
  const inv = bkInviteOf(l), st = inv ? inv.status : '';
  const what = { SENT: 'waiting for their family', DECLINED: 'declined · a private lesson', EXPIRED: 'expired · a private lesson' }[st];
  return what ? `${ic('users', 12)}Shared with ${esc(shortName(student(l.invited).name))} · ${what}` : '';
}
SCREENS.bookings = () => {
  if (isPendingFamily()) return bkPendingGate();
  const b = bkState(), kids = myActiveKids();
  const whoIdx = b.who === 'all' ? 0 : kids.findIndex(k => k.id === b.who) + 1;
  /* Coach filter (owner, 2026-10-13): "All coaches" or one coach, listing only coaches with upcoming lessons. It combines
     with the skater filter. Shown once two or more coaches have upcoming lessons. */
  const upcoming = [...myLessons(), ...bkJoined()].filter(l => !isStarted(l));
  const withLessons = myCoachIds().filter(cid => upcoming.some(l => lcoach(l) === cid));
  if (b.coach !== 'all' && !withLessons.includes(b.coach)) b.coach = 'all';
  const byCoach = l => b.coach === 'all' || lcoach(l) === b.coach;
  const upAll = upcoming.filter(l => (b.who === 'all' || bkSkaterOf(l) === b.who) && byCoach(l)).sort((x, y) => (x.iso + String(x.t).padStart(4, '0')).localeCompare(y.iso + String(y.t).padStart(4, '0')));
  const up = b.all ? upAll : upAll.slice(0, 10);
  const recent = myLessons().filter(l => isPast(l) && (b.who === 'all' || l.sid === b.who) && byCoach(l)).sort((x, y) => y.iso.localeCompare(x.iso) || y.t - x.t).slice(0, 4);
  const arrs = bkArrangements().filter(a => (b.who === 'all' || a.sid === b.who) && (b.coach === 'all' || a.coach === b.coach));
  const coachSel = withLessons.length > 1 ? `<div class="picker"><label class="picker__label" for="bk-filter-coach">Coach</label><select id="bk-filter-coach" class="ctl bk-coachsel" data-bind="ui.bk.coach"><option value="all"${b.coach === 'all' ? ' selected' : ''}>All coaches</option>${withLessons.map(cid => `<option value="${cid}"${cid === b.coach ? ' selected' : ''}>Coach ${esc(cName(coachById(cid)))}</option>`).join('')}</select></div>` : '';
  const who = b.who === 'all' ? '' : esc(firstName(student(b.who).name)), cf = b.coach === 'all' ? '' : esc(coachById(b.coach).first);
  const filtered = who || cf;
  const lrow = l => { const mine = myKids().some(k => k.id === l.sid), k = student(bkSkaterOf(l)), rec = mine && bkKey(l) ? bkArrangements().find(a => a.key === bkKey(l)) : null;
    const share = bkShareLine(l), inv = mine && l.invited ? bkInviteOf(l) : null;
    return row(`<span class="dateblock"><b>${parseIso(l.iso).getDate()}</b><small>${MON[parseIso(l.iso).getMonth()]}</small></span>${rowTitle(`${DOW[dowOf(l.iso)]} · ${fmtT(l.t)}${l.iso === TODAY ? ' ' + badge('Today', 'primary') : ''}`, `${esc(firstName(k.name))}${coachTag(l)} · ${l.len} min · ${money(myPrice(l))}${l.askFull ? ` ${badge('Needs your answer', 'warning', 'alert')}` : ''}${share ? `<span class="bk-shared">${share}</span>` : ''}`)}`,
      !mine ? `${badge('Shared lesson', 'neutral', 'users')}${B('Cancel', 'ghost', 'bkCancelOpen', { sm: true, args: [l.id] })}`
      : `${rec ? badge(rec.interval === 1 ? 'Repeats weekly' : `Every ${rec.interval} weeks`, 'neutral', 'repeat') : ''}${inv && inv.status === 'SENT' ? B('Withdraw invitation', 'ghost', 'bkWithdrawOpen', { sm: true, args: [inv.id] }) : ''}${B('Cancel', 'ghost', 'bkCancelOpen', { sm: true, args: [l.id] })}`); };
  return shell(`
    ${pageHead('My bookings', multiCoach() ? `Lessons with all your coaches` : `Lessons with Coach ${esc(coachName())}`, B('Book a lesson', 'primary', '', { href: href('book'), icon: 'plus' }))}
    ${bkAskFullCards()}
    ${kids.length > 1 || coachSel ? `<div class="bk-filter">${kids.length > 1 ? SEG(['Everyone', ...kids.map(k => esc(firstName(k.name)))], whoIdx, 'bkWho') : ''}${coachSel}</div>` : ''}
    ${card(up.length ? up.map(lrow).join('') + (upAll.length > 10 ? `<div class="card__foot">${B(b.all ? 'Show fewer' : `Show all ${upAll.length}`, 'secondary', 'bkShowAll', { sm: true })}</div>` : '')
      : filtered ? `<div class="pempty"><span class="pempty__icon">${ic('calendar', 22)}</span><b>Nothing booked${who ? ` for ${who}` : ''}${cf ? ` with Coach ${cf}` : ''}</b><span class="muted">Try another skater or coach, or book a lesson.</span>${B('Show everything', 'secondary', 'bkFilterClear')}</div>`
      : `<div class="pempty"><span class="pempty__icon">${ic('calendar', 22)}</span><b>Nothing booked</b><span class="muted">Book a time with Coach ${esc(coachFirst())}.</span>${B('Book a lesson', 'primary', '', { href: href('book') })}</div>`,
      { title: 'Upcoming', sub: up.length ? `${plural(upAll.length, 'lesson')}. Cancelling one doesn’t change the rest of its series.` : '', pad: false })}
    ${arrs.length ? card(arrs.map(a => { const k = student(a.sid); return row(`<span class="roundicon">${ic('repeat', 18)}</span>${rowTitle(`${esc(firstName(k.name))}${multiCoach() ? ` · Coach ${esc(coachById(a.coach).first)}` : ''} · ${DOW_LONG[a.dow]}s ${fmtT(a.t)}, ${bkEveryLabel(a.interval)}`, `Until ${dShort(a.end)} · ${plural(a.up.length, 'lesson')} left${a.shared ? ' · Shared: cancel one lesson or the whole series' : ''}`)}`, B('Change', 'secondary', 'bkRecOpen', { sm: true, args: [a.key] })); }).join(''),
      { title: 'Repeating lessons', sub: 'Shorten a series, make it less frequent, or stop it. To add lessons, book again.', pad: false }) : ''}
    ${recent.length ? card(recent.map(l => row(`<span class="dateblock bk-dateblock--past"><b>${parseIso(l.iso).getDate()}</b><small>${MON[parseIso(l.iso).getMonth()]}</small></span>${rowTitle(`${DOW[dowOf(l.iso)]} · ${fmtT(l.t)}`, `${esc(firstName(student(l.sid).name))}${coachTag(l)} · ${l.len} min · ${money(l.price)}`)}`, statusOf(l) === 'NOT_RECORDED' ? '' : statusBadge(l), { muted: true })).join(''), { title: 'Recent', pad: false }) : ''}`);
};

MODALS.bkCancel = m => {
  const l = state.lessons.find(x => x.id === m.id), sid = bkSkaterOf(l), k = student(sid), late = bkInsideNotice(l), rec = bkKey(l), cf = esc(coachById(lcoach(l)).first), h = bkNotice(l);
  const others = [l.sid, ...(l.with || []).map(w => w.sid)].filter(x => x && x !== sid), other = others.length ? esc(shortName(student(others[0]).name)) : '', mp = myPrice(l);
  return `<div class="dialog__icon dialog__icon--danger">${ic('calOff', 22)}</div>
    <h2 class="h2">Cancel ${esc(firstName(k.name))}’s lesson${multiCoach() ? ` with Coach ${cf}` : ''}?</h2>
    <div class="dialog__what"><b>${dDow(l.iso)} · ${fmtT(l.t)}</b><span>${l.len} min · ${money(mp)}${others.length ? ' · shared' : ''}</span></div>
    ${late ? banner('warning', `Inside the ${h}-hour notice period`, `${cf} may charge a late cancellation fee${others.length ? `. The lesson is shared, so ${esc(firstName(k.name))}’s share is half of it` : ''}.`) : `<p class="fine">Cancelling within ${h} hours of a lesson may incur a late cancellation fee.</p>`}
    ${others.length ? `<p class="fine">${late ? `${other} keeps the lesson at their share, ${money(mp)}.` : `${other}’s family is asked whether to keep it as a private lesson at the full ${money(l.full ?? mp * 2)}, or cancel it with no charge.`}</p>` : `<p class="fine">The time goes back on ${cf}’s calendar${late ? ` and ${cf} will be told, because it’s a late cancellation` : ''}.${rec ? ' Other lessons in this series aren’t affected.' : ''}</p>`}
    <div class="dialog__actions">${B('Keep lesson', 'secondary', 'closeModal')}${B('Cancel lesson', 'danger', 'bkCancel')}</div>`;
};

/* Family A can withdraw an invitation Family B hasn't confirmed (ADR-026 d5). Once confirmed the seat is booked, and
   Family A cancelling is an ordinary leave of a shared lesson (ADR-033 d4). */
MODALS.bkWithdraw = m => {
  const inv = state.invites.find(i => i.id === m.id), k = student(inv.fromSkater), b = student(inv.skater), n = invLessons(inv).length;
  return `<div class="dialog__icon dialog__icon--danger">${ic('users', 22)}</div>
    <h2 class="h2">Withdraw the invitation to ${esc(shortName(b.name))}?</h2>
    <div class="dialog__what"><b>${invWhen(inv)}</b><span>${inv.series ? invDates(inv) : `${inv.len} min`}</span></div>
    <p class="fine">Their family is told. ${esc(firstName(k.name))}’s ${n === 1 ? 'lesson stays' : 'lessons stay'} booked, just for ${esc(firstName(k.name))}.</p>
    <div class="dialog__actions">${B('Keep invitation', 'secondary', 'closeModal')}${B('Withdraw', 'danger', 'bkWithdraw')}</div>`;
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
  const r = b.rec, k = student(a.sid), plan = bkRecPlan(a, r), cut = plan.filter(p => p.cut), err = bkRecError(a, r);
  // The confirmation names every cancelled lesson inside the notice period (cancelation.md; B9, owner 2026-11-09).
  const lateLs = cut.filter(p => bkInsideNotice(p.l)).map(p => p.l), late = lateLs.length > 0, h = late ? bkNotice(lateLs[0]) : NOTICE_H;
  const lateNames = lateLs.map(l => `<b>${dDow(l.iso)} · ${fmtT(l.t)}</b>`), lateList = lateNames.length < 3 ? lateNames.join(' and ') : `${lateNames.slice(0, -1).join(', ')} and ${lateNames[lateNames.length - 1]}`;
  const opt = (i, icon, title, sub, extra = '') => `<div class="bk-opt"><button type="button" class="rcard${r.mode === i ? ' is-on' : ''}"${actAttr('bkRecMode', [i])} aria-pressed="${r.mode === i}"><span class="rcard__icon">${ic(icon, 20)}</span><span class="rcard__text"><span class="rcard__title">${title}</span><span class="rcard__sub">${sub}</span></span><span class="radio${r.mode === i ? ' is-on' : ''}"></span></button>${r.mode === i ? extra : ''}</div>`;
  const shown = plan.slice(0, 10);
  return shell(`
    ${pageHead(`${esc(firstName(k.name))} · ${DOW_LONG[a.dow]}s ${fmtT(a.t)}`, `${bkEveryLabel(a.interval)[0].toUpperCase() + bkEveryLabel(a.interval).slice(1)} until ${dShort(a.end)}. ${a.shared ? 'This series is shared, so you can only cancel it here.' : 'You can shorten this or make it less frequent.'} To add lessons, book again.`, '', crumb('bookings', 'My bookings'))}
    <div class="split split--even">
      ${card(`
        ${a.shared ? banner('info', 'This series is shared with another skater', 'You can cancel one lesson (from My bookings) or the whole series. Ending it earlier and making it less frequent come back once no lesson still to come is shared.') : `${opt(0, 'calendar', 'End it earlier', `Last lesson now: ${dShort(a.end)}`, `<div class="bk-optfield">${INP('bk-rec-end', 'New last date', 'ui.bk.rec.end', { type: 'date', live: true, error: err })}</div>`)}
        ${opt(1, 'repeat', 'Make it less frequent', a.interval >= 4 ? 'Already every 4 weeks, the least often' : `Now ${bkEveryLabel(a.interval)}`, a.interval >= 4 ? '' : `<div class="bk-optfield">${SEL('bk-rec-int', 'Repeats', 'ui.bk.rec.interval', [1, 2, 3, 4].filter(n => n > a.interval).map(n => [n, `Every ${n} weeks`]), { num: true })}</div>`)}`}
        ${opt(2, 'calOff', 'Cancel all future lessons', a.lessons.some(l => l.iso === TODAY && !isStarted(l)) ? 'Today’s lesson is kept' : `${plural(plan.length, 'lesson')} from tomorrow on`)}`, { title: 'What do you want to change?' })}
      ${card(`
        ${shown.length ? `<div class="timeline-list">${shown.map(p => `<div class="tli tli--${p.cut ? 'cut' : 'keep'}"><span class="tli__dot">${ic(p.cut ? 'x' : 'check', 12)}</span><span class="tli__d">${dDow(p.l.iso)} · ${fmtT(p.l.t)}</span><span class="tli__s">${p.cut ? (lateLs.includes(p.l) ? 'Cancelled · late' : 'Cancelled') : 'Kept'}</span></div>`).join('')}</div>${plan.length > shown.length ? `<p class="fine">and ${plural(plan.length - shown.length, 'more lesson')}: ${plural(plan.slice(10).filter(p => p.cut).length, 'cancelled', 'cancelled')}</p>` : ''}` : '<p class="fine">No lessons after today.</p>'}
        ${late ? banner('warning', `Inside the ${h}-hour notice period`, `${lateList} ${lateLs.length === 1 ? 'is' : 'are'} less than ${h} hours away. Cancelling ${lateLs.length === 1 ? 'it' : 'them'} may incur a late cancellation fee from Coach ${esc(coachById(a.coach).first)}.`) : ''}
        ${cut.length ? banner('warning', '', 'Cancelled times are released for other families. Switching back won’t get them back.') : ''}`,
        { title: 'What this will do', sub: err ? 'Fix the choice on the left to see the result.' : `${plural(cut.length, 'lesson')} cancelled · ${plural(plan.length - cut.length, 'lesson')} kept` })}
    </div>
    <div class="actions"><div>${B('Back', 'secondary', '', { href: href('bookings') })}</div><div class="actions__r">${B(cut.length ? `Cancel ${plural(cut.length, 'lesson')}` : 'Nothing to cancel', 'danger', 'bkRecApply', { lg: true, disabled: !!err || !cut.length })}</div></div>`, { width: 'wide' });
};

/* ================= actions ================= */
const bkSortSel = u => u.sel.sort((a, b) => (a.iso + String(a.t).padStart(4, '0')).localeCompare(b.iso + String(b.t).padStart(4, '0')));
Object.assign(ACTIONS, {
  bkKid(i) { const u = bkUi(); u.sid = bkKids()[i].id; u.sel = []; },
  /** Switch coach: the times picked with other coaches stay picked (the dropdown binds ui.book.coach; this is for presets). */
  bkCoach(cid) { bkUi().coach = cid; },
  bkMonth(ym) { bkUi().month = ym; },
  bkDay(iso) { const u = bkUi(); iso = bkClamp(iso); u.day = iso; u.week = false; if (BK_MONTHS.includes(iso.slice(0, 7))) u.month = iso.slice(0, 7); go('book-times'); },
  bkPickDay(iso, cid) { if (cid) bkUi().coach = cid; ACTIONS.bkDay(iso); },
  bkWeek(sun) { const u = bkUi(); let d = sun; for (let i = 0; i < 7; i++) if (bkOpen(addDays(sun, i)).length) { d = addDays(sun, i); break; } u.day = d; u.week = true; go('book-times'); },
  bkToggle(iso, t, cid = bkCid()) {
    const u = bkUi(), k = bkKid(), i = u.sel.findIndex(x => x.coach === cid && x.iso === iso && x.t === t);
    if (i >= 0) { u.sel.splice(i, 1); return; }
    const s = slotsFor(cid, iso).find(x => x.t === t); if (!s || bkSlotState(cid, iso, s, k).st !== 'open') return;
    u.sel.push({ coach: cid, iso, t, len: s.len, price: priceAt(cid, k.id, s) }); bkSortSel(u);
  },
  bkContinue() { const u = bkUi(); if (!u.sel.length) return; if (!u.until) u.until = addDays(u.sel[0].iso, 91); state.modal = { kind: 'bkConfirm' }; },
  bkRepeat() { const u = bkUi(); u.repeat = !u.repeat; if (u.repeat && !u.until) u.until = addDays(u.sel[0].iso, 91); },
  /** Book every occurrence. A taken or vanished time is skipped and reported; a time already held by this skater is recognised, never booked twice (ADR-006 d4b).
      Picks with several coaches go as one request per coach (ADR-025 d3); the demo books them in one go. */
  bkBook() {
    const u = bkUi(), b = bkState(), k = bkKid();
    if (bkUntilError(u) || !u.sel.length || bkShareBlocks(u, k)) return;
    const series = [], items = [], seriesRid = {}, shared = [];
    const sh = u.sel.some(bkShareable) ? bkShareState(u, k) : { st: 'empty' };
    for (const x of u.sel) {
      const key = u.repeat ? `${x.coach}|${dowOf(x.iso)}|${x.t}` : `${x.coach}|${x.iso}|${x.t}`;
      if (series.some(s => s.key === key)) continue;
      const rid = u.repeat ? `r${++b.seq}` : null; seriesRid[key] = rid;
      if (rid) b.arr[rid] = { interval: u.every, end: u.until };
      series.push({ key, coach: x.coach, repeat: u.repeat, dow: dowOf(x.iso), t: x.t, rid,
        title: u.repeat ? `${DOW_LONG[dowOf(x.iso)]}s · ${fmtT(x.t)}` : `${dDow(x.iso)} · ${fmtT(x.t)}`,
        sub: u.repeat ? `${x.len} min · ${money(x.price)} · ${bkEveryLabel(u.every)}, ${dShort(x.iso)} – ${dShort(u.until)}` : `${x.len} min · ${money(x.price)}` });
    }
    let n = state.lessons.length;
    for (const o of bkOccurrences(u)) {
      const it = { coach: o.coach, iso: o.iso, t: o.t, len: o.len, series: o.series };
      const own = myLessonAt(o.coach, o.iso, o.t);
      const slot = slotsFor(o.coach, o.iso).find(s => s.t === o.t && s.len === o.len);
      if (o.coach === u.failCoach) it.res = 'failed';
      else if (own && own.sid === k.id) it.res = 'mine';
      else if (!slot || lessonsFor(o.coach, o.iso).some(l => l.t === o.t)) { it.res = 'skipped'; it.why = BK_UNAVAILABLE; }
      else {
        it.res = 'booked';
        const l = { id: 'k' + (++n), ...(o.coach === DANA ? {} : { coach: o.coach }), sid: k.id, iso: o.iso, t: o.t, len: o.len, price: priceAt(o.coach, k.id, slot), status: 'BOOKED', pay: 'UNPAID', recurring: u.repeat, recurrenceId: seriesRid[it.series] || null };
        state.lessons.push(l);
        if (sh.st === 'found' && slot.maxSkaters >= 2) shared.push(l);
      }
      items.push(it);
    }
    state.lessons.sort((a, c) => (a.iso + String(a.t).padStart(4, '0')).localeCompare(c.iso + String(c.t).padStart(4, '0')));
    // A resubmission that leaves out a series the earlier request held: ask, never guess (ADR-006 d4b, decision 4).
    const dropped = [];
    if (items.some(i => i.res === 'mine') && u.lastReq && u.lastReq.sid === k.id) {
      for (const p of u.lastReq.series) {
        if (series.some(s => s.repeat && s.coach === p.coach && s.dow === p.dow && s.t === p.t)) continue;
        const left = myLessons().filter(l => l.sid === k.id && l.recurrenceId === p.rid && !isStarted(l));
        if (left.length) dropped.push({ key: p.rid, coach: p.coach, dow: p.dow, t: p.t, count: left.length });
      }
    }
    // Sharing (ADR-026 d5, ADR-033). The lesson is booked as normal; then another family's skater gets an invitation per
    // series, stamped on each booking as invitedStudentId. A sibling joins directly. Either way the skater is ACTIVE with
    // the coach: the share step refused anyone else (bkShareBlocks), and the transaction checks it again (ADR-033 d2).
    let share = null;
    if (shared.length) {
      const b = sh.s, direct = sh.sibling;
      for (const l of shared) if (direct) { l.with = [{ sid: b.id, status: 'BOOKED', pay: 'UNPAID', paidBy: null, price: null }]; splitPrice(l); } else l.invited = b.id;
      if (!sh.sibling) for (const key of [...new Set(shared.map(l => l.recurrenceId || l.id))]) {
        const ls = shared.filter(l => (l.recurrenceId || l.id) === key), f = ls[0], id = 'i' + (state.invites.length + 1);
        state.invites.push({ id, coach: lcoach(f), from: state.me.name, fromSkater: k.id, skater: b.id, t: f.t, len: f.len, status: 'SENT', sent: TODAY, clashes: [],
          ...(u.repeat ? { series: true, dow: dowOf(f.iso), first: f.iso, last: ls[ls.length - 1].iso } : { series: false, iso: f.iso }) });
        for (const l of ls) l.inviteId = id;
      }
      share = { sid: b.id, name: sh.name, sibling: sh.sibling, n: shared.length, coach: lcoach(shared[0]) };
    }
    const failed = [...new Set(items.filter(i => i.res === 'failed').map(i => i.coach))];
    u.result = { sid: k.id, series, items, dropped, share, failed, retry: { sel: u.sel.filter(x => failed.includes(x.coach)), repeat: u.repeat, every: u.every, until: u.until } };
    u.failCoach = null;
    u.lastReq = { sid: k.id, series: series.filter(s => s.repeat).map(s => ({ coach: s.coach, dow: s.dow, t: s.t, rid: s.rid })) };
    // Keep the earlier attempt's recurrence ids for series the resubmission recognised, so a later drop still finds them.
    for (const p of u.lastReq.series) { const hit = myLessons().find(l => l.sid === k.id && lcoach(l) === p.coach && dowOf(l.iso) === p.dow && l.t === p.t && l.recurrenceId); if (hit) p.rid = hit.recurrenceId; }
    u.sel = []; u.repeat = false; u.until = ''; u.every = 1; u.share = '';
    state.modal = null; go('book-result');
  },
  /** Resend one coach's picks after their request failed. Only that coach's picks go again. */
  bkRetry(cid) { const u = bkUi(), r = u.result; Object.assign(u, { sid: r.sid, sel: r.retry.sel.filter(x => x.coach === cid), repeat: r.retry.repeat, every: r.retry.every, until: r.retry.until, share: '' }); ACTIONS.bkBook(); },
  bkDroppedKeep(key) { const r = bkUi().result; r.dropped = r.dropped.filter(d => d.key !== key); state.flash = 'Kept. Those lessons stay booked.'; },
  bkDroppedCancel(key) {
    const r = bkUi().result, d = r.dropped.find(x => x.key === key);
    const cut = myLessons().filter(l => l.recurrenceId === key && l.iso > TODAY), told = bkToldLate(cut, d.coach || DANA);
    state.lessons = state.lessons.filter(l => !cut.includes(l));
    bkState().arr[key] = { ...(bkState().arr[key] || {}), ended: true };
    r.dropped = r.dropped.filter(x => x.key !== key);
    state.flash = `${plural(cut.length, 'lesson')} on ${DOW_LONG[d.dow]}s at ${fmtT(d.t)} cancelled.${told}`;
  },
  bkFilterClear() { const b = bkState(); b.who = 'all'; b.coach = 'all'; b.all = false; },
  bkWho(i) { const b = bkState(); b.who = i === 0 ? 'all' : myActiveKids()[i - 1].id; b.all = false; },
  bkShowAll() { const b = bkState(); b.all = !b.all; },
  bkCancelOpen(id) { state.modal = { kind: 'bkCancel', id }; },
  bkCancel() {
    const l = state.lessons.find(x => x.id === state.modal.id), sid = bkSkaterOf(l), k = student(sid), told = bkToldLate([l], lcoach(l));
    if (l.with && l.with.length) bkLeaveShared(l, sid, bkInsideNotice(l));   // after the invited family accepted: an ordinary leave (ADR-033 d4)
    else { const inv = l.invited ? bkInviteOf(l) : null; if (inv && inv.status === 'SENT' && invLessons(inv).every(x => x === l)) inv.status = 'WITHDRAWN';   // still INVITED: ends with the booking
      state.lessons = state.lessons.filter(x => x !== l); }
    state.modal = null; state.flash = `${firstName(k.name)}’s lesson on ${dDow(l.iso)} at ${fmtT(l.t)} is cancelled.${told}`;
  },
  /** The staying family keeps the lesson as a private one at the full price. */
  bkFullKeep(id) { const l = state.lessons.find(x => x.id === id); l.price = l.full; delete l.full; delete l.askFull; state.flash = `${firstName(student(l.sid).name)}’s lesson on ${dDow(l.iso)} at ${fmtT(l.t)} is now private, at ${money(l.price)}.`; },
  /** The staying family cancels with no charge. */
  bkFullCancel(id) { const l = state.lessons.find(x => x.id === id); state.lessons = state.lessons.filter(x => x !== l); state.flash = `${firstName(student(l.sid).name)}’s lesson on ${dDow(l.iso)} at ${fmtT(l.t)} is cancelled, with no charge.`; },
  /** Pick one of the family's own skaters to add; only one the coach has accepted has the button (ADR-033 d1). */
  bkShareSib(id) { bkUi().share = student(id).shareCode; },
  /** Ask the share-check again after it failed (a network error or the firewall's rate limit). */
  bkShareRetry() { const u = bkUi(); u.shareChk = null; },
  /** Demo bar: make the next share-checks fail, to show "Couldn't check that code". */
  bkShareFailToggle() { DEMO_SHARE_FAILS = !DEMO_SHARE_FAILS; const u = bkUi(); if (u.shareChk && u.shareChk.at !== 'checking') u.shareChk = null; },
  bkWithdrawOpen(id) { state.modal = { kind: 'bkWithdraw', id }; },
  bkWithdraw() {
    const inv = state.invites.find(i => i.id === state.modal.id), b = student(inv.skater);
    for (const l of invLessons(inv)) if (bkInviteOf(l) === inv) { delete l.invited; delete l.inviteId; }
    inv.status = 'WITHDRAWN';
    state.modal = null; state.flash = `Invitation to ${shortName(b.name)} withdrawn. Their family has been told.`;
  },
  bkRecOpen(key) { const a = bkArrangements().find(x => x.key === key); bkState().rec = { key, mode: 1, end: '', interval: Math.min(4, a.interval + 1) }; if (a.interval >= 4) bkState().rec.mode = 0; if (a.shared) bkState().rec.mode = 2; go('recurrence'); },
  /** A shared series can only be cancelled whole here; ending it earlier and making it less frequent are hidden (B4). */
  bkRecMode(i) { const b = bkState(), a = bkArrangements().find(x => x.key === b.rec.key); if (a && a.shared && i !== 2) return; b.rec.mode = i; },
  bkRecApply() {
    const b = bkState(), r = b.rec, a = bkArrangements().find(x => x.key === r.key);
    if (!a || bkRecError(a, r) || (a.shared && r.mode !== 2)) return;
    const cut = bkRecPlan(a, r).filter(p => p.cut).map(p => p.l), k = student(a.sid), told = bkToldLate(cut, a.coach);
    state.lessons = state.lessons.filter(l => !cut.includes(l));
    const meta = b.arr[r.key] ||= {};
    if (r.mode === 0) meta.end = r.end; else if (r.mode === 1) meta.interval = r.interval; else meta.ended = true;
    if (r.mode !== 0 && !meta.end) meta.end = a.end;
    b.rec = null;
    go('bookings');
    state.flash = `${firstName(k.name)}’s ${DOW_LONG[a.dow]} lessons: ${plural(cut.length, 'lesson')} cancelled. ${r.mode === 2 ? 'The series has stopped.' : r.mode === 1 ? `Now every ${r.interval} weeks.` : `Last lesson ${dShort(r.end)}.`}${told}`;
  },
});

/* ================= presets ================= */
/** Pick times for a skater; an entry [iso, t, coachId] picks with that coach (Coach Dana when left out). */
const bkSel = (st, sid, list) => { const u = bkUi(); Object.assign(u, { sid, coach: DANA, month: list[0][0].slice(0, 7), day: list[0][0], week: false, sel: [], repeat: false, every: 1, until: '' }); for (const [iso, t, cid] of list) ACTIONS.bkToggle(iso, t, cid || DANA); };
/** Stage a request directly, the way a resubmitted request arrives: times already held by this skater included. */
const bkStage = (sid, list) => { const u = bkUi(); u.sid = sid; u.sel = list.map(([iso, t]) => { const s = slotsOn(iso).find(x => x.t === t); return { coach: DANA, iso, t, len: s.len, price: priceAt(DANA, sid, s) }; }); };
/** Mia's Monday, Oct 19 at 6:00 shared with another family's skater (Ella by default), price split. */
const bkShareDemo = (st, sid = 's3') => { const l = st.lessons.find(x => x.sid === 's1' && x.iso === '2026-10-19' && x.t === 360); l.with = [{ sid, status: 'BOOKED', pay: 'UNPAID', paidBy: null, price: null }]; splitPrice(l); return l; };
/* Mia's picks across two coaches: Mon 19 9:30 and Wed 21 8:00 with Coach Dana, Tue 20 5:00 PM with Coach Ben. */
const bkTwoCoaches = st => { bkSel(st, 's1', [['2026-10-19', 570], ['2026-10-21', 480], ['2026-10-20', 1020, 'ben']]); Object.assign(st.ui.book, { coach: 'ben', day: '2026-10-21' }); };
PRESETS.push(
  { id: 'ClientBookCalendar', file: 'book-calendar', group: 'Book a lesson', title: '1 · Pick a day', note: 'Redesigned from Forest Main: October with open-time counts per day, week links on the left, the three bookable months, a skater switch, and (ADR-025) a Coach dropdown listing the coaches the skater is with.', setup: st => { st.screen = 'book'; } },
  { id: 'ClientBookCoachSwitch', file: 'book-times-coach-switch', group: 'Book a lesson', title: '2 · Pick your times — switched coach', note: 'New (ADR-025 d3, d5). Grace picked two times with Coach Dana, then chose Coach Ben in the Coach dropdown. Ben’s Wednesday shows; the Dana picks are kept, and Your picks groups them by coach with a total per coach, never one total. Ben’s 7:30 overlaps Mia’s 8:00 pick with Dana, so it’s marked, not blocked. Changing skater still clears the picks.', setup: st => { st.screen = 'book-times'; bkTwoCoaches(st); } },
  { id: 'ClientBookCoachConfirm', file: 'book-confirm-two-coaches', group: 'Book a lesson', title: '3 · Confirm — two coaches and a clash', note: 'New (ADR-025 d5). Picks with Coach Dana and Coach Ben in one pop-up, listed per coach, with a lesson count and total per coach. Repeat and Until apply to every pick, whichever coach (owner, 2026-10-13). Ben’s Wed 7:30–8:30 overlaps Dana’s 8:00, so the clash is listed and the button says Book anyway. Every coach’s notice period is 24 hours in MVP; the “coaches can have different notice periods” note is Phase 2 (B6, 2026-11-08).', setup: st => { st.screen = 'book-times'; bkTwoCoaches(st); ACTIONS.bkToggle('2026-10-21', 450, 'ben'); Object.assign(st.ui.book, { repeat: true, every: 1, until: '2026-11-16' }); st.modal = { kind: 'bkConfirm' }; } },
  { id: 'ClientBookCoachResult', file: 'book-result-two-coaches', group: 'Book a lesson', title: '4 · Result — two coaches', note: 'New. The same request after booking, split into one section per coach, each with its own count and series cards. Ben is away at a seminar on Thu, Oct 29, but Mia’s picks are Tuesdays and Wednesdays, so nothing is skipped.', setup: st => { st.screen = 'book-times'; bkTwoCoaches(st); ACTIONS.bkToggle('2026-10-21', 450, 'ben'); Object.assign(st.ui.book, { repeat: true, every: 1, until: '2026-11-16' }); ACTIONS.bkBook(); } },
  { id: 'ClientBookCoachFailed', file: 'book-result-coach-failed', group: 'Book a lesson', title: '4 · Result — one coach didn’t go through', note: 'New (owner, 2026-10-13). The same two-coach request, but Coach Ben’s booking failed (simulated). The result is split by coach: Dana’s lessons are booked and confirmed; Ben’s section says nothing was booked with him and offers Try again, which resends only Ben’s picks, so Dana’s are never booked twice.', setup: st => { st.screen = 'book-times'; bkTwoCoaches(st); ACTIONS.bkToggle('2026-10-21', 450, 'ben'); Object.assign(st.ui.book, { repeat: true, every: 1, until: '2026-11-16', failCoach: 'ben' }); ACTIONS.bkBook(); } },
  { id: 'ClientBookNoTimes', file: 'book-no-times', group: 'Book a lesson', title: '1 · Coach hasn’t posted times', note: 'Redesigned from Forest ClientNoTimesYet: the same page when the coach has no schedule yet, with a ghost calendar and a “No lesson times yet” message.', setup: st => { st.screen = 'book'; st.ui.book = { month: '2026-10', sel: [], noSchedule: true }; } },
  { id: 'ClientBookTimes', file: 'book-times', group: 'Book a lesson', title: '2 · Pick your times', note: 'Redesigned from Forest Timeline: Monday, Oct 19 as a measured timeline, two times picked for Mia; taken times say only “Taken”, the family’s own lessons are named.', setup: st => { st.screen = 'book-times'; bkSel(st, 's1', [['2026-10-19', 570], ['2026-10-19', 960]]); } },
  { id: 'ClientBookConfirm', file: 'book-confirm', group: 'Book a lesson', title: '3 · Confirm & repeat', note: 'Redesigned from Forest Recurring: the pop-up with Repeat ticked, every week until Jan 18, and the lesson count on the button.', setup: st => { st.screen = 'book-times'; bkSel(st, 's1', [['2026-10-19', 570], ['2026-10-19', 960]]); Object.assign(st.ui.book, { repeat: true, every: 1, until: '2027-01-18' }); st.modal = { kind: 'bkConfirm' }; } },
  { id: 'ClientBookResult', file: 'book-result', group: 'Book a lesson', title: '4 · Result — some dates skipped', note: 'Redesigned from Forest Confirmation: Mondays at 9:00 for Mia. Another family took Nov 9 while Grace was choosing, Thanksgiving week is time off, and the holiday camp week has no 30-minute times. Each skipped date shows the same message, “That time was taken or no longer exists.”, so no family learns about another’s booking (B1, 2026-11-08; wording 2026-11-09).', setup: st => {
    st.screen = 'book-times'; bkSel(st, 's1', [['2026-11-02', 540]]); Object.assign(st.ui.book, { repeat: true, every: 1, until: '2027-01-18' });
    st.lessons.push({ id: 'k-other', sid: 's3', iso: '2026-11-09', t: 540, len: 30, price: 50, status: 'BOOKED', pay: 'UNPAID', recurring: false });
    ACTIONS.bkBook(); } },
  { id: 'ClientBookResubmit', file: 'book-result-resubmit', group: 'Book a lesson', title: '4 · Result after resubmitting', note: 'Redesigned from Forest ClientBookingResubmit: the first attempt (Mondays 9:30 and Wednesdays 7:00) hit an error after booking. The resubmission recognises the Mondays as Mia’s, books Fridays, and asks about the Wednesdays.', setup: st => {
    st.screen = 'book-times';
    bkSel(st, 's1', [['2026-10-19', 570], ['2026-10-21', 420]]); Object.assign(st.ui.book, { repeat: true, every: 1, until: '2026-12-14' }); ACTIONS.bkBook();
    bkStage('s1', [['2026-10-19', 570], ['2026-10-16', 510]]); Object.assign(st.ui.book, { repeat: true, every: 1, until: '2026-12-14' }); ACTIONS.bkBook(); } },
  { id: 'ClientBookings', file: 'bookings', group: 'My bookings', title: 'My bookings', note: 'Redesigned from Forest ClientMyBookings: upcoming lessons by date with Cancel on each, a filter per skater, the repeating series with Change, and recent attendance. Mia’s Friday 8:30 is shared with Zoe O., waiting for Zoe’s family to answer (ADR-026): Grace sees only Zoe’s display name and the status, and can withdraw the invitation.', setup: st => { st.screen = 'bookings'; } },
  { id: 'ClientBookingsCancel', file: 'bookings-cancel', group: 'My bookings', title: 'Cancel a lesson', note: 'Redesigned from Forest ClientCancelConfirm. None of the sample lessons falls inside 24 hours, so Grace has booked Mia at 10:30 this morning to show the “may incur a fee” warning.', setup: st => { st.screen = 'bookings'; st.lessons.push({ id: 'k-today', sid: 's1', iso: TODAY, t: 630, len: 30, price: 50, status: 'BOOKED', pay: 'UNPAID', recurring: false }); st.modal = { kind: 'bkCancel', id: 'k-today' }; } },
  { id: 'ClientShareCancel', file: 'bookings-cancel-shared', group: 'Shared lessons', title: 'Cancel a shared lesson — in time', note: 'New (owner, 2026-10-13). Mia shares Monday, Oct 19 at 6:00 with Ella A.: the $50 lesson is split, $25 each. Cancelling before the 24-hour notice period means Ella’s family is asked to keep it as a private lesson at the full $50, or cancel with no charge. Inside the notice period the pop-up says instead that Mia may be charged her share of the late-cancellation fee (half, for two skaters) and Ella keeps her $25 share of the price.', setup: st => { st.screen = 'bookings'; const l = bkShareDemo(st); st.modal = { kind: 'bkCancel', id: l.id }; } },
  { id: 'ClientShareLeft', file: 'home-share-left', group: 'Shared lessons', title: 'Home — the other skater cancelled', note: 'New (owner, 2026-10-13). Mia shared Monday, Oct 19 at 6:00 with Owen B., and Owen cancelled in time. Grace chooses: keep it private at the full $50, or cancel with no charge. With no answer by Sunday at 6:00 AM (the start of the notice period), it’s cancelled with no charge. The same card shows on My bookings.', setup: st => { st.screen = 'home'; const l = bkShareDemo(st, 's7'); bkLeaveShared(l, 's7', false); } },
  { id: 'ClientShareConfirm', file: 'book-share-confirm', group: 'Shared lessons', title: 'Confirm — share this lesson', note: 'New (ADR-026 d5). Mia’s Monday 9:30 is on morning ice, which can be shared, so the pop-up shows the share box; the 4:00 PM power hour is private, so the box says only 9:30 can be shared. ELL-3HTVP checks out as “Ella A.”: the share-check returns only her display name and that she’s on Coach Dana’s student list (ADR-033 d2a). Below the box, Grace’s own skaters: Noah is Coach Dana’s student, so he can be added directly.', setup: st => { st.screen = 'book-times'; bkSel(st, 's1', [['2026-10-19', 570], ['2026-10-19', 960]]); st.ui.book.share = 'ELL-3HTVP'; st.modal = { kind: 'bkConfirm' }; } },
  { id: 'ClientShareWrong', file: 'book-share-no-match', group: 'Shared lessons', title: 'Confirm — share code doesn’t match', note: 'New. A repeating booking shares every lesson in the series. The code matches no skater, so Book stays disabled until it’s fixed or cleared.', setup: st => { st.screen = 'book-times'; bkSel(st, 's1', [['2026-10-19', 570]]); Object.assign(st.ui.book, { repeat: true, every: 1, until: '2026-11-16', share: 'ELL-3HTVR' }); st.modal = { kind: 'bkConfirm' }; } },
  { id: 'ClientShareChecking', file: 'book-share-checking', group: 'Shared lessons', title: 'Confirm — checking the share code', note: 'New (ADR-033 2a, amended 2026-10-20). Grace has typed the whole of ELL-3HTVP and the share-check hasn’t answered yet. The box says it’s checking, and Book stays off until it answers. Changing the code, or picking another coach’s lesson, asks again.', setup: st => { st.screen = 'book-times'; bkSel(st, 's1', [['2026-10-19', 570]]); st.ui.book.share = 'ELL-3HTVP'; st.ui.book.shareChk = { key: `ELL3HTVP|${DANA}`, at: 'checking' }; st.modal = { kind: 'bkConfirm' }; } },
  { id: 'ClientShareCheckFailed', file: 'book-share-check-failed', group: 'Shared lessons', title: 'Confirm — couldn’t check the share code', note: 'New (ADR-033 2a, amended 2026-10-20). The share-check didn’t answer: no signal, or too many tries from one address (the firewall allows 20 in 5 minutes). The box says “Couldn’t check that code. Try again.” with a Try again button; Book stays off until the code is checked or the box is cleared. Clearing it books a private lesson.', setup: st => { st.screen = 'book-times'; bkSel(st, 's1', [['2026-10-19', 570]]); st.ui.book.share = 'ELL-3HTVP'; st.ui.book.shareChk = { key: `ELL3HTVP|${DANA}`, at: 'failed' }; st.modal = { kind: 'bkConfirm' }; } },
  { id: 'ClientShareOwnCode', file: 'book-share-own-code', group: 'Shared lessons', title: 'Confirm — skater’s own share code', note: 'New. Grace entered Mia’s own share code while booking for Mia. The box says so and asks for the other skater’s code; Book stays off until it’s fixed or cleared, as with a code that matches no one.', setup: st => { st.screen = 'book-times'; bkSel(st, 's1', [['2026-10-19', 570]]); st.ui.book.share = st.students.find(x => x.id === 's1').shareCode; st.modal = { kind: 'bkConfirm' }; } },
  { id: 'ClientShareResult', file: 'book-share-result', group: 'Shared lessons', title: 'Result — invitation sent', note: 'New. Mondays at 9:30 booked for Mia as normal, private until Ella’s family accepts; their invitation email has gone.', setup: st => { st.screen = 'book-times'; bkSel(st, 's1', [['2026-10-19', 570]]); Object.assign(st.ui.book, { repeat: true, every: 1, until: '2026-11-16', share: 'ELL-3HTVP' }); ACTIONS.bkBook(); } },
  { id: 'ClientShareBookings', file: 'bookings-shared', group: 'Shared lessons', title: 'My bookings — shared lessons', note: 'New (ADR-026 d5 step 6). Mia’s Mondays wait for Ella’s family, and her Friday 8:30 for Zoe’s; both can be withdrawn until the family answers. Once they accept, the seat is booked (ADR-033).', setup: st => { bkSel(st, 's1', [['2026-10-19', 570]]); Object.assign(st.ui.book, { repeat: true, every: 1, until: '2026-11-16', share: 'ELL-3HTVP' }); ACTIONS.bkBook(); go('bookings'); } },
  { id: 'ClientShareWithdraw', file: 'bookings-withdraw-invite', group: 'Shared lessons', title: 'Withdraw an invitation', note: 'New. Family A can withdraw an invitation Family B hasn’t answered. Mia’s lessons stay booked as private lessons.', setup: st => { bkSel(st, 's1', [['2026-10-19', 570]]); Object.assign(st.ui.book, { repeat: true, every: 1, until: '2026-11-16', share: 'ELL-3HTVP' }); ACTIONS.bkBook(); go('bookings'); st.modal = { kind: 'bkWithdraw', id: st.invites[st.invites.length - 1].id }; } },
  { id: 'ClientInvite', file: 'invite', group: 'Shared lessons', title: 'Invitation to share a lesson', note: 'New (ADR-026 d5 steps 3–4). Only a skater the coach has already accepted can be invited (ADR-033). From the invitation email, after signing in. Owen Brooks invited Noah to share his Wednesday 8:30 series; one clash with Noah’s lesson with another coach is shown, and Go ahead joins Noah to every lesson now. The price is Noah’s share: the lesson’s price split between the two skaters (owner, 2026-10-13).', setup: st => { st.screen = 'invite'; st.ui.inv = { id: 'i1' }; } },
  { id: 'ClientInviteAccepted', file: 'invite-accepted', group: 'Shared lessons', title: 'Invitation — accepted, seat booked', note: 'New (ADR-033 d3). Tom accepted Grace’s invitation for Zoe, who is already Coach Dana’s student, so Zoe’s seat in Mia’s Fri, Oct 16 8:30 is booked straight away: invite → accept → booked, with nothing to wait for. If Grace cancels now, it’s an ordinary leave of a shared lesson (ADR-033 d4).', setup: st => { acAsTom(st); st.ui.inv = { id: 'i2' }; ACTIONS.invGo(); st.screen = 'invite'; } },
  { id: 'ClientShareNotStudent', file: 'book-share-not-student', group: 'Shared lessons', title: 'Confirm — skater isn’t the coach’s student', note: 'New (ADR-033 d2, d2a). Grace is booking Noah’s Monday 9:30 and enters MIA-7R2LC. The code is real, but Mia Reyes skates with another coach, so the share-check answers onCoachRoster: false and the booking stops at the share step with the refusal. Book stays off and nothing is booked until the code is cleared. A skater still waiting for Coach Dana’s approval gets the same answer, so the page never says whether a request is waiting.', setup: st => { st.screen = 'book-times'; bkSel(st, 's2', [['2026-10-19', 570]]); st.ui.book.share = 'MIA-7R2LC'; st.modal = { kind: 'bkConfirm' }; } },
  { id: 'ClientShareSiblingWaiting', file: 'book-share-sibling-waiting', group: 'Shared lessons', title: 'Confirm — sibling not yet accepted', note: 'New (ADR-033 d1). Grace added Lily under Profile yesterday, and Coach Dana hasn’t accepted her yet. Under Your skaters, Noah can be added; Lily is shown as not available to add until Coach Dana accepts them, with no button. Typing Lily’s code gives the same answer, and Book stays off.', setup: st => { st.students.push({ id: 's9', name: 'Lily Chen', minor: true, rel: 'Guardian', client: 'Grace Chen', email: 'grace.chen@example.com', phone: '(205) 555-0110', sms: true, status: 'PENDING', org: 0, orgNum: '3407715', since: '2026-10-13', shareCode: 'LIL-6T2NB' }); st.screen = 'book-times'; bkSel(st, 's1', [['2026-10-19', 570]]); st.ui.book.share = 'LIL-6T2NB'; st.modal = { kind: 'bkConfirm' }; } },
  { id: 'ClientBookingsCoach', file: 'bookings-coach-filter', group: 'My bookings', title: 'My bookings — filter by coach', note: 'New (owner, 2026-10-13). A Coach dropdown beside the skater filter, “All coaches” by default, listing only coaches with upcoming lessons. The two combine: Mia with Coach Ben shows only her Tuesday power-skating lessons, and her repeating series with Ben.', setup: st => { st.screen = 'bookings'; Object.assign(bkState(), { who: 's1', coach: 'ben' }); } },
  { id: 'ClientRecurrenceShared', file: 'recurrence-shared', group: 'My bookings', title: 'Change a repeating lesson — shared', note: 'New (B4, owner 2026-11-09; ADR-031 d9). Mia’s Mondays are shared with Ella, who is still invited, so only “Cancel all future lessons” is offered. End it earlier and Make it less frequent come back once no lesson still to come is shared.', setup: st => { bkSel(st, 's1', [['2026-10-19', 570]]); Object.assign(st.ui.book, { repeat: true, every: 1, until: '2026-11-16', share: 'ELL-3HTVP' }); ACTIONS.bkBook(); const a = bkArrangements().find(x => x.sid === 's1' && x.dow === 1 && x.t === 570); ACTIONS.bkRecOpen(a.key); } },
  { id: 'ClientRecurrenceLate', file: 'recurrence-late', group: 'My bookings', title: 'Change a repeating lesson — a late lesson', note: 'New (B9, owner 2026-11-09). It’s Wednesday at 6:00 PM and Grace cancels Mia’s Thursdays with Coach Ben. Tomorrow’s 4:15 PM is less than 24 hours away, so the warning names it and the list marks it late. MVP says “may incur”; nothing is charged.', setup: st => { NOW_MIN = 18 * 60; bkSel(st, 's1', [['2026-10-15', 975, 'ben']]); Object.assign(st.ui.book, { coach: 'ben', repeat: true, every: 1, until: '2026-11-19' }); ACTIONS.bkBook(); const a = bkArrangements().find(x => x.sid === 's1' && x.dow === 4 && x.t === 975); ACTIONS.bkRecOpen(a.key); st.ui.bk.rec.mode = 2; go('recurrence'); } },
  { id: 'ClientRecurrence', file: 'recurrence', group: 'My bookings', title: 'Change a repeating lesson', note: 'Redesigned from Forest ClientRecurrence: Mia’s Wednesdays at 6:30 reduced to every 2 weeks, with every affected date previewed as kept or cancelled.', setup: st => { const a = bkArrangements().find(x => x.sid === 's1' && x.dow === 3 && x.t === 390); ACTIONS.bkRecOpen(a.key); st.ui.bk.rec.mode = 1; st.ui.bk.rec.interval = 2; } },
);
