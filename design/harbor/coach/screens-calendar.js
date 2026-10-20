/* BladeBook coach website — Calendar group: month, week, day, and the cancel preview.
   Registers SCREENS 'calendar-month', 'calendar-week', 'calendar-day', 'cancel-preview'.
   State lives in state.ui.cal. Sources: FeatureDecriptions/Coach Dashboard on website.md,
   cancelation.md, ADR-009 (coach cancellation, release or hold), ADR-026 d6 (every skater in a shared lesson). */

const calUi = () => (state.ui.cal ??= { month: TODAY.slice(0, 8) + '01', week: weekStart(TODAY), day: TODAY, sel: [], hold: {}, back: 'calendar-week', what: '' });

/** Every slot on a date, merged with what occupies it: [{t, len, price, lesson|null}]. */
function calSlots(iso) {
  const ls = lessonsOn(iso);
  const out = slotsOn(iso).map(s => ({ ...s, lesson: ls.find(l => l.t === s.t) || null }));
  for (const l of ls) if (!out.some(s => s.t === l.t)) out.push({ t: l.t, len: l.len, price: l.price, lesson: l });
  return out.sort((a, b) => a.t - b.t);
}
const calSlotPast = (iso, s) => iso < TODAY || (iso === TODAY && s.t + s.len <= NOW_MIN);
const calCancellable = l => !!(l && l.sid && !isStarted(l));
const calFuture = iso => lessonsOn(iso).filter(calCancellable);
const calWhere = iso => { const sp = specialOn(iso); return sp ? (sp.kind === 'timeoff' ? `Time off · ${sp.name}` : `Special schedule · ${sp.name}`) : ''; };
const calViewSeg = on => SEG(['Month', 'Week', 'Day'], on, 'calView');

function calStartCancel(ids, back, what) {
  const c = calUi();
  c.sel = ids.filter(id => calCancellable(state.lessons.find(l => l.id === id)));
  c.hold = {}; c.back = back; c.what = what;
  go('cancel-preview');
}

Object.assign(ACTIONS, {
  calView(i) { go(['calendar-month', 'calendar-week', 'calendar-day'][i]); },
  calMonth(d) { const c = calUi(), m = parseIso(c.month); m.setMonth(m.getMonth() + d); c.month = toIso(m); },
  calMonthToday() { calUi().month = TODAY.slice(0, 8) + '01'; },
  calWeek(d) { const c = calUi(); c.week = addDays(c.week, 7 * d); },
  calWeekToday() { calUi().week = weekStart(TODAY); },
  calDay(d) { const c = calUi(); c.day = addDays(c.day, d); },
  calDayToday() { calUi().day = TODAY; },
  calOpenDay(iso) { const c = calUi(); c.day = iso; c.week = weekStart(iso); go('calendar-day'); },
  calOpenWeek(iso) { const c = calUi(); c.week = weekStart(iso); c.day = iso; go('calendar-week'); },
  calCancelOne(id, back) { const l = state.lessons.find(x => x.id === id); calStartCancel([id], back, `${whoIn(l)}’s lesson`); },
  calCancelDay(iso, back) { calStartCancel(calFuture(iso).map(l => l.id), back, dDow(iso)); },
  calCancelRest() {
    const c = calUi(), ids = [];
    for (let i = 0; i < 7; i++) ids.push(...calFuture(addDays(c.week, i)).map(l => l.id));
    calStartCancel(ids, 'calendar-week', 'the rest of the week');
  },
  calHold(id, i) { calUi().hold[id] = i === 1; },
  calReleaseAll() { calUi().hold = {}; },
  calBack() { go(calUi().back); },
  calAccept() {
    const c = calUi();
    const sel = state.lessons.filter(l => c.sel.includes(l.id) && calCancellable(l));
    const fams = families(sel.flatMap(l => skatersIn(l).map(p => student(p.sid))));
    for (const l of sel) {
      // An unanswered shared-lesson invitation can't join a cancelled lesson, so it ends as EXPIRED (ADR-026 d5).
      if (l.invited) for (const inv of state.invites.filter(i => i.skater === l.invited && i.iso === l.iso && i.t === l.t && i.status === 'SENT')) inv.status = 'EXPIRED';
      if (c.hold[l.id]) { Object.assign(l, { sid: null, status: 'COACH_HELD', price: 0, pay: null, recurring: false }); delete l.with; delete l.invited; }
      else state.lessons = state.lessons.filter(x => x !== l);
    }
    const held = sel.filter(l => c.hold[l.id]).length;
    c.sel = []; c.hold = {};
    go(c.back);
    state.flash = `${plural(sel.length, 'lesson')} cancelled${held ? `, ${held} held closed` : ''}. ${plural(fams.length, 'family', 'families')} will be emailed.`;
  },
});

