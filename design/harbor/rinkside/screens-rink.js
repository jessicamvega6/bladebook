/* Rinkside screens: sign in, Today, couldn't be sent, Week (cancel several), Account, and the bottom sheets.
   Registers SCREENS, ACTIONS rk*, RK_SHEETS and the PRESETS. */

/* ================= Sign in ================= */
SCREENS.signin = () => phoneShell(`
  <div class="rk-signin">
    <span class="brand__mark rk-mark">${ic('logo', 26)}</span>
    <h1 class="h1">BladeBook at the rink</h1>
    <p class="lede">Log in with the same email and password you use on the website.</p>
    ${rk().queue.length ? `<div class="pbanner pbanner--warn">${ic('clock', 18)}<div><b>${plural(rk().queue.length, 'check-in')} waiting on this phone</b><span>Saved before you logged out. They send after you log in${rk().online ? '' : ' and there’s signal'}.</span></div></div>` : ''}
    ${INP('rk-email', 'Login email', 'auth.email', { type: 'email' })}
    ${INP('rk-pw', 'Password', 'auth.pw', { type: 'password', placeholder: '••••••••' })}
    ${B('Log in', 'primary', 'rkSignIn', { block: true, lg: true })}
    <p class="fine">This app shows today’s lessons, records attendance and cancels lessons. Your schedule, students and payments stay on the website.</p>
  </div>`, { bare: true });
Object.assign(ACTIONS, {
  /** Check-ins queued before a log-out send now, but only for the coach who recorded them (owner, 2026-11-09, R2).
      Each entry carries that coach's ID; another coach signing in on this phone leaves them waiting. */
  rkSignIn() {
    fresh(); state.authed = true; state.sheet = null; go('today');
    const r = rk(), n = r.queue.filter(q => q.coach === state.auth.email).length;
    if (n && r.online) { r.queue = r.queue.filter(q => q.coach !== state.auth.email); r.syncedAt = fmtT(NOW_MIN); r.toast = `${plural(n, 'check-in')} from before you logged out sent.`; }
  },
  /** Logging out keeps the queue on the phone (ADR-MASTER §15; owner, 2026-11-09, R2). It warns first, so the coach
      knows they wait for the next log-in. */
  rkSignOut() {
    if (rk().queue.length && !(state.sheet && state.sheet.kind === 'signout')) { sheetOpen('signout'); return; }
    state.sheet = null; state.authed = false; go('signin');
  },
});

/* ================= Today ================= */
/** One skater's result or buttons: Present / No-show, or what was recorded. No Undo here: a recorded outcome is corrected
    on the coach website's Lessons page, not on the phone (ADR-014 d8; owner, 2026-11-09). more: the "…" button. */
