/* BladeBook coach website — Lessons, Payments, Profile and Email templates (Phase 2).
   Registers into SCREENS, ACTIONS, MODALS and PRESETS from app.js. UI state lives under
   state.ui.lessons, state.ui.pay, state.ui.prof and state.ui.tpl. */

/* ================= shared bits ================= */
const mpHappened = (from, to) => state.lessons.filter(l => l.sid && isPast(l) && l.iso >= from && l.iso <= to);
const mpEmpty = (icon, title, body) =>
  `<div class="mp-empty"><span class="mp-empty__icon">${ic(icon, 22)}</span><b>${title}</b><span class="muted">${body}</span></div>`;
/** Range check: '' when fine, else an error message. */
const mpRangeError = (from, to) => (from && to && from > to) ? 'The end date is before the start date.' : '';
const mpRangeBar = (fromPath, toPath, idp, extra = '') => {
  const err = mpRangeError(getPath(fromPath), getPath(toPath));
  return `<div class="filters mp-filters">${INP(idp + '-from', 'From', fromPath, { type: 'date', live: true })}${INP(idp + '-to', 'To', toPath, { type: 'date', live: true, error: err || '' })}${extra}</div>`;
};
const PAY_BADGE = { PAID: ['Paid', 'success', 'check'], WAIVED: ['Waived', 'neutral'], UNPAID: ['Unpaid', 'warning'] };
const payBadge = l => { const [t, v, i] = PAY_BADGE[l.pay]; return badge(t, v, i); };
const mpLesson = id => state.lessons.find(l => l.id === id);

/* ================= Lessons — attendance corrections ================= */
SCREENS.lessons = () => {
  const ui = (state.ui.lessons ??= { from: '', to: '' });
  const ready = ui.from && ui.to && !mpRangeError(ui.from, ui.to);
  let body;
  if (!ready) {
    body = card(mpEmpty('calendar', 'Pick a date range', 'Choose a start and end date to see the lessons in it.'));
  } else {
    const list = mpHappened(ui.from, ui.to);
    const nr = list.filter(l => statusOf(l) === 'NOT_RECORDED');
    const att = list.filter(l => l.status === 'CHECKED_IN').length, ns = list.filter(l => l.status === 'NO_SHOW').length;
    const rows = list.map(l => {
      const s = student(l.sid), st = statusOf(l);
      const on = l.status === 'CHECKED_IN' ? 0 : l.status === 'NO_SHOW' ? 1 : -1;
      return row(`${avatar(initials(s.name), 'sm')}${rowTitle(`${esc(s.name)}${st === 'NOT_RECORDED' ? ' ' + badge('Not recorded', 'warning', 'alert') : ''}`,
        `${dDow(l.iso)} · ${fmtT(l.t)} · ${l.len} min${s.rel !== 'Self' ? ' · ' + esc(s.client) : ''}`)}`,
        SEG(['Attended', 'No-show'], on, 'mpAttend', [l.id]), { cls: st === 'NOT_RECORDED' ? 'row--attn' : '' });
    }).join('');
    body = `
      ${nr.length ? banner('warning', `${plural(nr.length, 'lesson has', 'lessons have')} no attendance`, 'The rinkside app may still be holding a check-in that hasn’t been sent, or nobody recorded it. Pick Attended or No-show to settle it.') : ''}
      ${card(rows || mpEmpty('calendar', 'No lessons in this range', 'Only lessons that have already happened are listed.'),
        { title: plural(list.length, 'lesson'), sub: `${dFull(ui.from)} – ${dFull(ui.to)} · ${att} attended · ${ns} no-show${nr.length ? ` · ${nr.length} not recorded` : ''}`, pad: false })}`;
  }
  return shell(`
    ${pageHead('Lessons', 'Check who came. Fix anything recorded wrong at the rink here; the rinkside app can’t change a recorded lesson.')}
    ${mpRangeBar('ui.lessons.from', 'ui.lessons.to', 'les')}
    ${body}
    ${help('Changing a no-show', 'Switching a lesson to No-show doesn’t change its price. It stays unpaid until you mark it paid or waived on Payments.')}`, { width: 'wide' });
};
Object.assign(ACTIONS, {
  mpAttend(id, i) {
    const l = mpLesson(id); if (!l) return;
    l.status = i === 0 ? 'CHECKED_IN' : 'NO_SHOW';
    state.flash = `${student(l.sid).name}, ${dShort(l.iso)} ${fmtT(l.t)}: marked ${i === 0 ? 'attended' : 'no-show'}.`;
  },
});

