/* Rinkside screens: sign in, Today, couldn't be sent, Week (cancel several), Account, and the bottom sheets.
   Registers SCREENS, ACTIONS rk*, RK_SHEETS and the PRESETS. */

/* ================= Sign in ================= */
SCREENS.signin = () => phoneShell(`
  <div class="rk-signin">
    <span class="brand__mark rk-mark">${ic('logo', 26)}</span>
    <h1 class="h1">BladeBook at the rink</h1>
    <p class="lede">Log in with the same email and password you use on the website.</p>
    ${INP('rk-email', 'Login email', 'auth.email', { type: 'email' })}
    ${INP('rk-pw', 'Password', 'auth.pw', { type: 'password', placeholder: '••••••••' })}
    ${B('Log in', 'primary', 'rkSignIn', { block: true, lg: true })}
    <p class="fine">This app shows today’s lessons, records attendance and cancels lessons. Your schedule, students and payments stay on the website.</p>
  </div>`, { bare: true });
Object.assign(ACTIONS, {
  rkSignIn() { fresh(); state.authed = true; state.sheet = null; go('today'); },
  rkSignOut() {
    if (rk().queue.length && !(state.sheet && state.sheet.kind === 'signout')) { sheetOpen('signout'); return; }
    state.sheet = null; state.authed = false; state.rk.queue = []; go('signin');
  },
});