function seatFoot(l, p, more = '') {
  const r = rk();
  if (isRecorded(p)) {
    const ok = p.status === 'CHECKED_IN';
    return `<div class="rl__done ${ok ? 'rl__done--ok' : 'rl__done--no'}">${ic(ok ? 'check' : 'x', 16)}${ok ? 'Present' : 'No-show'} · ${p.at}${queued(l, p.sid) ? `<span class="rl__saved">${ic('clock', 13)}Saved on phone</span>` : ''}</div>`;
  }
  const aria = what => isShared(l) ? ` aria-label="${esc(seatName(p.sid))}: ${what}"` : '';
  return `<div class="rl__btns"><button type="button" class="rbtn rbtn--present"${aria('Present')}${actAttr('rkRecord', [l.id, 'CHECKED_IN', p.sid])}>${ic('check', 18)}Present</button><button type="button" class="rbtn rbtn--noshow"${aria('No-show')}${actAttr('rkRecord', [l.id, 'NO_SHOW', p.sid])}>No-show</button>${more}</div>`;
}
const nameBtn = (l, sid) => `<button type="button" class="rl__name rk-namebtn"${actAttr('rkContact', [l.id, sid])}>${esc(seatName(sid))}</button>`;
function lessonCard(l) {
  const name = esc(rkName(l)), len = `${l.len} min`, time = `<span class="rl__time num">${fmtShortT(l.t)}</span>`;
  if (!l.sid) return `<article class="rl rl--held"><div class="rl__head">${time}<span class="rl__name">Held slot</span><span class="rl__len">${len}</span></div><div class="rl__meta">${ic('lock', 13)} You kept this time closed. Nobody can book it.</div></article>`;
  if (l.status === 'FAMILY_CANCELLED') return `<article class="rl rl--cancelled"><div class="rl__head">${time}<span class="rl__name"><s>${name}</s></span>${badge('Cancelled', 'neutral')}</div><div class="rl__meta">${esc(student(l.sid).client)} cancelled at ${l.cancelledAt}, while your phone had no signal. Nothing more to do.</div></article>`;
  const later = l.t > NOW_MIN + 10, now = inProgress(l) && !allRecorded(l) ? ' rl--now' : '';
  const more = (cls = '') => `<button type="button" class="rbtn rbtn--more${cls}" aria-label="More for ${name}"${actAttr('rkMore', [l.id])}>${ic('more', 18)}</button>`;
  const laterRow = `<div class="rk-later">${ic('clock', 16)}Starts at ${fmtT(l.t)}</div>`;
  if (isShared(l)) {
    // A shared lesson: one card, each skater recorded on their own (ADR-026 d6). "…" covers the whole lesson.
    const ss = seats(l);
    return `<article class="rl rk-shared${now}"><div class="rl__head">${time}<span class="rk-shared__tag">${ic('users', 14)}Shared · ${ss.length} skaters</span><span class="rl__len">${len}</span>${allRecorded(l) ? '' : more(' rbtn--sm')}</div>
      ${ss.map(p => `<div class="rk-seat">${nameBtn(l, p.sid)}${later ? '' : seatFoot(l, p)}</div>`).join('')}
      ${later ? `<div class="rl__btns">${laterRow}</div>` : ''}</article>`;
  }
  const foot = isRecorded(l) ? seatFoot(l, l) : later ? `<div class="rl__btns">${laterRow}${more()}</div>` : seatFoot(l, l, more());
  return `<article class="rl${now}"><div class="rl__head">${time}${nameBtn(l, l.sid)}<span class="rl__len">${len}</span></div>${foot}</article>`;
}
SCREENS.today = () => {
  const r = rk();
  if (!r.loaded) return phoneShell(`<div class="pempty"><span class="pempty__icon">${ic('wifiOff', 28)}</span><h2 class="h2">Today’s lessons haven’t loaded</h2><p>This phone hasn’t had signal since you opened the app. Open it once with signal before you leave for the rink, and today’s lessons are saved for when there’s none.</p>${B('Try again', 'primary', 'rkRetry', { block: true, lg: true, icon: 'refresh' })}</div>`);
  const each = recordable().flatMap(seats), done = each.filter(isRecorded).length, nx = nextLesson();   // counts each skater
  const banners = [
    !r.online ? `<div class="pbanner pbanner--warn">${ic('wifiOff', 18)}<div><b>No signal since ${NO_SIGNAL_SINCE}</b><span>${r.queue.length ? `${plural(r.queue.length, 'check-in')} saved on this phone. They’ll send when signal comes back.` : 'Keep recording. Check-ins are saved on this phone and send when signal comes back.'}</span></div></div>` : '',
    r.unsent.length ? `<a class="pbanner pbanner--danger rk-bannerlink" href="${href('unsent')}">${ic('alert', 18)}<div><b>${plural(r.unsent.length, 'check-in')} couldn’t be sent</b><span>See why ${ic('arrowR', 13)}</span></div></a>` : '',
  ].join('');
  return phoneShell(`${banners}${todays().map(lessonCard).join('')}
    <p class="phone__hint">${r.online ? 'Tap a name for the family’s contact details.' : `${ic('lock', 13)} Contact details and cancelling need a connection.`}</p>`,
    { progress: [done, each.length, nx ? `Next: ${esc(rkName(nx))} ${fmtShortT(nx.t)}` : 'All done for today'] });
};
Object.assign(ACTIONS, {
  /** Records one skater. sid picks the skater in a shared lesson; it defaults to the booking's skater. */
  rkRecord(id, outcome, sid) {
    const l = lessonById(id), r = rk(); fresh(); sid = sid || l.sid;
    const p = seatOf(l, sid);
    p.status = outcome; p.at = fmtT(NOW_MIN);
    if (!r.online) { r.queue = r.queue.filter(q => !(q.lid === id && q.sid === sid)); r.queue.push({ lid: id, sid, outcome, at: p.at, coach: state.auth.email }); }
  },
  rkMore(id) { fresh(); sheetOpen('more', { lid: id }); },
  rkContact(id, sid) { fresh(); const l = lessonById(id); sheetOpen('contact', { lid: id, sid: sid || l.sid }); },
  rkCancelAsk(id) { fresh(); sheetOpen('cancel', { lid: id, hold: 0 }); },
  rkCancelHold(i) { state.sheet.hold = i; },
  rkCancelOne() {
    const s = state.sheet, l = lessonById(s.lid), name = rkName(l), shared = isShared(l); fresh();
    cancelLesson(l, s.hold);
    state.sheet = null;
    rk().toast = `${shared ? `The shared ${fmtT(l.t)} lesson is cancelled. Both families` : `${name}’s ${fmtT(l.t)} lesson cancelled. The family`} will be emailed.${s.hold ? ' The time stays closed.' : ''}`;
  },
  rkCopy(what) { rk().toast = `Copied ${what}.`; },
});