/* ================= Payments ================= */
SCREENS.payments = () => {
  const ui = (state.ui.pay ??= { from: '', to: '', filter: 0 });
  const ready = ui.from && ui.to && !mpRangeError(ui.from, ui.to);
  const head = pageHead('Payments', 'Track who has paid. BladeBook doesn’t take payments; you mark them here.',
    `<span class="mp-phase">${B('Send reminders', 'secondary', '', { icon: 'mail', disabled: true })}${badge('Phase 2', 'neutral')}</span>`);
  const bar = mpRangeBar('ui.pay.from', 'ui.pay.to', 'pay', ready ? SEG(['Unpaid', 'All'], ui.filter, 'mpPayFilter') : '');
  if (!ready) return shell(`${head}${bar}${card(mpEmpty('card', 'Pick a date range', 'Choose a start and end date to see payments for the lessons in it.'))}`, { width: 'wide' });

  const all = mpHappened(ui.from, ui.to);
  const unpaid = all.filter(l => l.pay === 'UNPAID');
  const noShow = all.filter(l => l.status === 'NO_SHOW');
  const nr = all.filter(l => statusOf(l) === 'NOT_RECORDED');
  const paid = all.filter(l => l.pay === 'PAID');
  const list = ui.filter === 0 ? unpaid : all;
  const rowsHtml = list.map(l => {
    const s = student(l.sid);
    const acts = l.pay === 'UNPAID'
      ? `${B('Waive', 'ghost', 'mpWaive', { sm: true, args: [l.id] })}${B('Mark paid', 'secondary', 'mpPaid', { sm: true, icon: 'check', args: [l.id] })}`
      : `${B('Undo', 'ghost', 'mpUndo', { sm: true, icon: 'undo', args: [l.id] })}`;
    return `<tr${statusOf(l) === 'NOT_RECORDED' ? ' class="mp-attn"' : ''}><td><span class="cellname">${avatar(initials(s.name), 'sm')}<span>${esc(s.name)}${s.rel !== 'Self' ? `<small class="mp-sub">${esc(s.client)}</small>` : ''}</span></span></td>
      <td class="num">${dDow(l.iso)} · ${fmtT(l.t)}</td><td>${statusBadge(l)}</td><td class="r money">${money(l.price)}</td><td>${payBadge(l)}</td><td class="r"><span class="cellbtns">${acts}</span></td></tr>`;
  }).join('');
  const table = list.length
    ? `<div class="mp-tablewrap"><table class="table"><thead><tr><th>Skater</th><th>Lesson</th><th>Attendance</th><th class="r">Amount</th><th>Payment</th><th class="r"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`
    : mpEmpty('check', 'Nothing unpaid in this range', 'Every lesson here is paid or waived. Switch to All to see them.');
  return shell(`
    ${head}${bar}
    <div class="stats">
      ${stat('Unpaid', money(unpaid.reduce((s, l) => s + l.price, 0)), plural(unpaid.length, 'lesson'), 'card')}
      ${stat('No-shows', String(noShow.length), `${money(noShow.filter(l => l.pay === 'UNPAID').reduce((s, l) => s + l.price, 0))} unpaid`, 'x')}
      ${stat('Not recorded', String(nr.length), nr.length ? `<a class="link" href="${href('lessons')}">Check attendance</a>` : 'All recorded', 'alert')}
      ${stat('Paid', money(paid.reduce((s, l) => s + l.price, 0)), plural(paid.length, 'lesson'), 'check')}
    </div>
    ${card(table + `<div class="card__note">${ic('info', 14)} A no-show shows the full lesson price until you mark it paid or waived. Upcoming lessons aren’t listed until they’ve happened. All amounts are in ${state.profile.currency}.</div>`,
      { title: ui.filter === 0 ? 'Unpaid lessons' : 'All lessons', sub: `${dFull(ui.from)} – ${dFull(ui.to)}`, pad: false })}`, { width: 'wide' });
};
Object.assign(ACTIONS, {
  mpPayFilter(i) { state.ui.pay.filter = i; },
  mpPaid(id) { const l = mpLesson(id); if (!l) return; l.pay = 'PAID'; state.flash = `${student(l.sid).name}, ${dShort(l.iso)}: marked paid.`; },
  mpWaive(id) { const l = mpLesson(id); if (!l) return; l.pay = 'WAIVED'; state.flash = `${student(l.sid).name}, ${dShort(l.iso)}: waived.`; },
  mpUndo(id) { const l = mpLesson(id); if (!l) return; l.pay = 'UNPAID'; state.flash = `${student(l.sid).name}, ${dShort(l.iso)}: back to unpaid.`; },
});