/* ---------- Month ---------- */
SCREENS['calendar-month'] = () => {
  const c = calUi(), m = parseIso(c.month), y = m.getFullYear(), mo = m.getMonth();
  const first = c.month, last = toIso(new Date(y, mo + 1, 0));
  const weeks = [];
  for (let ws = weekStart(first); ws <= last; ws = addDays(ws, 7)) weeks.push(ws);
  let booked = 0, open = 0;
  const cell = iso => {
    const inMonth = iso >= first && iso <= last, slots = calSlots(iso), sp = specialOn(iso);
    const b = slots.filter(s => s.lesson && s.lesson.sid).length, o = slots.filter(s => !s.lesson && !calSlotPast(iso, s)).length;
    if (inMonth) { booked += b; open += o; }
    const cls = `cal-day${slots.length ? '' : ' cal-day--off'}${inMonth ? '' : ' cal-day--out'}${iso === TODAY ? ' is-today' : ''}${iso < TODAY ? ' cal-day--past' : ''}`;
    const tag = sp ? `<span class="cal-chip cal-chip--${sp.kind === 'timeoff' ? 'off' : 'special'}">${sp.kind === 'timeoff' ? 'Time off' : 'Camp'}</span>` : '';
    const meta = slots.length ? `${b ? `<span class="cal-chip">${b} booked</span>` : ''}${o ? `<span class="cal-chip cal-chip--open">${o} open</span>` : ''}` : (sp ? '' : '<span class="cal-day__none">No lessons</span>');
    return `<button type="button" class="${cls}"${actAttr('calOpenDay', [iso])} aria-label="${dLong(iso)}: ${b} booked, ${o} open"><span class="cal-day__num">${parseIso(iso).getDate()}${iso === TODAY ? '<em>Today</em>' : ''}</span><span class="cal-day__meta">${tag}${meta}</span></button>`;
  };
  const rows = weeks.map((ws, i) => {
    const days = [0, 1, 2, 3, 4, 5, 6].map(k => cell(addDays(ws, k))).join('');
    return `<button type="button" class="cal-wk${ws <= TODAY && TODAY <= addDays(ws, 6) ? ' is-now' : ''}"${actAttr('calOpenWeek', [ws < first ? first : ws])}><b>Week ${i + 1}</b><small>${dShort(ws < first ? first : ws)} – ${dShort(addDays(ws, 6) > last ? last : addDays(ws, 6))}</small></button>${days}`;
  }).join('');
  const body = `
    <div class="calbar"><button type="button" class="iconbtn" aria-label="Previous month"${actAttr('calMonth', [-1])}>${ic('chevL', 18)}</button><div class="calbar__title">${MON_LONG[mo]} ${y}</div><button type="button" class="iconbtn" aria-label="Next month"${actAttr('calMonth', [1])}>${ic('chevR', 18)}</button>${B('Today', 'secondary', 'calMonthToday', { sm: true })}</div>
    <div class="cal-scroll"><div class="cal-month"><span class="cal-month__h"></span>${DOW.map(d => `<span class="cal-month__h">${d}</span>`).join('')}${rows}</div></div>
    <div class="legend"><span class="legend__item"><i class="sw sw--booked"></i>Booked lessons</span><span class="legend__item"><i class="sw sw--open"></i>Open times left</span><span class="legend__item"><i class="sw sw--off"></i>No lessons scheduled</span><span class="legend__note">Pick a day for its lessons, or a week on the left.</span></div>`;
  return shell(`
    ${pageHead('Calendar', `${MON_LONG[mo]}: ${plural(booked, 'lesson')} booked, ${plural(open, 'open time')} left.`, calViewSeg(0))}
    ${card(body)}`, { width: 'wide' });
};