/** Cancels every skater in the lesson (ADR-026 d6): held turns it into a held slot, otherwise it's gone.
    An unanswered invitation on it is removed quietly: no record, no email (ADR-031, S11, owner 2026-11-08). */
function cancelLesson(l, hold) {
  if (l.invited) state.invites = state.invites.filter(i => !(i.skater === l.invited && i.iso === l.iso && i.t === l.t && i.status === 'SENT'));
  if (hold) { Object.assign(l, { sid: null, status: 'COACH_HELD', price: 0, pay: null }); delete l.with; }
  else state.lessons = state.lessons.filter(x => x !== l);
}

/* ---------- sheets on Today ---------- */
const sheet = (body, title = '') => `<div class="sheet" role="dialog" aria-modal="true"${title ? ` aria-label="${esc(title)}"` : ''}><span class="sheet__grab"></span>${body}</div>`;
RK_SHEETS.more = s => {
  const l = lessonById(s.lid), on = rk().online, canCancel = on && !isStarted(l), shared = isShared(l);
  const contact = sid => { const st = student(sid);
    return `<button type="button" class="rk-menu__item"${on ? actAttr('rkContact', [l.id, sid]) : ' disabled'}>${ic('phone', 18)}<span>${shared ? `${esc(seatName(sid))}’s family` : 'Contact details'}<small>${on ? `${esc(st.client)}, ${st.rel === 'Self' ? 'books for themselves' : st.rel.toLowerCase()}` : 'Needs a connection'}</small></span>${ic('chevR', 16)}</button>`; };
  return sheet(`<h2 class="h2">${esc(shared ? rkName(l) : nameOf(l))} · ${fmtT(l.t)}</h2>
    <div class="rk-menu">
      ${seats(l).map(p => contact(p.sid)).join('')}
      <button type="button" class="rk-menu__item rk-menu__item--danger"${canCancel ? actAttr('rkCancelAsk', [l.id]) : ' disabled'}>${ic('calOff', 18)}<span>Cancel this lesson<small>${!on ? 'Needs a connection' : isStarted(l) ? 'It has already started' : shared ? 'Cancels both skaters. You’ll confirm next.' : 'You’ll confirm on the next step'}</small></span>${ic('chevR', 16)}</button>
    </div>
    ${B('Close', 'secondary', 'rkClose', { block: true, lg: true })}`, 'More');
};
RK_SHEETS.contact = s => {
  const l = lessonById(s.lid), st = student(s.sid || l.sid);
  if (!rk().online) return sheet(`<div class="rk-sheeticon">${ic('wifiOff', 24)}</div><h2 class="h2">Contact details need a connection.</h2>
    <p class="fine">They aren’t stored on this phone. Try again when you have signal.</p>${B('Close', 'secondary', 'rkClose', { block: true, lg: true })}`, 'Contact details');
  const line = (icon, label, value, what) => `<div class="rk-contact__row">${ic(icon, 18)}<div><small>${label}</small><b class="rk-select">${esc(value)}</b></div>${B('Copy', 'ghost', 'rkCopy', { sm: true, icon: 'copy', args: [what] })}</div>`;
  return sheet(`<h2 class="h2">${esc(st.name)}</h2>
    <p class="fine">${st.rel === 'Self' ? 'Books for themselves' : `${esc(st.client)} · ${st.rel.toLowerCase()}`}${st.minor ? ' · minor' : ''}</p>
    <div class="rk-contact">${line('user', st.rel === 'Self' ? 'Name' : st.rel, st.client, 'the name')}${line('phone', 'Phone', st.phone, 'the phone number')}${line('mail', 'Email', st.email, 'the email address')}</div>
    <p class="fine">${ic('lock', 13)} Shown for this tap only. Not saved on this phone.</p>
    ${B('Done', 'primary', 'rkClose', { block: true, lg: true })}`, 'Contact details');
};
RK_SHEETS.cancel = s => {
  const l = lessonById(s.lid), fams = clients(l);
  // Names the skater, date and time (ADR-009 d5a; R6, owner 2026-11-09). The check-in list is always today.
  return sheet(`<h2 class="h2">Cancel ${esc(rkName(l))} · ${l.iso === TODAY ? 'Today, ' : ''}${dDow(l.iso)} · ${fmtT(l.t)}?</h2>
    <p class="fine">${isShared(l) ? 'It’s a shared lesson, so both skaters are cancelled. ' : ''}${esc(fams.join(' and '))} will be emailed. This can’t be undone.</p>
    <div class="fieldset"><div class="label">After cancelling</div>${SEG(['Release for rebooking', 'Hold it closed'], s.hold, 'rkCancelHold', [], { block: true })}
      <div class="hint">${s.hold ? 'A held time stays closed for good. Nobody can book it.' : 'Another family can book this time.'}</div></div>
    ${B('Cancel lesson', 'danger', 'rkCancelOne', { block: true, lg: true })}${B('Keep lesson', 'secondary', 'rkClose', { block: true, lg: true })}`, 'Cancel lesson');
};