/* ================= Today ================= */
function lessonCard(l) {
  const r = rk(), name = esc(rkName(l)), len = `${l.len} min`;
  if (!l.sid) return `<article class="rl rl--held"><div class="rl__head"><span class="rl__time num">${fmtShortT(l.t)}</span><span class="rl__name">Held slot</span><span class="rl__len">${len}</span></div><div class="rl__meta">${ic('lock', 13)} You kept this time closed. Nobody can book it.</div></article>`;
  if (l.status === 'FAMILY_CANCELLED') return `<article class="rl rl--cancelled"><div class="rl__head"><span class="rl__time num">${fmtShortT(l.t)}</span><span class="rl__name"><s>${name}</s></span>${badge('Cancelled', 'neutral')}</div><div class="rl__meta">${esc(student(l.sid).client)} cancelled at ${l.cancelledAt}, while your phone had no signal. Nothing more to do.</div></article>`;
  const more = `<button type="button" class="rbtn rbtn--more" aria-label="More for ${name}"${actAttr('rkMore', [l.id])}>${ic('more', 18)}</button>`;
  const nameBtn = `<button type="button" class="rl__name rk-namebtn"${actAttr('rkContact', [l.id])}>${name}</button>`;
  let foot;
  if (isRecorded(l)) {
    const ok = l.status === 'CHECKED_IN';
    foot = `<div class="rl__done ${ok ? 'rl__done--ok' : 'rl__done--no'}">${ic(ok ? 'check' : 'x', 16)}${ok ? 'Present' : 'No-show'} · ${l.at}${queued(l) ? `<span class="rl__saved">${ic('clock', 13)}Saved on phone</span>` : ''}${r.undo === l.id ? `<button type="button" class="rk-undo"${actAttr('rkUndo', [l.id])}>Undo</button>` : ''}</div>`;
  } else if (l.t > NOW_MIN + 10) {
    foot = `<div class="rl__btns"><div class="rk-later">${ic('clock', 16)}Starts at ${fmtT(l.t)}</div>${more}</div>`;
  } else {
    foot = `<div class="rl__btns"><button type="button" class="rbtn rbtn--present"${actAttr('rkRecord', [l.id, 'CHECKED_IN'])}>${ic('check', 18)}Present</button><button type="button" class="rbtn rbtn--noshow"${actAttr('rkRecord', [l.id, 'NO_SHOW'])}>No-show</button>${more}</div>`;
  }
  return `<article class="rl${inProgress(l) && !isRecorded(l) ? ' rl--now' : ''}"><div class="rl__head"><span class="rl__time num">${fmtShortT(l.t)}</span>${nameBtn}<span class="rl__len">${len}</span></div>${foot}</article>`;
}
SCREENS.today = () => {
  const r = rk();
  if (!r.loaded) return phoneShell(`<div class="pempty"><span class="pempty__icon">${ic('wifiOff', 28)}</span><h2 class="h2">Today’s lessons haven’t loaded</h2><p>This phone hasn’t had signal since you opened the app. Open it once with signal before you leave for the rink, and today’s lessons are saved for when there’s none.</p>${B('Try again', 'primary', 'rkRetry', { block: true, lg: true, icon: 'refresh' })}</div>`);
  const list = recordable(), done = list.filter(isRecorded).length, nx = nextLesson();
  const banners = [
    !r.online ? `<div class="pbanner pbanner--warn">${ic('wifiOff', 18)}<div><b>No signal since ${NO_SIGNAL_SINCE}</b><span>${r.queue.length ? `${plural(r.queue.length, 'check-in')} saved on this phone. They’ll send when signal comes back.` : 'Keep recording. Check-ins are saved on this phone and send when signal comes back.'}</span></div></div>` : '',
    r.unsent.length ? `<a class="pbanner pbanner--danger rk-bannerlink" href="${href('unsent')}">${ic('alert', 18)}<div><b>${plural(r.unsent.length, 'check-in')} couldn’t be sent</b><span>See why ${ic('arrowR', 13)}</span></div></a>` : '',
  ].join('');
  return phoneShell(`${banners}${todays().map(lessonCard).join('')}
    <p class="phone__hint">${r.online ? 'Tap a name for the family’s contact details.' : `${ic('lock', 13)} Contact details and cancelling need a connection.`}</p>`,
    { progress: [done, list.length, nx ? `Next: ${esc(rkName(nx))} ${fmtShortT(nx.t)}` : 'All done for today'] });
};
Object.assign(ACTIONS, {
  rkRecord(id, outcome) {
    const l = lessonById(id), r = rk(); fresh();
    l.status = outcome; l.at = fmtT(NOW_MIN); r.undo = id;
    if (!r.online) { r.queue = r.queue.filter(q => q.lid !== id); r.queue.push({ lid: id, outcome, at: l.at }); }
  },
  rkUndo(id) {
    const l = lessonById(id), r = rk(); fresh();
    l.status = 'BOOKED'; delete l.at; r.queue = r.queue.filter(q => q.lid !== id);
    r.toast = `${rkName(l)} is back to not recorded.`;
  },
  rkMore(id) { fresh(); sheetOpen('more', { lid: id }); },
  rkContact(id) { fresh(); sheetOpen('contact', { lid: id }); },
  rkCancelAsk(id) { fresh(); sheetOpen('cancel', { lid: id, hold: 0 }); },
  rkCancelHold(i) { state.sheet.hold = i; },
  rkCancelOne() {
    const s = state.sheet, l = lessonById(s.lid), name = rkName(l); fresh();
    if (s.hold) Object.assign(l, { sid: null, status: 'COACH_HELD', price: 0, pay: null }); else state.lessons = state.lessons.filter(x => x !== l);
    state.sheet = null; rk().toast = `${name}’s ${fmtT(l.t)} lesson cancelled. The family will be emailed.${s.hold ? ' The time stays closed.' : ''}`;
  },
  rkCopy(what) { rk().toast = `Copied ${what}.`; },
});