/* ================= Profile ================= */
const PROFILE_TABS = [['profile', 'Details'], ['profile-email', 'Business email'], ['profile-visibility', 'Visibility & texts'], ['profile-payments', 'Payments'], ['profile-account', 'Account']];
function profileShell(body) {
  const tabs = `<nav class="tabs mp-tabs" aria-label="Profile sections">${PROFILE_TABS.map(([s, l]) => `<a class="tabs__t${state.screen === s ? ' is-on' : ''}" href="${href(s)}"${state.screen === s ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
  return shell(`${pageHead('Profile', 'How families see and reach you, and how you sign in.')}${tabs}${body}`);
}
const saveBar = (note = '') => `<div class="actions"><div>${note ? `<span class="muted-sm">${note}</span>` : ''}</div><div class="actions__r">${B('Save', 'primary', 'mpSave')}</div></div>`;
const TIMEZONES = ['Eastern — New York', 'Central — Chicago', 'Mountain — Denver', 'Pacific — Los Angeles', 'Eastern — Toronto', 'Mountain — Edmonton', 'Pacific — Vancouver'];

SCREENS.profile = () => {
  const p = state.profile;
  return profileShell(`
    ${card(`
      <div class="grid2">${INP('pf-first', 'First name', 'profile.first')}${INP('pf-last', 'Last name', 'profile.last')}</div>
      <div class="hint">Shown on your booking page and in every email families get.</div>
      <div class="grid2">${INP('pf-phone', 'Phone', 'profile.phone', { type: 'tel', hint: 'Families see it only if you switch it on under Visibility.' })}${SEL('pf-tz', 'Time zone', 'profile.tz', TIMEZONES.map(z => [z, z]), { hint: 'Lesson times and your daily report use it.' })}</div>
      <div class="fieldset"><div class="label">Profile photo <span class="label__opt">Optional</span></div>
        <div class="mp-photo">${avatar(initials(p.first + ' ' + p.last), 'lg')}<div class="mp-photo__text">${p.photo ? '<b>Photo uploaded</b>' : '<b>No photo</b>'}<span class="hint">JPG or PNG, up to 2 MB. Families see it after they enter your coach code.</span></div>
        <span class="cellbtns">${B(p.photo ? 'Change' : 'Upload', 'secondary', 'noop', { sm: true })}${p.photo ? B('Remove', 'ghost', 'mpPhotoRemove', { sm: true }) : ''}</span></div></div>
      <div class="fieldset"><div class="label">Currency</div><div class="input input--readonly"><span class="input__val">${p.currency === 'USD' ? 'USD — US dollar' : 'CAD — Canadian dollar'}</span>${ic('lock', 14)}</div><div class="hint">Every lesson is priced in this. Changing currency comes in Phase 2.</div></div>`,
      { title: 'About you' })}
    ${card(`
      <div class="codecard"><div><div class="codecard__label">Your coach code</div><div class="codecard__code">${p.code}</div><div class="codecard__sub">Families enter this to sign up with you.</div></div>
        <span class="cellbtns">${B('Copy', 'secondary', 'copyCode', { icon: 'copy' })}${B('Rotate code', 'ghost', 'mpRotateAsk', { icon: 'refresh' })}</span></div>
      <p class="fine">Shared your code somewhere you didn’t mean to? Rotate it. The old code stops working for new sign-ups. Families already signed up aren’t affected.</p>`,
      { title: 'Coach code' })}
    ${saveBar()}`);
};
SCREENS['profile-email'] = () => {
  const p = state.profile, ui = (state.ui.prof ??= {});
  const opt = (e, i) => {
    const on = e.addr === p.businessEmail, isLogin = e.addr === p.loginEmail;
    if (e.pending) return `<div class="rcard mp-rcard--pending"><span class="rcard__icon">${ic('mail', 20)}</span><div class="rcard__text"><div class="rcard__title">${esc(e.addr)}</div><div class="rcard__sub">Confirmation link sent. You can choose it once it’s confirmed.</div></div>
      <span class="cellbtns">${B('I’ve clicked the link', 'ghost', 'mpConfirmEmail', { sm: true, args: [i] })}<a class="link link--danger" data-act="mpRemoveEmail" data-arg='[${i}]'>Remove</a></span></div>`;
    return `<div class="mp-rrow"><button type="button" class="rcard${on ? ' is-on' : ''}" data-act="mpPickEmail" data-arg='[${i}]' aria-pressed="${on}"><span class="rcard__icon">${ic('mail', 20)}</span><span class="rcard__text"><span class="rcard__title">${esc(e.addr)}</span><span class="rcard__sub">${on ? 'Current · confirmed' : isLogin ? 'Your login email · verified' : 'Confirmed'}</span></span><span class="radio${on ? ' is-on' : ''}"></span></button>
      ${!on && !isLogin ? `<a class="link link--danger mp-remove" data-act="mpRemoveEmail" data-arg='[${i}]'>Remove</a>` : ''}</div>`;
  };
  return profileShell(`
    ${card(`<div class="mp-radios">${p.emails.map(opt).join('')}</div>
      ${ui.adding ? `<div class="mp-add">${INP('pf-newemail', 'New business email', 'ui.prof.newEmail', { type: 'email', placeholder: 'you@example.com', error: ui.emailErr || '' })}
        <div class="cellbtns">${B('Cancel', 'secondary', 'mpAddCancel', { sm: true })}${B('Send confirmation link', 'primary', 'mpAddEmail', { sm: true })}</div></div>`
        : `<button type="button" class="addrow" data-act="mpAddStart">${ic('plus', 16)}Use a new address</button>`}`,
      { title: 'Business email', sub: 'The reply address on lesson reminders and every other automatic email. Replies from families come here.' })}
    ${help('Why a new address needs a link first', 'A typo would send every family’s replies to a stranger. Families keep seeing your current address until the new one is confirmed.')}
    ${saveBar()}`);
};
SCREENS['profile-visibility'] = () => {
  const p = state.profile;
  const handles = [p.venmo && 'Venmo ' + p.venmo, p.cashapp && 'Cash App ' + p.cashapp, p.paypal && 'PayPal ' + p.paypal].filter(Boolean).join(' · ') || 'No handles yet. Add them under Payments.';
  return profileShell(`
    ${card(`
      ${TOG('Phone number', p.showPhone, esc(p.phone), 'mpToggle', ['showPhone'])}
      ${TOG('Email address', p.showEmail, esc(p.businessEmail), 'mpToggle', ['showEmail'])}
      ${TOG('Payment handles', p.showHandles, esc(handles), 'mpToggle', ['showHandles'])}
      <div class="card__note">${ic('info', 14)} Your payment instructions always appear in payment-reminder emails. Replies always reach your business email, whichever of these are on.</div>`,
      { title: 'What families can see', sub: 'Only families you’ve approved. Never someone who has only entered your coach code.', pad: false })}
    ${card(`
      ${TOG('Text me when a family cancels', p.smsCancel, `To ${esc(p.phone)}. Msg &amp; data rates may apply. Reply STOP to stop.`, 'mpToggle', ['smsCancel'])}
      <div class="smsprev"><div class="smsprev__label">Example</div><div class="smsprev__bubble">BladeBook: Mia C. cancelled Wed 21 Oct 6:30am. See email.</div></div>`,
      { title: 'Texts to you', sub: 'You always get an email when a family cancels. Texts are extra.', pad: false })}
    ${saveBar()}`);
};
SCREENS['profile-payments'] = () => profileShell(`
  ${card(`
    ${TXT('pf-instr', 'How families pay you', 'profile.instructions', { rows: 3, hint: 'Always included in payment reminders. BladeBook doesn’t take payments itself.' })}
    <div class="grid3 mp-grid3">${INP('pf-venmo', 'Venmo', 'profile.venmo', { optional: true, placeholder: '@handle' })}${INP('pf-cash', 'Cash App', 'profile.cashapp', { optional: true, placeholder: '$cashtag' })}${INP('pf-paypal', 'PayPal', 'profile.paypal', { optional: true, placeholder: 'paypal.me/you' })}</div>
    <div class="hint">Handles appear in reminders only when <a class="link" href="${href('profile-visibility')}">Payment handles</a> is switched on.</div>`,
    { title: 'Getting paid' })}
  ${saveBar()}`);
SCREENS['profile-account'] = () => {
  const p = state.profile;
  return profileShell(`
    ${card(`
      <div class="fieldset"><div class="label">Login email</div><div class="input input--readonly"><span class="input__val">${esc(p.loginEmail)}</span>${badge('Verified', 'success', 'check')}</div>
        <div class="hint">You sign in with this and your daily report comes here. It can’t be changed from this page; families never see it unless it’s also your business email.</div></div>
      ${row(`<span class="roundicon">${ic('lock', 16)}</span>${rowTitle('Password', 'Sign-in is handled by Amazon Cognito.')}`, B('Change password', 'secondary', 'mpPwOpen', { sm: true }), { cls: 'row--boxed' })}`,
      { title: 'Signing in' })}
    ${card(`
      ${row(`<span class="roundicon">${ic('phone', 16)}</span>${rowTitle('BladeBook rinkside app', 'Check skaters in from your phone. It uses the same email and password, and can only see today’s lessons.')}`, '')}`,
      { title: 'Rinkside app', pad: false })}
    <div class="actions"><div></div><div class="actions__r">${B('Log out', 'secondary', 'logout', { icon: 'arrowL' })}</div></div>`);
};
MODALS.mpRotate = () => `
  <div class="dialog__icon dialog__icon--danger">${ic('refresh', 22)}</div>
  <h2 class="h2">Rotate your coach code?</h2>
  <div class="dialog__what"><b>${state.profile.code}</b><span>stops working for new sign-ups</span></div>
  <p class="fine">You’ll get a new code to share. Families already signed up keep booking as before.</p>
  <div class="dialog__actions">${B('Keep this code', 'secondary', 'closeModal')}${B('Rotate code', 'danger', 'mpRotate')}</div>`;
MODALS.mpPassword = () => `
  <h2 class="h2">Change password</h2>
  ${INP('pw-cur', 'Current password', 'ui.prof.pwCur', { type: 'password' })}
  ${INP('pw-new', 'New password', 'ui.prof.pwNew', { type: 'password', placeholder: 'At least 8 characters' })}
  ${pwRules()}
  <p class="fine">Your rinkside app stays signed in until its session runs out.</p>
  <div class="dialog__actions">${B('Cancel', 'secondary', 'closeModal')}${B('Change password', 'primary', 'mpPwSave')}</div>`;
const MP_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
Object.assign(ACTIONS, {
  mpSave() { state.flash = 'Saved.'; },
  mpToggle(key) { state.profile[key] = !state.profile[key]; },
  mpPhotoRemove() { state.profile.photo = false; },
  mpRotateAsk() { state.modal = { kind: 'mpRotate' }; },
  mpRotate() {
    const p = state.profile, old = p.code;
    let s = ''; for (let i = 0; i < 4; i++) s += MP_CODE_CHARS[(hash(old + i + s) + i * 7) % MP_CODE_CHARS.length];
    p.code = p.first.toUpperCase().slice(0, 4) + '-' + s;
    state.modal = null; state.flash = `New code: ${p.code}. ${old} no longer works for new sign-ups.`;
  },
  mpPickEmail(i) { const e = state.profile.emails[i]; if (e && !e.pending) state.profile.businessEmail = e.addr; },
  mpRemoveEmail(i) { const p = state.profile, e = p.emails[i]; if (!e || e.addr === p.businessEmail || e.addr === p.loginEmail) return; p.emails.splice(i, 1); },
  mpAddStart() { const ui = (state.ui.prof ??= {}); ui.adding = true; ui.newEmail = ''; ui.emailErr = ''; },
  mpAddCancel() { const ui = state.ui.prof; ui.adding = false; ui.emailErr = ''; },
  mpAddEmail() {
    const ui = state.ui.prof, a = (ui.newEmail || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) { ui.emailErr = 'Enter an email address like you@example.com.'; return; }
    if (state.profile.emails.some(e => e.addr === a)) { ui.emailErr = 'That address is already on your list.'; return; }
    state.profile.emails.push({ addr: a, pending: true }); ui.adding = false; ui.emailErr = '';
    state.flash = `Confirmation link sent to ${a}.`;
  },
  mpConfirmEmail(i) { const e = state.profile.emails[i]; if (e) { delete e.pending; state.flash = `${e.addr} is confirmed. Choose it to make it your business email.`; } },
  mpPwOpen() { const ui = (state.ui.prof ??= {}); ui.pwCur = ''; ui.pwNew = ''; state.modal = { kind: 'mpPassword' }; },
  mpPwSave() { state.modal = null; state.flash = 'Password changed.'; },
});

/* ================= Email templates (Phase 2) ================= */
const MP_TEMPLATES = [
  { key: 'confirm', who: 'families', name: 'Booking confirmation', when: 'When a family books', subject: 'Booked: Mia’s lesson on Wed, Oct 21 at 6:30 AM',
    body: p => `<p>Hi Grace,</p><p>Mia is booked with ${esc(p.first)} ${esc(p.last)}:</p><p><b>Wed, Oct 21 · 6:30 AM · 30 min · $50</b><br>Pelham Ice Rink</p><p>Need to cancel? Use My bookings on BladeBook. Cancelling within ${p.notice} hours may incur a fee.</p>` },
  { key: 'reminder', who: 'families', name: 'Day-of reminder', when: 'Morning of each lesson', subject: 'Today: Mia’s lesson at 6:30 AM',
    body: p => `<p>Hi Grace,</p><p>A reminder that Mia has a lesson with ${esc(p.first)} today at <b>6:30 AM</b> (30 min).</p><p>See you at the rink.</p>` },
  { key: 'payment', who: 'families', name: 'Payment reminder', when: 'After a lesson is checked in', subject: 'Payment for Mia’s lesson on Oct 14',
    body: p => `<p>Hi Grace,</p><p>Thanks for Mia’s lesson on <b>Wed, Oct 14</b>. The amount is <b>$50</b>.</p><p>${esc(p.instructions)}</p>${p.showHandles ? `<p>Venmo ${esc(p.venmo)} · Cash App ${esc(p.cashapp)}</p>` : ''}` },
  { key: 'coachCancel', who: 'families', name: 'Lesson cancelled by you', when: 'When you cancel a lesson, day or week', required: true, subject: 'Cancelled: Mia’s lesson on Wed, Oct 21',
    body: p => `<p>Hi Grace,</p><p>${esc(p.first)} has cancelled Mia’s lesson on <b>Wed, Oct 21 at 6:30 AM</b>.</p><p>You won’t be charged. Book another time on BladeBook.</p>` },
  { key: 'schedule', who: 'families', name: 'Schedule change', when: 'When a schedule save cancels or re-prices lessons', required: true, subject: 'Changes to Mia’s upcoming lessons',
    body: p => `<p>Hi Grace,</p><p>${esc(p.first)} changed their schedule. This affects Mia’s lessons:</p><p><b>Cancelled:</b> Mon, Nov 2 · 6:00 AM<br><b>New price:</b> Wed, Nov 4 · 6:30 AM, $50 → $55</p><p>Book another time on BladeBook.</p>` },
  { key: 'declined', who: 'families', name: 'Sign-up declined', when: 'When you decline a new skater', required: true, subject: 'Your sign-up with Dana Whitfield',
    body: p => `<p>Hi Sarah,</p><p>${esc(p.first)} ${esc(p.last)} doesn’t have availability to take on new students right now, so Ava’s sign-up wasn’t accepted.</p>` },
  { key: 'report', who: 'you', name: 'Daily report', when: 'Every evening at 9 PM', subject: 'Today: 5 lessons, 4 checked in, 1 not recorded',
    body: () => `<p>Your lessons for Wed, Oct 14:</p><p><b>Checked in:</b> Sam R. 6:00, Mia C. 6:30, Owen B. 8:30, Leo M. 10:00<br><b>Not recorded:</b> none</p>` },
  { key: 'familyCancel', who: 'you', name: 'A family cancelled', when: 'When a family cancels a lesson', required: true, subject: 'Mia C. cancelled Wed, Oct 21 at 6:30 AM',
    body: () => `<p>Grace Chen cancelled Mia’s lesson on <b>Wed, Oct 21 at 6:30 AM</b>. The time is open for booking again.</p>` },
  { key: 'unpaid', who: 'you', name: 'Unpaid lessons', when: 'Weekly, on Monday morning', subject: '4 lessons are still unpaid',
    body: () => `<p>These lessons are more than a week old and still unpaid:</p><p>Leo M. · Fri, Sep 4 · $50<br>Ella A. · Fri, Oct 9 · $50</p><p>Mark each one paid or waived on Payments.</p>` },
];
SCREENS['email-templates'] = () => {
  const ui = (state.ui.tpl ??= { sel: 'confirm', off: {} });
  const p = state.profile, t = MP_TEMPLATES.find(x => x.key === ui.sel) || MP_TEMPLATES[0];
  const item = x => `<div class="mp-tpl${x.key === t.key ? ' is-on' : ''}"><button type="button" class="mp-tpl__pick" data-act="mpTpl" data-arg='["${x.key}"]' aria-pressed="${x.key === t.key}"><span class="mp-tpl__name">${x.name}</span><span class="mp-tpl__when">${x.when}</span></button>
    ${x.required ? badge('Always sent', 'neutral', 'lock') : `<button type="button" class="switch${ui.off[x.key] ? '' : ' is-on'}" role="switch" aria-checked="${!ui.off[x.key]}" aria-label="Send ${esc(x.name)}" data-act="mpTplToggle" data-arg='["${x.key}"]'><span class="switch__knob"></span></button>`}</div>`;
  const group = (who, title, sub) => card(MP_TEMPLATES.filter(x => x.who === who).map(item).join(''), { title, sub, pad: false });
  const off = !t.required && ui.off[t.key];
  return shell(`
    ${pageHead('Email templates', 'See what each automatic email says, and choose which ones go out.', badge('Phase 2', 'neutral'), crumb('profile', 'Profile'))}
    ${banner('info', 'Coming in Phase 2', 'This page isn’t in the first release. Until then, every email here is sent automatically.')}
    <div class="split mp-split">
      <div class="stack">
        ${group('families', 'Emails families get', 'Emails about cancellations and schedule changes are always sent, so families are never left guessing.')}
        ${group('you', 'Emails you get')}
      </div>
      ${card(`
        <div class="mp-mail${off ? ' is-off' : ''}">
          <div class="mp-mail__head">
            ${kv('From', `${esc(p.first)} ${esc(p.last)} via BladeBook`)}
            ${kv('Reply-To', t.who === 'families' ? esc(p.businessEmail) : 'no-reply@bladebook.app')}
            ${kv('To', t.who === 'families' ? (t.key === 'declined' ? 'sarah.park@example.com' : 'grace.chen@example.com') : esc(p.loginEmail))}
            ${kv('Subject', `<b>${esc(t.subject)}</b>`)}
          </div>
          <div class="mp-mail__body">${t.body(p)}<p class="mp-mail__sig">— ${esc(p.first)} ${esc(p.last)}</p></div>
        </div>
        ${off ? `<div class="card__note">${ic('info', 14)} Switched off. This email won’t be sent.</div>` : ''}`,
        { title: 'Preview', sub: `${t.name} · ${t.when}`, pad: false })}
    </div>`, { width: 'wide' });
};
Object.assign(ACTIONS, {
  mpTpl(key) { (state.ui.tpl ??= { sel: 'confirm', off: {} }).sel = key; },
  mpTplToggle(key) { const ui = (state.ui.tpl ??= { sel: 'confirm', off: {} }); ui.off[key] = !ui.off[key]; ui.sel = key; },
});

/* ================= presets ================= */
PRESETS.push(
  { id: 'CoachLessonsEmpty', file: 'lessons-empty', group: 'Lessons', title: 'Lessons — pick a date range', note: 'Redesigned from Forest CoachLessonList: nothing is listed until both dates are set.', setup: st => { st.screen = 'lessons'; } },
  { id: 'CoachLessonList', file: 'lessons', group: 'Lessons', title: 'Lessons — correct attendance', note: 'Redesigned from Forest CoachLessonList: attendance per lesson, with Ella’s unrecorded lesson on Oct 9 flagged.', setup: st => { st.screen = 'lessons'; st.ui.lessons = { from: '2026-10-05', to: '2026-10-14' }; } },
  { id: 'CoachPaymentsEmpty', file: 'payments-empty', group: 'Payments', title: 'Payments — pick a date range', note: 'Redesigned from Forest CoachPayments: the date range comes first.', setup: st => { st.screen = 'payments'; } },
  { id: 'CoachPayments', file: 'payments', group: 'Payments', title: 'Payments — unpaid', note: 'Redesigned from Forest CoachPayments: unpaid lessons with Mark paid and Waive, and reminders shown as Phase 2.', setup: st => { st.screen = 'payments'; st.ui.pay = { from: '2026-09-01', to: '2026-10-14', filter: 0 }; } },
  { id: 'CoachPaymentsAll', file: 'payments-all', group: 'Payments', title: 'Payments — all lessons', note: 'Redesigned from Forest CoachPayments: every lesson in the range, with Undo on paid and waived ones.', setup: st => { st.screen = 'payments'; st.ui.pay = { from: '2026-09-01', to: '2026-10-14', filter: 1 }; } },
  { id: 'CoachProfileDetails', file: 'profile-details', group: 'Profile', title: 'Profile — details and coach code', note: 'New: name, phone, time zone, photo, read-only currency and the coach code with Rotate.', setup: st => { st.screen = 'profile'; } },
  { id: 'CoachProfileEmail', file: 'profile-email', group: 'Profile', title: 'Profile — business email', note: 'Redesigned from Forest CoachProfileEmail: a new address needs a confirmation link before it can be chosen.', setup: st => { st.screen = 'profile-email'; st.profile.emails.push({ addr: 'dana@pelhamfsc.org', pending: true }); } },
  { id: 'CoachProfileVisibility', file: 'profile-visibility', group: 'Profile', title: 'Profile — visibility and texts', note: 'Redesigned from Forest CoachProfileVisibility: what approved families see, and the cancellation text.', setup: st => { st.screen = 'profile-visibility'; } },
  { id: 'CoachProfilePayments', file: 'profile-payments', group: 'Profile', title: 'Profile — payment details', note: 'New: payment instructions and Venmo, Cash App and PayPal handles.', setup: st => { st.screen = 'profile-payments'; } },
  { id: 'CoachProfileAccount', file: 'profile-account', group: 'Profile', title: 'Profile — account', note: 'New: login email, password change through Cognito, the rinkside app, and Log out.', setup: st => { st.screen = 'profile-account'; } },
  { id: 'CoachEmailTemplates', file: 'email-templates', group: 'Phase 2', title: 'Email templates', note: 'New, Phase 2: each automatic email with an on/off switch and a preview; cancellation and schedule-change emails can’t be turned off.', setup: st => { st.screen = 'email-templates'; } },
);