/* ================= Couldn't be sent ================= */
/* Not sent (ADR-014 d4a; owner, 2026-11-09). The server refuses outright only an entry whose time doesn't fit its lesson
   (the phone's clock was wrong). It exists only on this phone, so it's listed until the coach records it on the website
   and taps Done. It holds a student's name on a phone used at public rinks, so it's removed after 7 days. A family's
   cancellation never lands here: it's cleared, and the lesson shows as cancelled on Today. */
SCREENS.unsent = () => {
  const r = rk();
  const cards = r.unsent.map((u, i) => `<article class="rl rl--issue"><div class="rl__head"><span class="rl__name">${esc(shortName(u.name))}</span>${badge('Not sent', 'warning')}</div>
    <div class="rl__meta">${u.when}<br>Recorded <b>${u.outcome === 'NO_SHOW' ? 'No-show' : 'Present'}</b> at ${u.at}, by the phone’s clock</div><p class="rk-reason">${u.reason}</p>
    ${u.days >= 6 ? `<p class="fine">Will be removed tomorrow.</p>` : ''}
    <div class="rl__btns">${B('Record on the website', 'secondary', '', { sm: true, href: '../../coach/static/lessons.html', newTab: true })}${B('Done', 'primary', 'rkDone', { sm: true, args: [i] })}</div></article>`).join('');
  return phoneShell(`${r.unsent.length ? `<div class="pbanner pbanner--danger">${ic('alert', 18)}<div><b>${plural(r.unsent.length, 'check-in')} couldn’t be sent</b><span>Record each one on the website, then tap Done. Each is removed from this phone after 7 days.</span></div></div>${cards}`
    : `<div class="pempty"><span class="pempty__icon">${ic('check', 28)}</span><h2 class="h2">Everything was sent</h2><p>Check-ins that can’t be sent show up here, with the reason.</p>${B('Back to today', 'primary', '', { block: true, lg: true, href: href('today') })}</div>`}
    ${r.unsent.length ? `<p class="phone__hint"><a class="link" href="${href('today')}">${ic('arrowL', 13)} Back to today</a></p>` : ''}`, { title: 'Not sent', sub: 'Check-ins the server turned down' });
};
Object.assign(ACTIONS, {
  /** Done: the coach has recorded it on the website, so it leaves the phone. */
  rkDone(i) { fresh(); rk().unsent.splice(i, 1); },
});