/* ---------- sheets on Today ---------- */
const sheet = (body, title = '') => `<div class="sheet" role="dialog" aria-modal="true"${title ? ` aria-label="${esc(title)}"` : ''}><span class="sheet__grab"></span>${body}</div>`;
RK_SHEETS.more = s => {
  const l = lessonById(s.lid), on = rk().online, canCancel = on && !isStarted(l);
  return sheet(`<h2 class="h2">${esc(nameOf(l))} · ${fmtT(l.t)}</h2>
    <div class="rk-menu">
      <button type="button" class="rk-menu__item"${on ? actAttr('rkContact', [l.id]) : ' disabled'}>${ic('phone', 18)}<span>Contact details<small>${on ? `${esc(student(l.sid).client)}, ${student(l.sid).rel === 'Self' ? 'books for themselves' : student(l.sid).rel.toLowerCase()}` : 'Needs a connection'}</small></span>${ic('chevR', 16)}</button>
      <button type="button" class="rk-menu__item rk-menu__item--danger"${canCancel ? actAttr('rkCancelAsk', [l.id]) : ' disabled'}>${ic('calOff', 18)}<span>Cancel this lesson<small>${!on ? 'Needs a connection' : isStarted(l) ? 'It has already started' : 'You’ll confirm on the next step'}</small></span>${ic('chevR', 16)}</button>
    </div>
    ${B('Close', 'secondary', 'rkClose', { block: true, lg: true })}`, 'More');
};
RK_SHEETS.contact = s => {
  const l = lessonById(s.lid), st = student(l.sid);
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
  const l = lessonById(s.lid), st = student(l.sid);
  return sheet(`<h2 class="h2">Cancel ${esc(rkName(l))} · ${fmtT(l.t)}?</h2>
    <p class="fine">${esc(st.client)} will be emailed. This can’t be undone.</p>
    <div class="fieldset"><div class="label">After cancelling</div>${SEG(['Release for rebooking', 'Hold it closed'], s.hold, 'rkCancelHold', [], { block: true })}
      <div class="hint">${s.hold ? 'A held time stays closed for good. Nobody can book it.' : 'Another family can book this time.'}</div></div>
    ${B('Cancel lesson', 'danger', 'rkCancelOne', { block: true, lg: true })}${B('Keep lesson', 'secondary', 'rkClose', { block: true, lg: true })}`, 'Cancel lesson');
};

/* ================= Couldn't be sent ================= */
SCREENS.unsent = () => {
  const r = rk();
  const cards = r.unsent.map((u, i) => `<article class="rl rl--issue"><div class="rl__head"><span class="rl__name">${esc(shortName(u.name))}</span>${badge(u.kind === 'cancelled' ? 'Family cancelled' : 'Not sent', u.kind === 'cancelled' ? 'neutral' : 'warning')}</div>
    <div class="rl__meta">${u.when}<br>Recorded <b>${u.outcome === 'NO_SHOW' ? 'No-show' : 'Present'}</b> at ${u.at}</div><p class="rk-reason">${u.reason}</p>
    <div class="rl__btns">${B('Dismiss', 'secondary', 'rkDismiss', { sm: true, args: [i] })}</div></article>`).join('');
  return phoneShell(`${r.unsent.length ? `<div class="pbanner pbanner--danger">${ic('alert', 18)}<div><b>${plural(r.unsent.length, 'check-in')} couldn’t be sent</b><span>They’re kept here so nothing is lost silently.</span></div></div>${cards}`
    : `<div class="pempty"><span class="pempty__icon">${ic('check', 28)}</span><h2 class="h2">Everything was sent</h2><p>Check-ins that can’t be sent show up here, with the reason.</p>${B('Back to today', 'primary', '', { block: true, lg: true, href: href('today') })}</div>`}
    ${r.unsent.length ? `<p class="phone__hint"><a class="link" href="${href('today')}">${ic('arrowL', 13)} Back to today</a></p>` : ''}`, { title: 'Not sent', sub: 'Check-ins the server turned down' });
};
Object.assign(ACTIONS, {
  rkDismiss(i) { fresh(); rk().unsent.splice(i, 1); },
});