/* ---------- Week ---------- */
SCREENS['calendar-week'] = () => {
  const c = calUi(), ws = c.week, we = addDays(ws, 6);
  let rest = 0;
  const cols = [0, 1, 2, 3, 4, 5, 6].map(k => {
    const iso = addDays(ws, k), slots = calSlots(iso), fut = calFuture(iso), sp = specialOn(iso);
    rest += fut.length;
    const colCls = iso < TODAY ? ' week__col--past' : iso === TODAY ? ' week__col--today' : '';
    const items = slots.map(s => {
      const l = s.lesson, past = calSlotPast(iso, s);
      const kind = !l ? 'open' : l.sid ? '' : 'held';
      const cls = `wl${kind ? ' wl--' + kind : ''}${past ? ' wl--past' : ''}`;
      const name = !l ? 'Open' : l.sid ? esc(whoIn(l)) : 'Held';
      const inner = `<span class="wl__t">${fmtShortT(s.t)}${s.len !== 30 ? ` · ${s.len}m` : ''}</span><span class="wl__n">${name}</span>`;
      return calCancellable(l)
        ? `<button type="button" class="${cls} cal-wl" title="Cancel ${esc(whoIn(l, false))}’s lesson"${actAttr('calCancelOne', [l.id, 'calendar-week'])}>${inner}</button>`
        : `<div class="${cls}">${inner}</div>`;
    }).join('');
    const empty = sp && sp.kind === 'timeoff' ? `Time off<br><small>${esc(sp.name)}</small>` : 'No lessons';
    return `<div class="week__col${colCls}"><button type="button" class="week__head cal-head"${actAttr('calOpenDay', [iso])}><span>${DOW[dowOf(iso)]}</span><b>${parseIso(iso).getDate()}</b>${iso === TODAY ? '<em>Today</em>' : ''}</button>${sp && sp.kind === 'special' ? `<div class="cal-colnote">${esc(sp.name)}</div>` : ''}<div class="week__body">${items || `<div class="week__empty">${empty}</div>`}</div>${fut.length ? `<button type="button" class="week__cancel"${actAttr('calCancelDay', [iso, 'calendar-week'])}>Cancel day</button>` : ''}</div>`;
  }).join('');
  const thisWeek = ws === weekStart(TODAY);
  return shell(`
    ${pageHead(`Week of ${dShort(ws)}`, thisWeek ? `It’s ${DOW_LONG[dowOf(TODAY)]} ${fmtT(NOW_MIN)}. Past lessons are greyed and can’t be cancelled.` : `${dShort(ws)} – ${dShort(we)}. Tap a booked lesson to cancel just that one.`,
      `${calViewSeg(1)}<div class="btngroup"><button type="button" class="iconbtn" aria-label="Previous week"${actAttr('calWeek', [-1])}>${ic('chevL', 18)}</button>${B('Today', 'secondary', 'calWeekToday', { sm: true })}<button type="button" class="iconbtn" aria-label="Next week"${actAttr('calWeek', [1])}>${ic('chevR', 18)}</button></div>${rest ? B('Cancel rest of week', 'danger-outline', 'calCancelRest', { icon: 'calOff' }) : ''}`)}
    ${card(`<div class="cal-scroll"><div class="week">${cols}</div></div>`, { pad: false })}
    <div class="legend"><span class="legend__item"><i class="sw sw--booked"></i>Booked</span><span class="legend__item"><i class="sw sw--open"></i>Open</span><span class="legend__item"><i class="sw sw--held"></i>Held (you kept it closed)</span><span class="legend__item"><i class="sw sw--off"></i>Past</span><span class="legend__note">Sick today? Use Cancel day. Your schedule doesn’t change.</span></div>`, { width: 'wide' });
};