/* ================= Week: cancel several lessons ================= */
const weekDays = () => { const out = []; for (let iso = TODAY, end = addDays(weekStart(TODAY), 6); iso <= end; iso = addDays(iso, 1)) out.push(iso); return out; };
const cancellable = iso => lessonsOn(iso).filter(l => l.sid && l.status === 'BOOKED' && !isStarted(l)).sort((a, b) => a.t - b.t);
const selected = () => state.lessons.filter(l => rk().sel[l.id]);
/** Open times not yet started (no lesson in them). The whole-week cancel holds these too (ADR-009, owner 2026-11-08). */
const openLeft = iso => slotsOn(iso).filter(s => !lessonsOn(iso).some(l => l.t === s.t) && !(iso === TODAY && s.t <= NOW_MIN)).map(s => ({ iso, t: s.t, len: s.len }));
const restOfWeek = () => ({ lessons: weekDays().flatMap(cancellable), open: weekDays().flatMap(openLeft) });
SCREENS.week = () => {
  const r = rk(), sel = selected(), off = !r.online;
  const days = weekDays().map(iso => {
    const ls = cancellable(iso), started = lessonsOn(iso).filter(l => l.sid && isStarted(l)).length;
    if (!ls.length) return `<section class="rk-day"><div class="rk-day__head"><b>${iso === TODAY ? 'Today' : dDow(iso)}</b><span class="muted-sm">${started ? 'Nothing left to cancel' : 'No lessons'}</span></div></section>`;
    const all = ls.every(l => r.sel[l.id]);
    return `<section class="rk-day"><div class="rk-day__head"><b>${iso === TODAY ? `Today, ${dShort(iso)}` : dDow(iso)}</b>${off ? '' : `<button type="button" class="link"${actAttr('rkSelDay', [iso, !all])}>${all ? 'Clear day' : 'Select whole day'}</button>`}</div>
      ${ls.map(l => `<div class="rk-pick${r.sel[l.id] ? ' is-on' : ''}"><label class="rk-pick__row"><input type="checkbox" class="check__input"${r.sel[l.id] ? ' checked' : ''}${off ? ' disabled' : actAttr('rkSel', [l.id])}><span class="num rk-pick__t">${fmtShortT(l.t)}</span><span class="rk-pick__n">${esc(rkName(l))}${isShared(l) ? '<small>Shared · cancels both skaters</small>' : ''}</span><span class="rl__len">${l.len} min</span></label>
        ${r.sel[l.id] ? SEG(['Release', 'Hold closed'], r.hold[l.id] ? 1 : 0, 'rkHold', [l.id], { block: true }) : ''}</div>`).join('')}
      ${started ? `<p class="fine">${plural(started, 'lesson')} already started and can’t be cancelled.</p>` : ''}</section>`;
  }).join('');
  return phoneShell(`${off ? `<div class="pbanner pbanner--warn">${ic('wifiOff', 18)}<div><b>Cancelling needs a connection</b><span>You can look, but not cancel, until signal comes back.</span></div></div>` : ''}
    ${(() => { const w = restOfWeek(); return w.lessons.length + w.open.length ? `<section class="rk-card"><b>Cancel the rest of the week</b><p class="fine">Holds everything left from now to Saturday: ${plural(w.lessons.length, 'lesson')} and ${plural(w.open.length, 'open time')}. Families can’t book them. Your schedule doesn’t change.</p>${B('Cancel rest of week', 'danger-outline', 'rkWeekAllAsk', { block: true, icon: 'calOff', disabled: off })}</section>` : ''; })()}
    <p class="fine">Or pick lessons to cancel. For each one, choose whether the time can be booked again.</p>${days}
    <div class="rk-sticky">${B(sel.length ? `Cancel ${plural(sel.length, 'lesson')}` : 'Pick lessons to cancel', 'danger', 'rkWeekAsk', { block: true, lg: true, disabled: !sel.length || off })}</div>`,
    { title: 'This week', sub: `Wed, Oct 14 – Sat, Oct 17 · cancel lessons` });
};
Object.assign(ACTIONS, {
  rkSel(id) { fresh(); const r = rk(); if (r.sel[id]) { delete r.sel[id]; delete r.hold[id]; } else r.sel[id] = true; },
  rkSelDay(iso, on) { fresh(); const r = rk(); for (const l of cancellable(iso)) { if (on) r.sel[l.id] = true; else { delete r.sel[l.id]; delete r.hold[l.id]; } } },
  rkHold(id, i) { fresh(); if (i) rk().hold[id] = true; else delete rk().hold[id]; },
  rkWeekAsk() { fresh(); sheetOpen('weekConfirm'); },
  rkWeekAllAsk() { fresh(); sheetOpen('weekAllConfirm'); },
  /** The whole week (ADR-009, owner 2026-11-08): every booked lesson and open time left is held, with no release-or-hold question. */
  rkWeekAllCancel() {
    const r = rk(), w = restOfWeek(); fresh();
    const fams = new Set(w.lessons.flatMap(clients)).size;
    for (const l of w.lessons) cancelLesson(l, true);
    for (const o of w.open) state.lessons.push({ id: `h-${o.iso}-${o.t}`, sid: null, iso: o.iso, t: o.t, len: o.len, price: 0, status: 'COACH_HELD', pay: null });
    r.sel = {}; r.hold = {}; state.sheet = null;
    r.toast = `${plural(w.lessons.length, 'lesson')} cancelled and ${plural(w.open.length, 'open time')} closed. ${plural(fams, 'family', 'families')} will be emailed.`;
  },
  rkWeekCancel() {
    const r = rk(), sel = selected(); fresh();
    const held = sel.filter(l => r.hold[l.id]).length, fams = new Set(sel.flatMap(clients)).size;
    for (const l of sel) cancelLesson(l, r.hold[l.id]);
    r.sel = {}; r.hold = {}; state.sheet = null;
    r.toast = `${plural(sel.length, 'lesson')} cancelled${held ? `, ${held} held closed` : ''}. ${plural(fams, 'family', 'families')} will be emailed.`;
  },
});
RK_SHEETS.weekConfirm = () => {
  const r = rk(), sel = selected(), held = sel.filter(l => r.hold[l.id]).length, fams = [...new Set(sel.flatMap(clients))];
  return sheet(`<h2 class="h2">Cancel ${plural(sel.length, 'lesson')}?</h2>
    <ul class="rk-confirm">${sel.map(l => `<li><span class="num">${l.iso === TODAY ? 'Today' : dDow(l.iso)} · ${fmtShortT(l.t)}</span><b>${esc(rkName(l))}</b>${r.hold[l.id] ? badge('Hold', 'warning', 'lock') : badge('Release', 'neutral')}</li>`).join('')}</ul>
    <p class="fine">${esc(fams.join(', '))} will be emailed.${held ? ` ${plural(held, 'held time')} stay${held === 1 ? 's' : ''} closed for good.` : ''} This can’t be undone.</p>
    ${B(`Cancel ${plural(sel.length, 'lesson')}`, 'danger', 'rkWeekCancel', { block: true, lg: true })}${B('Keep them', 'secondary', 'rkClose', { block: true, lg: true })}`, 'Confirm cancellation');
};