/* ================= Week: cancel several lessons ================= */
const weekDays = () => { const out = []; for (let iso = TODAY, end = addDays(weekStart(TODAY), 6); iso <= end; iso = addDays(iso, 1)) out.push(iso); return out; };
const cancellable = iso => lessonsOn(iso).filter(l => l.sid && l.status === 'BOOKED' && !isStarted(l)).sort((a, b) => a.t - b.t);
const selected = () => state.lessons.filter(l => rk().sel[l.id]);
SCREENS.week = () => {
  const r = rk(), sel = selected(), off = !r.online;
  const days = weekDays().map(iso => {
    const ls = cancellable(iso), started = lessonsOn(iso).filter(l => l.sid && isStarted(l)).length;
    if (!ls.length) return `<section class="rk-day"><div class="rk-day__head"><b>${iso === TODAY ? 'Today' : dDow(iso)}</b><span class="muted-sm">${started ? 'Nothing left to cancel' : 'No lessons'}</span></div></section>`;
    const all = ls.every(l => r.sel[l.id]);
    return `<section class="rk-day"><div class="rk-day__head"><b>${iso === TODAY ? `Today, ${dShort(iso)}` : dDow(iso)}</b>${off ? '' : `<button type="button" class="link"${actAttr('rkSelDay', [iso, !all])}>${all ? 'Clear day' : 'Select whole day'}</button>`}</div>
      ${ls.map(l => `<div class="rk-pick${r.sel[l.id] ? ' is-on' : ''}"><label class="rk-pick__row"><input type="checkbox" class="check__input"${r.sel[l.id] ? ' checked' : ''}${off ? ' disabled' : actAttr('rkSel', [l.id])}><span class="num rk-pick__t">${fmtShortT(l.t)}</span><span class="rk-pick__n">${esc(rkName(l))}</span><span class="rl__len">${l.len} min</span></label>
        ${r.sel[l.id] ? SEG(['Release', 'Hold closed'], r.hold[l.id] ? 1 : 0, 'rkHold', [l.id], { block: true }) : ''}</div>`).join('')}
      ${started ? `<p class="fine">${plural(started, 'lesson')} already started and can’t be cancelled.</p>` : ''}</section>`;
  }).join('');
  return phoneShell(`${off ? `<div class="pbanner pbanner--warn">${ic('wifiOff', 18)}<div><b>Cancelling needs a connection</b><span>You can look, but not cancel, until signal comes back.</span></div></div>` : ''}
    <p class="fine">Pick the lessons to cancel. For each one, choose whether the time can be booked again.</p>${days}
    <div class="rk-sticky">${B(sel.length ? `Cancel ${plural(sel.length, 'lesson')}` : 'Pick lessons to cancel', 'danger', 'rkWeekAsk', { block: true, lg: true, disabled: !sel.length || off })}</div>`,
    { title: 'This week', sub: `Wed, Oct 14 – Sat, Oct 17 · cancel lessons` });
};
Object.assign(ACTIONS, {
  rkSel(id) { fresh(); const r = rk(); if (r.sel[id]) { delete r.sel[id]; delete r.hold[id]; } else r.sel[id] = true; },
  rkSelDay(iso, on) { fresh(); const r = rk(); for (const l of cancellable(iso)) { if (on) r.sel[l.id] = true; else { delete r.sel[l.id]; delete r.hold[l.id]; } } },
  rkHold(id, i) { fresh(); if (i) rk().hold[id] = true; else delete rk().hold[id]; },
  rkWeekAsk() { fresh(); sheetOpen('weekConfirm'); },
  rkWeekCancel() {
    const r = rk(), sel = selected(); fresh();
    const held = sel.filter(l => r.hold[l.id]).length, fams = new Set(sel.map(l => student(l.sid).client)).size;
    for (const l of sel) { if (r.hold[l.id]) Object.assign(l, { sid: null, status: 'COACH_HELD', price: 0, pay: null }); else state.lessons = state.lessons.filter(x => x !== l); }
    r.sel = {}; r.hold = {}; state.sheet = null;
    r.toast = `${plural(sel.length, 'lesson')} cancelled${held ? `, ${held} held closed` : ''}. ${plural(fams, 'family', 'families')} will be emailed.`;
  },
});
RK_SHEETS.weekConfirm = () => {
  const r = rk(), sel = selected(), held = sel.filter(l => r.hold[l.id]).length, fams = [...new Set(sel.map(l => student(l.sid).client))];
  return sheet(`<h2 class="h2">Cancel ${plural(sel.length, 'lesson')}?</h2>
    <ul class="rk-confirm">${sel.map(l => `<li><span class="num">${l.iso === TODAY ? 'Today' : dDow(l.iso)} · ${fmtShortT(l.t)}</span><b>${esc(rkName(l))}</b>${r.hold[l.id] ? badge('Hold', 'warning', 'lock') : badge('Release', 'neutral')}</li>`).join('')}</ul>
    <p class="fine">${esc(fams.join(', '))} will be emailed.${held ? ` ${plural(held, 'held time')} stay${held === 1 ? 's' : ''} closed for good.` : ''} This can’t be undone.</p>
    ${B(`Cancel ${plural(sel.length, 'lesson')}`, 'danger', 'rkWeekCancel', { block: true, lg: true })}${B('Keep them', 'secondary', 'rkClose', { block: true, lg: true })}`, 'Confirm cancellation');
};