/* ---------- Day ---------- */
SCREENS['calendar-day'] = () => {
  const c = calUi(), iso = c.day, slots = calSlots(iso), sp = specialOn(iso), fut = calFuture(iso);
  const booked = slots.filter(s => s.lesson && s.lesson.sid);
  const rows = slots.map(s => {
    const l = s.lesson, past = calSlotPast(iso, s);
    const who = !l ? `<span class="roundicon">${ic('plus', 14)}</span>${rowTitle('Open', 'Families can book this time')}`
      : !l.sid ? `<span class="roundicon roundicon--warn">${ic('lock', 14)}</span>${rowTitle('Held', 'You kept this time closed')}`
      : `${avatar(initials(nameOf(l)), 'sm')}${rowTitle(esc(whoIn(l, false)) + (isShared(l) ? ' ' + badge('Shared', 'primary', 'users') : ''), `${familiesIn(l).map(esc).join(' · ')}${l.recurring ? ' · repeats weekly' : ''}`)}`;
    const side = `<span class="muted num">${s.len} min · ${l && l.sid ? skatersIn(l).map(p => money(p.price)).join(' + ') : money(s.price)}</span>${l && l.sid && isStarted(l) ? skaterBadges(l) : ''}${calCancellable(l) ? B('Cancel', 'ghost', 'calCancelOne', { sm: true, args: [l.id, 'calendar-day'] }) : ''}`;
    return row(`<span class="cal-slot__t num">${fmtT(s.t)}</span>${who}`, side, { cls: past ? 'row--muted' : '' });
  }).join('');
  const empty = sp && sp.kind === 'timeoff'
    ? `<div class="pempty"><span class="pempty__icon">${ic('calOff', 22)}</span><b>Time off: ${esc(sp.name)}</b><span class="muted">${dShort(sp.sd)} – ${dShort(sp.ed)}. Families can’t book these days.</span></div>`
    : `<div class="pempty"><span class="pempty__icon">${ic('calendar', 22)}</span><b>No lessons on ${DOW_LONG[dowOf(iso)]}s</b><span class="muted">Your weekly schedule has nothing on this day. <a class="link" href="${SCHEDULE_PAGES.weekly}">Edit weekly schedule</a></span></div>`;
  return shell(`
    ${pageHead(dLong(iso), slots.length ? `${plural(booked.length, 'lesson')} booked · ${plural(slots.filter(s => !s.lesson && !calSlotPast(iso, s)).length, 'open time')}${iso === TODAY ? ` · it’s ${fmtT(NOW_MIN)}` : ''}` : (iso === TODAY ? 'Today' : ''),
      `${calViewSeg(2)}<div class="btngroup"><button type="button" class="iconbtn" aria-label="Previous day"${actAttr('calDay', [-1])}>${ic('chevL', 18)}</button>${B('Today', 'secondary', 'calDayToday', { sm: true })}<button type="button" class="iconbtn" aria-label="Next day"${actAttr('calDay', [1])}>${ic('chevR', 18)}</button></div>`,
      `<a class="link" href="${href('calendar-week')}" data-act="calOpenWeek" data-arg='${esc(JSON.stringify([iso]))}'>${ic('arrowL', 14)} Week of ${dShort(weekStart(iso))}</a>`)}
    ${sp && sp.kind === 'special' ? banner('info', `Special schedule: ${esc(sp.name)}`, `${dShort(sp.sd)} – ${dShort(sp.ed)}. These times replace your weekly schedule.`) : ''}
    ${card(slots.length ? rows : empty, { pad: false, title: slots.length ? 'Every time on this day' : '', action: fut.length ? B('Cancel this day', 'danger-outline', 'calCancelDay', { sm: true, icon: 'calOff', args: [iso, 'calendar-day'] }) : '' })}`, { width: 'wide' });
};