RK_SHEETS.weekAllConfirm = () => {
  const w = restOfWeek(), fams = [...new Set(w.lessons.flatMap(clients))];
  return sheet(`<h2 class="h2">Cancel the rest of the week?</h2>
    <p class="fine">Everything left from now to Saturday is held closed. Nobody can book these times.</p>
    <ul class="rk-confirm">${w.lessons.map(l => `<li><span class="num">${l.iso === TODAY ? 'Today' : dDow(l.iso)} · ${fmtShortT(l.t)}</span><b>${esc(rkName(l))}</b>${badge('Hold', 'warning', 'lock')}</li>`).join('')}${w.open.map(o => `<li><span class="num">${o.iso === TODAY ? 'Today' : dDow(o.iso)} · ${fmtShortT(o.t)}</span><b>Open</b>${badge('Hold', 'warning', 'lock')}</li>`).join('')}</ul>
    <p class="fine">${fams.length ? `${esc(fams.join(', '))} will be emailed. ` : ''}Your weekly schedule doesn’t change, so next week is untouched. This can’t be undone.</p>
    ${B(`Cancel ${plural(w.lessons.length, 'lesson')} and ${plural(w.open.length, 'open time')}`, 'danger', 'rkWeekAllCancel', { block: true, lg: true })}${B('Keep them', 'secondary', 'rkClose', { block: true, lg: true })}`, 'Confirm cancellation');
};

/* ================= Account ================= */
SCREENS.account = () => {
  const r = rk(), p = state.profile;
  return phoneShell(`
    <section class="rk-card"><div class="rk-who">${avatar(initials(p.first + ' ' + p.last))}<div><b>${esc(p.first)} ${esc(p.last)}</b><span class="muted-sm">${esc(p.loginEmail)}</span></div></div>
      <dl class="rk-kv"><div><dt>Rink</dt><dd>${RINK_SHORT}</dd></div><div><dt>Last synced</dt><dd>${r.online ? r.syncedAt : `${r.syncedAt} · no signal now`}</dd></div><div><dt>Waiting to send</dt><dd>${r.queue.length ? plural(r.queue.length, 'check-in') : 'Nothing'}</dd></div></dl></section>
    <section class="rk-card"><b>Everything else is on the website</b><p class="fine">Your schedule, students, approvals, payments and profile are on the website. This page is for today’s lessons, attendance and cancelling.</p></section>
    ${B('Log out', 'secondary', 'rkSignOut', { block: true, lg: true, icon: 'arrowL' })}`, { title: 'Account', sub: 'Rinkside app' });
};
RK_SHEETS.signout = () => sheet(`<div class="rk-sheeticon rk-sheeticon--warn">${ic('alert', 24)}</div><h2 class="h2">${plural(rk().queue.length, 'check-in')} haven’t been sent</h2>
  <p class="fine">They’re saved on this phone. If you log out, they’ll send the next time you log in here. Only your login can send them.</p>
  ${B('Stay logged in', 'primary', 'rkClose', { block: true, lg: true })}${B('Log out', 'secondary', 'rkSignOut', { block: true, lg: true })}`, 'Log out');