/* ================= Account ================= */
SCREENS.account = () => {
  const r = rk(), p = state.profile;
  return phoneShell(`
    <section class="rk-card"><div class="rk-who">${avatar(initials(p.first + ' ' + p.last))}<div><b>${esc(p.first)} ${esc(p.last)}</b><span class="muted-sm">${esc(p.loginEmail)}</span></div></div>
      <dl class="rk-kv"><div><dt>Rink</dt><dd>${RINK}</dd></div><div><dt>Last synced</dt><dd>${r.online ? r.syncedAt : `${r.syncedAt} · no signal now`}</dd></div><div><dt>Waiting to send</dt><dd>${r.queue.length ? plural(r.queue.length, 'check-in') : 'Nothing'}</dd></div></dl></section>
    <section class="rk-card"><b>Everything else is on the website</b><p class="fine">Your schedule, students, approvals, payments and profile are on bladebook.app. This app only sees today’s lessons, attendance and cancelling.</p></section>
    ${B('Log out', 'secondary', 'rkSignOut', { block: true, lg: true, icon: 'arrowL' })}`, { title: 'Account', sub: 'Rinkside app' });
};
RK_SHEETS.signout = () => sheet(`<div class="rk-sheeticon rk-sheeticon--warn">${ic('alert', 24)}</div><h2 class="h2">${plural(rk().queue.length, 'check-in')} haven’t been sent</h2>
  <p class="fine">They’re only on this phone. If you log out now, they’re deleted. Wait for signal, or record them again on the website.</p>
  ${B('Stay logged in', 'primary', 'rkClose', { block: true, lg: true })}${B('Log out and delete them', 'danger', 'rkSignOut', { block: true, lg: true })}`, 'Log out');