/* ---------- Cancel preview ---------- */
SCREENS['cancel-preview'] = () => {
  const c = calUi();
  const sel = state.lessons.filter(l => c.sel.includes(l.id) && calCancellable(l));
  const backLabel = { 'calendar-week': `Week of ${dShort(c.week)}`, 'calendar-day': dLong(c.day), 'calendar-month': 'Calendar' }[c.back] || 'Back';
  if (!sel.length) return shell(`${pageHead('Nothing to cancel', 'These lessons have already started or were cancelled.', '', `<a class="link" data-act="calBack" href="#">${ic('arrowL', 14)} ${backLabel}</a>`)}`);
  const fams = families(sel.flatMap(l => skatersIn(l).map(p => student(p.sid))));
  const shared = sel.filter(isShared);
  const held = sel.filter(l => c.hold[l.id]).length;
  const first = sel[0].iso, last = sel[sel.length - 1].iso;
  const span = first === last ? dDow(first) : `${dDow(first)} – ${dDow(last)}`;
  const rows = sel.map(l => row(`${avatar(initials(nameOf(l)), 'sm')}${rowTitle(esc(whoIn(l, false)) + (isShared(l) ? ' ' + badge('Shared', 'primary', 'users') : ''), `${dDow(l.iso)} · ${fmtT(l.t)} · ${l.len} min${l.recurring ? ' · this week only' : ''}${isShared(l) ? ' · both families emailed' : ''}`)}`,
    SEG(['Release for rebooking', 'Hold — keep closed'], c.hold[l.id] ? 1 : 0, 'calHold', [l.id]))).join('');
  return shell(`
    ${pageHead(`Cancel ${plural(sel.length, 'lesson')}, ${span}`, 'For each lesson, choose whether families can book the time again.', '', `<a class="link" href="#" data-act="calBack">${ic('arrowL', 14)} ${backLabel}</a>`)}
    <div class="impact">${stat('Cancelled', plural(sel.length, 'lesson'))}${stat('Held closed', String(held))}${stat('Families emailed', String(fams.length))}</div>
    ${card(`<div class="tablehead"><span>Lesson</span><span>After cancelling</span></div>${rows}
      <div class="card__note">${ic('alert', 14)} A held time stays closed to families, and your schedule doesn’t change. You can’t undo a cancellation.</div>`,
      { pad: false, title: 'Lessons', action: held ? `<a class="link" href="#" data-act="calReleaseAll">Release all</a>` : '' })}
    ${help('Who gets told', `${fams.map(esc).join(', ')} will each get one email listing their cancelled ${sel.length === 1 ? 'lesson' : 'lessons'}, with a link to book another time. Repeating lessons in other weeks aren’t affected.${shared.length ? ` A shared lesson is cancelled for every skater in it, and each skater’s family gets its own email.` : ''}`)}
    <div class="stickybar">${B('Back', 'secondary', 'calBack')}<span class="stickybar__note">${plural(fams.length, 'family', 'families')} will be emailed. Nothing changes until you confirm.</span>${B(`Cancel ${plural(sel.length, 'lesson')}`, 'danger', 'calAccept', { lg: true })}</div>`);
};

/* ---------- static pages ---------- */
PRESETS.push(
  { id: 'CoachCalendarMonth', file: 'calendar-month', group: 'Calendar', title: 'Month view', note: 'New. October 2026 with booked and open counts per day, week links on the left, time off and the camp week marked.', setup: st => { st.screen = 'calendar-month'; } },
  { id: 'CoachWeekView', file: 'calendar-week', group: 'Calendar', title: 'Week view', note: 'Redesigned from the Forest CoachWeekView: every time slot by name, Open or Held, with Cancel day and Cancel rest of week. A shared lesson names both skaters (Sam R. & Leo M., Wednesday 6:00; ADR-026 d6).', setup: st => { st.screen = 'calendar-week'; } },
  { id: 'CoachCalendarDay', file: 'calendar-day', group: 'Calendar', title: 'Day view', note: 'New. Today as a list of every time, with attendance for lessons already taught and a cancel button on the rest. The shared 6:00 lists Sam and Leo, each with their own attendance.', setup: st => { st.screen = 'calendar-day'; } },
  { id: 'CoachCancelPreview', file: 'cancel-preview', group: 'Calendar', title: 'Cancel preview', note: 'Redesigned from the Forest CoachCancelPreview: the rest of this week, release or hold per lesson, one lesson set to Hold.', setup: st => {
    ACTIONS.calCancelRest();
    const c = calUi(); const leo = state.lessons.find(l => c.sel.includes(l.id) && l.sid === 's5' && l.iso === TODAY);
    if (leo) c.hold[leo.id] = true;
  } },
  { id: 'CoachCancelPreviewShared', file: 'cancel-preview-shared', group: 'Calendar', title: 'Cancel preview — a day with a shared lesson', note: 'New state. Cancelling Wed, Oct 21 cancels the shared 6:00 for both Sam and Leo, and both families are emailed (ADR-026 d6, ADR-009).', setup: st => {
    const c = calUi(); c.week = weekStart('2026-10-21'); c.day = '2026-10-21';
    ACTIONS.calCancelDay('2026-10-21', 'calendar-day');
  } },
  { id: 'CoachWeekAfterCancel', file: 'calendar-week-after-cancel', group: 'Calendar', title: 'Week view after cancelling', note: 'New state of the week view: the confirmation message, the released times back to Open and the held time closed.', setup: st => {
    ACTIONS.calCancelRest();
    const c = calUi(); const leo = state.lessons.find(l => c.sel.includes(l.id) && l.sid === 's5' && l.iso === TODAY);
    if (leo) c.hold[leo.id] = true;
    ACTIONS.calAccept();
  } },
);