/* ================= presets ================= */
const lid = (sid, t) => state.lessons.find(l => l.iso === TODAY && l.sid === sid && l.t === t).id;
const SHARED = () => lid('s4', 360);   // Sam and Leo's shared 6:00
/** Leo not recorded yet in the shared 6:00, so the card has one result and one pair of buttons. */
const leoNotYet = () => { const p = seatOf(lessonById(SHARED()), 's5'); p.status = 'BOOKED'; delete p.at; };
PRESETS.push(
  { id: 'RinkSignIn', file: 'signin', group: 'Sign in', title: 'Log in', note: 'New. Same email and password as the website, through the coach website’s sign-in; only a coach’s account gets in (ADR-023 d2, d7). Says what this page can and can’t do.', setup: st => { st.authed = false; st.screen = 'signin'; } },
  { id: 'RinkSignInWaiting', file: 'signin-waiting', group: 'Sign in', title: 'Log in with check-ins waiting', note: 'New 2026-11-09 (owner, R2). Two check-ins saved before the coach logged out. They send after this coach logs in; another coach’s login leaves them waiting.', setup: st => { st.screen = 'today'; ACTIONS.rkSignal(false); NOW_MIN = CLOCK_LATE; ACTIONS.rkRecord(lid('s1', 390), 'NO_SHOW'); ACTIONS.rkRecord(lid('s7', 510), 'CHECKED_IN'); st.rk.online = true; st.authed = false; st.screen = 'signin'; } },
  { id: 'RinkToday', file: 'today', group: 'Today', title: 'Today’s lessons', note: 'Redesigned from Forest RinkToday. 6:35 AM: the shared 6:00 recorded for both skaters, Mia under way, later lessons show their start time instead of buttons, the held slot in place.', setup: st => { st.screen = 'today'; } },
  { id: 'RinkShared', file: 'today-shared', group: 'Today', title: 'Shared lesson — two skaters', note: 'New. Sam and Leo share the 6:00 (ADR-026 d6): one card, a row per skater, each with their own Present and No-show. Sam is recorded, Leo isn’t yet. The count counts each skater.', setup: st => { st.screen = 'today'; leoNotYet(); } },
  { id: 'RinkSharedContact', file: 'today-shared-contact', group: 'Today', title: 'Contact details — shared lesson', note: 'New. Each name in a shared lesson opens that skater’s own family: here Leo’s mother, Kate Martin. Fetched for this tap only, never stored (ADR-014 d9b).', setup: st => { st.screen = 'today'; leoNotYet(); st.sheet = { kind: 'contact', on: 'today', lid: SHARED(), sid: 's5' }; } },
  { id: 'RinkMore', file: 'today-more', group: 'Today', title: 'More for one lesson', note: 'New. The “…” sheet: contact details and cancel, kept away from the Present and No-show buttons.', setup: st => { st.screen = 'today'; st.sheet = { kind: 'more', on: 'today', lid: lid('s7', 510) }; } },
  { id: 'RinkContact', file: 'today-contact', group: 'Today', title: 'Contact details', note: 'New. Fetched with signal for this tap only and never stored on the phone (ADR-014 d9b).', setup: st => { st.screen = 'today'; st.sheet = { kind: 'contact', on: 'today', lid: lid('s1', 390) }; } },
  { id: 'RinkContactOffline', file: 'today-contact-offline', group: 'Today', title: 'Contact details — no signal', note: 'New. Offline, the tap says “Contact details need a connection.” (ADR-014 d9b).', setup: st => { st.screen = 'today'; st.rk.online = false; st.sheet = { kind: 'contact', on: 'today', lid: lid('s1', 390) }; } },
  { id: 'RinkCancelConfirm', file: 'today-cancel', group: 'Today', title: 'Cancel one lesson', note: 'Redesigned from Forest RinkCancelConfirm. Always confirms, and asks release or hold (ADR-009 d5a).', setup: st => { st.screen = 'today'; st.sheet = { kind: 'cancel', on: 'today', lid: lid('s5', 600), hold: 0 }; } },
  { id: 'RinkSharedCancel', file: 'today-shared-cancel', group: 'Today', title: 'Cancel a shared lesson', note: 'New. 5:45 AM, before the shared 6:00 starts. Cancelling it cancels both skaters, and both families are emailed (ADR-026 d6, ADR-009 d5a).', setup: st => { st.screen = 'today'; ACTIONS.rkClock(2); st.sheet = { kind: 'cancel', on: 'today', lid: SHARED(), hold: 0 }; } },
  { id: 'RinkOffline', file: 'offline', group: 'No signal', title: 'No signal — saved on the phone', note: 'Redesigned from Forest RinkOffline. 8:40 AM with no signal: two check-ins saved on the phone with their device times, waiting to send.', setup: st => { st.screen = 'today'; ACTIONS.rkSignal(false); NOW_MIN = CLOCK_LATE; ACTIONS.rkRecord(lid('s1', 390), 'NO_SHOW'); ACTIONS.rkRecord(lid('s7', 510), 'CHECKED_IN'); } },
  { id: 'RinkNotLoaded', file: 'not-loaded', group: 'No signal', title: 'Today’s lessons haven’t loaded', note: 'Redesigned from Forest RinkNotLoaded. Opened with no signal before today was ever loaded.', setup: st => { st.screen = 'today'; st.rk.online = false; st.rk.loaded = false; } },
  { id: 'RinkCouldntSend', file: 'unsent', group: 'No signal', title: 'Couldn’t be sent', note: 'Redesigned from Forest RinkCouldntSend; reworked 2026-11-09 to ADR-014 d4a. The phone’s clock was wrong, so a check-in tapped for Mia’s 6:30 lesson carries a time that doesn’t fit it, and the server refused it. Record on the website, then Done; removed after 7 days. A family’s cancellation is never listed here (see RinkFamilyCancelled).', setup: st => { const l = lessonById(lid('s1', 390)), k = student(l.sid); st.screen = 'unsent'; st.rk.toast = ''; st.rk.unsent = [{ lid: l.id, name: k.name, when: `${dDow(l.iso)} · ${fmtT(l.t)}`, outcome: 'CHECKED_IN', at: '9:12 PM', reason: 'The phone’s time didn’t match the lesson, so it couldn’t be recorded.', days: 0 }]; } },
  { id: 'RinkFamilyCancelled', file: 'family-cancelled', group: 'No signal', title: 'Back online — the family had cancelled', note: 'Redesigned from Forest RinkFamilyCancelled. After the replay the cancelled lesson stays in place, struck through. The no-show is cleared, not listed as not sent (ADR-014 d4; owner, 2026-11-09).', setup: st => { st.screen = 'today'; ACTIONS.rkSignal(false); ACTIONS.rkRecord(lid('s1', 390), 'NO_SHOW'); ACTIONS.rkSignal(true); } },
  { id: 'RinkWeek', file: 'week', group: 'Cancel', title: 'Cancel several lessons', note: 'New. Part of a day or week is a multi-select of single lessons, release or hold per lesson; started lessons can’t be picked (ADR-009 d5a). Cancel rest of week, at the top, holds everything left with no question (2026-11-08).', setup: st => { st.screen = 'week'; const a = lid('s5', 600); const b = state.lessons.find(l => l.iso === '2026-10-16' && l.sid === 's5').id; st.rk.sel = { [a]: true, [b]: true }; st.rk.hold = { [a]: true }; } },
  { id: 'RinkWeekConfirm', file: 'week-confirm', group: 'Cancel', title: 'Cancel several — confirm', note: 'New. One confirmation listing every lesson, which are held, and which families are emailed.', setup: st => { st.screen = 'week'; const a = lid('s5', 600); const b = state.lessons.find(l => l.iso === '2026-10-16' && l.sid === 's5').id; st.rk.sel = { [a]: true, [b]: true }; st.rk.hold = { [a]: true }; st.sheet = { kind: 'weekConfirm', on: 'week' }; } },
  { id: 'RinkWeekAllConfirm', file: 'week-all-confirm', group: 'Cancel', title: 'Cancel the rest of the week — confirm', note: 'New (owner, 2026-11-08; ADR-009). The whole week holds every booked lesson and open time left from now to Saturday, with no release-or-hold question. The weekly schedule doesn’t change.', setup: st => { st.screen = 'week'; st.sheet = { kind: 'weekAllConfirm', on: 'week' }; } },
  { id: 'RinkAccount', file: 'account', group: 'Account', title: 'Account', note: 'New. Who is signed in, when the phone last synced, log out, and where everything else lives.', setup: st => { st.screen = 'account'; } },
  { id: 'RinkSignOutWaiting', file: 'signout-waiting', group: 'Account', title: 'Log out with check-ins waiting', note: 'Reworked 2026-11-09 (owner, R2; ADR-MASTER §15). Logging out keeps the check-ins on the phone; they send after the same coach logs in again.', setup: st => { st.screen = 'today'; ACTIONS.rkSignal(false); NOW_MIN = CLOCK_LATE; ACTIONS.rkRecord(lid('s1', 390), 'NO_SHOW'); ACTIONS.rkRecord(lid('s7', 510), 'CHECKED_IN'); st.screen = 'account'; ACTIONS.rkSignOut(); } },
);