/* ================= presets ================= */
const lid = (sid, t) => state.lessons.find(l => l.iso === TODAY && l.sid === sid && l.t === t).id;
PRESETS.push(
  { id: 'RinkSignIn', file: 'signin', group: 'Sign in', title: 'Log in', note: 'New. Same email and password as the website, through the app’s own sign-in (ADR-014 d10); says what this app can and can’t do.', setup: st => { st.authed = false; st.screen = 'signin'; } },
  { id: 'RinkToday', file: 'today', group: 'Today', title: 'Today’s lessons', note: 'Redesigned from Forest RinkToday. 6:35 AM: Sam recorded, Mia under way, later lessons show their start time instead of buttons, the held slot in place.', setup: st => { st.screen = 'today'; } },
  { id: 'RinkMore', file: 'today-more', group: 'Today', title: 'More for one lesson', note: 'New. The “…” sheet: contact details and cancel, kept away from the Present and No-show buttons.', setup: st => { st.screen = 'today'; st.sheet = { kind: 'more', on: 'today', lid: lid('s7', 510) }; } },
  { id: 'RinkContact', file: 'today-contact', group: 'Today', title: 'Contact details', note: 'New. Fetched with signal for this tap only and never stored on the phone (ADR-014 d9b).', setup: st => { st.screen = 'today'; st.sheet = { kind: 'contact', on: 'today', lid: lid('s1', 390) }; } },
  { id: 'RinkContactOffline', file: 'today-contact-offline', group: 'Today', title: 'Contact details — no signal', note: 'New. Offline, the tap says “Contact details need a connection.” (ADR-014 d9b).', setup: st => { st.screen = 'today'; st.rk.online = false; st.sheet = { kind: 'contact', on: 'today', lid: lid('s1', 390) }; } },
  { id: 'RinkCancelConfirm', file: 'today-cancel', group: 'Today', title: 'Cancel one lesson', note: 'Redesigned from Forest RinkCancelConfirm. Always confirms, and asks release or hold (ADR-009 d5a).', setup: st => { st.screen = 'today'; st.sheet = { kind: 'cancel', on: 'today', lid: lid('s5', 600), hold: 0 }; } },
  { id: 'RinkOffline', file: 'offline', group: 'No signal', title: 'No signal — saved on the phone', note: 'Redesigned from Forest RinkOffline. 8:40 AM with no signal: two check-ins saved on the phone with their device times, waiting to send.', setup: st => { st.screen = 'today'; ACTIONS.rkSignal(false); NOW_MIN = CLOCK_LATE; ACTIONS.rkRecord(lid('s1', 390), 'NO_SHOW'); ACTIONS.rkRecord(lid('s7', 510), 'CHECKED_IN'); st.rk.undo = null; } },
  { id: 'RinkNotLoaded', file: 'not-loaded', group: 'No signal', title: 'Today’s lessons haven’t loaded', note: 'Redesigned from Forest RinkNotLoaded. Opened with no signal before today was ever loaded.', setup: st => { st.screen = 'today'; st.rk.online = false; st.rk.loaded = false; } },
  { id: 'RinkCouldntSend', file: 'unsent', group: 'No signal', title: 'Couldn’t be sent', note: 'Redesigned from Forest RinkCouldntSend. The family cancelled while the phone had no signal, so the no-show was turned down on replay and kept here (ADR-014 d4a).', setup: st => { ACTIONS.rkSignal(false); ACTIONS.rkRecord(lid('s1', 390), 'NO_SHOW'); ACTIONS.rkSignal(true); st.screen = 'unsent'; st.rk.toast = ''; } },
  { id: 'RinkFamilyCancelled', file: 'family-cancelled', group: 'No signal', title: 'Back online — the family had cancelled', note: 'Redesigned from Forest RinkFamilyCancelled. After the replay the cancelled lesson stays in place, struck through, and the banner points to what wasn’t sent.', setup: st => { st.screen = 'today'; ACTIONS.rkSignal(false); ACTIONS.rkRecord(lid('s1', 390), 'NO_SHOW'); ACTIONS.rkSignal(true); } },
  { id: 'RinkWeek', file: 'week', group: 'Cancel', title: 'Cancel several lessons', note: 'New. Part of a day or week is a multi-select of single lessons, release or hold per lesson; started lessons can’t be picked (ADR-009 d5a).', setup: st => { st.screen = 'week'; const a = lid('s5', 600); const b = state.lessons.find(l => l.iso === '2026-10-16' && l.sid === 's5').id; st.rk.sel = { [a]: true, [b]: true }; st.rk.hold = { [a]: true }; } },
  { id: 'RinkWeekConfirm', file: 'week-confirm', group: 'Cancel', title: 'Cancel several — confirm', note: 'New. One confirmation listing every lesson, which are held, and which families are emailed.', setup: st => { st.screen = 'week'; const a = lid('s5', 600); const b = state.lessons.find(l => l.iso === '2026-10-16' && l.sid === 's5').id; st.rk.sel = { [a]: true, [b]: true }; st.rk.hold = { [a]: true }; st.sheet = { kind: 'weekConfirm', on: 'week' }; } },
  { id: 'RinkAccount', file: 'account', group: 'Account', title: 'Account', note: 'New. Who is signed in, when the phone last synced, log out, and where everything else lives.', setup: st => { st.screen = 'account'; } },
);
