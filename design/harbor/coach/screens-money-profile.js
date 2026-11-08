/* BladeBook coach website — Lessons, Payments, Financial summary, Profile and Email templates (Phase 2).
   Registers into SCREENS, ACTIONS, MODALS and PRESETS from app.js. UI state lives under
   state.ui.lessons, state.ui.pay, state.ui.fin, state.ui.prof and state.ui.tpl.
   Lessons and Payments list one row per skater: a shared lesson has a row for each, with their own attendance and
   payment (ADR-026 d6). Actions take the lesson id and k (-1 for the booking skater, else the index in l.with). */

/* ================= shared bits ================= */
const mpHappened = (from, to) => state.lessons.filter(l => l.sid && isPast(l) && l.iso >= from && l.iso <= to).flatMap(skatersIn);
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
/** The object holding one skater's attendance and payment: the lesson itself (k = -1) or its entry in l.with. */
const mpPart = (id, k = -1) => { const l = mpLesson(id); return !l ? null : k < 0 ? l : (l.with || [])[k] || null; };
const mpSharedWith = p => isShared(p.lesson) ? `<small class="mp-sub">${ic('users', 12)} Shared with ${skatersIn(p.lesson).filter(x => x.sid !== p.sid).map(x => esc(shortName(student(x.sid).name))).join(', ')}</small>` : '';
/** How-paid choices: the payment types the coach takes, plus Other (ADR-003 d4). A stored value whose type was later
   switched off is kept as a choice, so editing never loses it. */
const mpHowOpts = part => { const o = payTypesFor(state.profile); return part && part.paidBy && !o.some(([v]) => v === part.paidBy) ? [...o.slice(0, -1), [part.paidBy, PAID_BY_LABEL[part.paidBy]], o[o.length - 1]] : o; };

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
      return row(`${avatar(initials(s.name), 'sm')}<div>${rowTitle(`${esc(s.name)}${st === 'NOT_RECORDED' ? ' ' + badge('Not recorded', 'warning', 'alert') : ''}`,
        `${dDow(l.iso)} · ${fmtT(l.t)} · ${l.len} min${s.rel !== 'Self' ? ' · ' + esc(s.client) : ''}`)}${mpSharedWith(l)}</div>`,
        SEG(['Attended', 'No-show'], on, 'mpAttend', [l.id, l.k]), { cls: st === 'NOT_RECORDED' ? 'row--attn' : '' });
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
    ${help('Changing a no-show', 'Switching a lesson to No-show doesn’t change its price. It stays unpaid until you mark it paid or waived on Payments. In a shared lesson each skater has their own attendance.')}`, { width: 'wide' });
};
Object.assign(ACTIONS, {
  mpAttend(id, k, i) {
    const l = mpLesson(id), p = mpPart(id, k); if (!p) return;
    p.status = i === 0 ? 'CHECKED_IN' : 'NO_SHOW';
    state.flash = `${student(p.sid).name}, ${dShort(l.iso)} ${fmtT(l.t)}: marked ${i === 0 ? 'attended' : 'no-show'}.`;
  },
});

/* ================= Payments ================= */
SCREENS.payments = () => {
  const ui = (state.ui.pay ??= { from: '', to: '', filter: 0 });
  const ready = ui.from && ui.to && !mpRangeError(ui.from, ui.to);
  const head = pageHead('Payments', 'Track who has paid. BladeBook doesn’t take payments; you mark them here.',
    `${B('Financial summary', 'secondary', '', { icon: 'trend', href: href('finances') })}<span class="mp-phase">${B('Send reminders', 'secondary', '', { icon: 'mail', disabled: true })}${badge('Phase 2', 'neutral')}</span>`);
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
      ? `${B('Waive', 'ghost', 'mpWaive', { sm: true, args: [l.id, l.k] })}${B('Mark paid', 'secondary', 'mpPaidOpen', { sm: true, icon: 'check', args: [l.id, l.k] })}`
      : `${B('Undo', 'ghost', 'mpUndo', { sm: true, icon: 'undo', args: [l.id, l.k] })}`;
    // How they paid sits under the Paid badge and can be changed afterwards. Waived lessons have none.
    const how = l.pay !== 'PAID' ? '' : `<small class="mp-how">${l.paidBy ? `${PAID_BY_LABEL[l.paidBy]} · ` : ''}<a class="link" data-act="mpHowOpen" data-arg='${esc(JSON.stringify([l.id, l.k]))}'>${l.paidBy ? 'Change' : 'Add how they paid'}</a></small>`;
    return `<tr${statusOf(l) === 'NOT_RECORDED' ? ' class="mp-attn"' : ''}><td><span class="cellname">${avatar(initials(s.name), 'sm')}<span>${esc(s.name)}${s.rel !== 'Self' ? `<small class="mp-sub">${esc(s.client)}</small>` : ''}${mpSharedWith(l)}</span></span></td>
      <td class="num">${dDow(l.iso)} · ${fmtT(l.t)}</td><td>${statusBadge(l)}</td><td class="r money">${money(l.price)}</td><td>${payBadge(l)}${how}</td><td class="r"><span class="cellbtns">${acts}</span></td></tr>`;
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
    ${card(table + `<div class="card__note">${ic('info', 14)} A no-show shows the full lesson price until you mark it paid or waived. Upcoming lessons aren’t listed until they’ve happened. Each skater in a shared lesson pays for themselves. How a family paid is for your records only; families don’t see it. All amounts are in ${state.profile.currency}.</div>`,
      { title: ui.filter === 0 ? 'Unpaid lessons' : 'All lessons', sub: `${dFull(ui.from)} – ${dFull(ui.to)}`, pad: false })}`, { width: 'wide' });
};
Object.assign(ACTIONS, {
  mpPayFilter(i) { state.ui.pay.filter = i; },
  mpPaidOpen(id, k = -1) { state.ui.pay.how = -1; state.modal = { kind: 'mpHow', id, k, edit: false }; },
  mpHowOpen(id, k = -1) { const p = mpPart(id, k); if (!p) return; state.ui.pay.how = mpHowOpts(p).findIndex(([v]) => v === p.paidBy); state.modal = { kind: 'mpHow', id, k, edit: true }; },
  mpHowPick(i) { const ui = state.ui.pay; ui.how = ui.how === i ? -1 : i; },
  mpHowSave() {
    const m = state.modal, l = mpLesson(m.id), p = mpPart(m.id, m.k); if (!p) return;
    const how = state.ui.pay.how, v = how >= 0 ? mpHowOpts(p)[how][0] : null;
    p.pay = 'PAID'; p.paidBy = v; state.modal = null;
    state.flash = `${student(p.sid).name}, ${dShort(l.iso)}: ${m.edit ? (v ? `paid by ${PAID_BY_LABEL[v]}.` : 'how they paid cleared.') : `marked paid${v ? ` by ${PAID_BY_LABEL[v]}` : ''}.`}`;
  },
  mpWaive(id, k = -1) { const l = mpLesson(id), p = mpPart(id, k); if (!p) return; p.pay = 'WAIVED'; p.paidBy = null; state.flash = `${student(p.sid).name}, ${dShort(l.iso)}: waived.`; },
  mpUndo(id, k = -1) { const l = mpLesson(id), p = mpPart(id, k); if (!p) return; p.pay = 'UNPAID'; p.paidBy = null; state.flash = `${student(p.sid).name}, ${dShort(l.iso)}: back to unpaid.`; },
});
/* Mark paid, with how they paid (ADR-003 d4, amended 2026-10-12): optional, editable afterwards, coach-only, fixed values. */
MODALS.mpHow = m => {
  const l = mpLesson(m.id), p = mpPart(m.id, m.k), opts = mpHowOpts(p), on = state.ui.pay.how;
  return `<div class="dialog__icon">${ic('check', 22)}</div>
    <h2 class="h2">${m.edit ? 'How did they pay?' : 'Mark paid'}</h2>
    <div class="dialog__what"><b>${esc(student(p.sid).name)}</b><span>${dDow(l.iso)} · ${fmtT(l.t)} · ${money(p.price)}</span></div>
    <div class="fieldset mp-how-pick"><div class="label">How did they pay? <span class="label__opt">Optional</span></div>
      ${SEG(opts.map(([, t]) => t), on, 'mpHowPick', [], { block: true })}
      <div class="hint">For your records only; families don’t see it. These are the payment types on your <a class="link" href="${href('profile-payments')}">profile</a>, plus Other.${on >= 0 ? ' Pick it again to clear it.' : ''}</div></div>
    <div class="dialog__actions">${B('Cancel', 'secondary', 'closeModal')}${B(m.edit ? 'Save' : 'Mark paid', 'primary', 'mpHowSave', { icon: m.edit ? '' : 'check' })}</div>`;
};

/* ================= Financial summary (MVP feature 16) =================
   Gross is money received: lessons marked paid, plus missed-lesson fees actually collected (a no-show marked paid).
   Waived and unpaid lessons are left out; the year is the calendar year (Open-Pending §3, settled 2026-10-12).
   BladeBook calculates rink fees, but how is open (docs/Q_Rink-Fees.md). Each rink's terms are added by the developer when
   BladeBook reaches that rink, and the coach can't change them or enter what they paid (owner, 2026-10-12: B18, B19).
   This page shows one reading of the rest: figure skating is 15% of each month's gross or $500 a month, the coach's
   choice (Kim Q1–2), and a lesson counts in the month it was taught (Q6). */
const FIN_YEAR = TODAY.slice(0, 4);
const FIN_TERMS = { percent: 0.15, flat: 500, hockeyHour: 10 };
const finMonths = () => {
  const out = [];
  for (let m = 0; m <= parseIso(TODAY).getMonth(); m++) {
    const ym = `${FIN_YEAR}-${String(m + 1).padStart(2, '0')}`;
    const parts = state.lessons.filter(l => l.sid && l.iso.startsWith(ym) && isPast(l)).flatMap(skatersIn);
    const paid = parts.filter(p => p.pay === 'PAID');
    const gross = paid.reduce((s, p) => s + p.price, 0);
    const calc = !parts.length ? 0 : state.profile.rinkPlan === 'flat' ? FIN_TERMS.flat : Math.round(gross * FIN_TERMS.percent);
    out.push({ ym, m, parts, paid, gross, fee: calc, unpaid: parts.filter(p => p.pay === 'UNPAID').reduce((s, p) => s + p.price, 0), waived: parts.filter(p => p.pay === 'WAIVED').reduce((s, p) => s + p.price, 0) });
  }
  return out;
};

/* Summary export (ADR-030 d7, MVP): a CSV for this year or last, one row per month, no personal data. */
MODALS.finExport = () => { const y = state.ui.finYear || 0; return `
  <div class="dialog__icon">${ic('arrowR', 22)}</div>
  <h2 class="h2">Download a summary</h2>
  <p class="fine">A CSV file with one row per month: gross received, rink fees and net, plus the year’s totals. No skater names.</p>
  <div class="fieldset"><div class="label">Year</div>${SEG([`${FIN_YEAR} so far`, String(FIN_YEAR - 1)], y, 'finExportYear', [], { block: true })}
    <div class="hint">${y ? `${FIN_YEAR - 1} is closed, so its figures won’t change.` : 'Calculated from the lessons you’ve marked as paid.'}</div></div>
  <div class="dialog__actions">${B('Cancel', 'secondary', 'closeModal')}${B('Download CSV', 'primary', 'finExport')}</div>`; };
SCREENS.finances = () => {
  const p = state.profile, months = finMonths(), cur = state.profile.currency;
  const sum = k => months.reduce((s, x) => s + x[k], 0);
  const gross = sum('gross'), fees = sum('fee'), lessons = months.reduce((s, x) => s + x.paid.length, 0);
  const firstWith = months.findIndex(x => x.parts.length);
  const before = firstWith > 0 ? `<tr class="fin-none"><td>${MON_LONG[0]} – ${MON_LONG[firstWith - 1]}</td><td colspan="3" class="muted">No lessons in BladeBook</td></tr>` : '';
  const rowsHtml = months.slice(Math.max(firstWith, 0)).map(x => {
    const isNow = x.ym === TODAY.slice(0, 7);
    const feeCell = `<b class="money">${money(x.fee)}</b><small class="mp-sub">Calculated${isNow ? ' so far' : ''}</small>`;
    return `<tr><td><b>${MON_LONG[x.m]}</b>${isNow ? `<small class="mp-sub">To ${dShort(TODAY)}</small>` : ''}</td>
      <td class="num">${plural(x.paid.length, 'lesson')}${x.unpaid ? `<small class="mp-sub">${money(x.unpaid)} still unpaid</small>` : ''}</td>
      <td class="r money">${money(x.gross)}</td><td>${feeCell}</td></tr>`;
  }).join('');
  const plan = p.rinkPlan === 'flat' ? 1 : 0;
  const blocksOn = ice => BLOCKS.filter(b => b.ice === ice).map(b => esc(b.name));
  return shell(`
    ${pageHead('Financial summary', `Your ${FIN_YEAR} figures so far, for your taxes. Gross is money you’ve received.`,
      `${B('Download summary', 'secondary', 'finExportOpen', { icon: 'arrowR' })}<span class="mp-phase">${B('Past years', 'secondary', '', { icon: 'calendar', disabled: true })}${badge('Phase 2', 'neutral')}</span>`, crumb('payments', 'Payments'))}
    ${banner('info', 'Based on lessons you’ve marked as paid', 'These figures are calculated from the lessons you’ve marked as paid. A lesson you haven’t marked paid isn’t included. A finished year is closed: marking one of its lessons paid later doesn’t change it.')}
    ${banner('warning', 'How rink fees are worked out isn’t decided yet', `BladeBook calculates them from ${esc(RINK_SHORT)}’s terms. These figures are one reading of those terms; the open questions are in docs/Q_Rink-Fees.md.`)}
    <div class="stats">
      ${stat(`Gross, ${FIN_YEAR} to date`, money(gross), `${plural(lessons, 'lesson')} marked paid`, 'card')}
      ${stat(`Rink fees, ${FIN_YEAR} to date`, money(fees), 'Tax deductible', 'pin')}
      ${stat('After rink fees', money(gross - fees), `Jan 1 – ${dShort(TODAY)}`, 'trend')}
    </div>
    <div class="split fin-split">
      ${card(`<div class="mp-tablewrap"><table class="table fin-table"><thead><tr><th>Month</th><th>Paid lessons</th><th class="r">Gross received</th><th>Rink fee</th></tr></thead><tbody>${before}${rowsHtml}</tbody>
        <tfoot><tr><td><b>${FIN_YEAR} to date</b></td><td class="num">${plural(lessons, 'lesson')}</td><td class="r money">${money(gross)}</td><td><b class="money">${money(fees)}</b></td></tr></tfoot></table></div>
        <div class="card__note">${ic('info', 14)} Gross counts lessons marked paid, including a missed-lesson fee once you’ve collected it (mark the no-show paid). Unpaid and waived lessons aren’t counted. A lesson counts in the month it was taught. Amounts are in ${cur}.</div>`,
        { title: 'Month by month', sub: `${esc(RINK_SHORT)} · ${p.rinkPlan === 'flat' ? '$500 a month' : '15% of each month’s gross'}`, pad: false })}
      <div class="stack">
        ${card(`
          <div class="fieldset"><div class="label">Figure skating</div>${SEG(['15% of gross each month', '$500 a month'], plan, 'finPlan', [], { block: true })}<div class="hint">Your choice of the two. You coach ${esc(p.sport.toLowerCase())}, so this is what BladeBook uses.</div></div>
          ${kv('Hockey', '$10 an hour')}
          <div class="fieldset fin-ice"><div class="label">Ice at this rink</div>${ICE_TYPES.map(t => `<div class="fin-ice__row"><span>${esc(t)}</span><small class="mp-sub">${blocksOn(t).length ? 'Your ' + blocksOn(t).join(', ') : 'Not on your schedule'}</small></div>`).join('')}</div>`,
          { title: `${esc(RINK_SHORT)} terms`, sub: 'What the rink charges you. BladeBook keeps each rink’s terms and adds them when it reaches a new rink. Phase 1 has one rink.' })}
        ${help('Rink fees are tax deductible', 'Download a summary for your tax records or your tax preparer: one row per month, no skater names. Seeing past years on screen, and a lesson-by-lesson export, come in Phase 2.')}
      </div>
    </div>`, { width: 'wide' });
};
Object.assign(ACTIONS, {
  finPlan(i) { state.profile.rinkPlan = i === 1 ? 'flat' : 'percent'; },
  finExportOpen() { state.ui.finYear = 0; state.modal = { kind: 'finExport' }; },
  finExportYear(i) { state.ui.finYear = i; },
  finExport() { state.modal = null; state.flash = `Saved bladebook-summary-${FIN_YEAR - (state.ui.finYear || 0)}.csv.`; },
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
      <div class="fieldset"><div class="label">Profile photo ${badge('Phase 2', 'neutral')}</div>
        <div class="mp-photo">${avatar(initials(p.first + ' ' + p.last), 'lg')}<div class="mp-photo__text"><b>Your initials</b><span class="hint">Families see your initials. Adding a photo comes in Phase 2.</span></div></div></div>
      <div class="fieldset"><div class="label">Currency</div><div class="input input--readonly"><span class="input__val">${p.currency === 'USD' ? 'USD — US dollar' : 'CAD — Canadian dollar'}</span>${ic('lock', 14)}</div><div class="hint">Every lesson is priced in this. Changing currency comes in Phase 2.</div></div>`,
      { title: 'About you' })}
    ${card(`
      ${codePendingBanner()}
      <div class="codecard${p.codePending ? ' codecard--pending' : ''}"><div><div class="codecard__head">${codeLabel()}</div><div class="codecard__code">${p.code}</div><div class="codecard__sub">${codeSub()}</div></div>
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
  return profileShell(`
    ${card(`
      ${TOG('Phone number', p.showPhone, esc(p.phone), 'mpToggle', ['showPhone'])}
      ${TOG('Email address', p.showEmail, esc(p.businessEmail), 'mpToggle', ['showEmail'])}
      <div class="toggle-row"><div class="toggle-row__text"><div class="toggle-row__label">Payment types</div><div class="toggle-row__sub">${esc(payShown(p).map(([l, v]) => v ? `${l} ${v}` : l).join(' · ') || 'None switched on.')} Each has its own switch under <a class="link" href="${href('profile-payments')}">Payments</a>.</div></div></div>
      <div class="card__note">${ic('info', 14)} Your payment instructions always appear in payment-reminder emails. Replies always reach your business email, whichever of these are on.</div>`,
      { title: 'What families can see', sub: 'Only families you’ve approved. Never someone who has only entered your coach code.', pad: false })}
    ${card(`
      ${TOG('Text me when a family cancels late', p.smsCancel, `To ${esc(p.phone)}. Msg &amp; data rates may apply. Reply STOP to stop.`, 'mpToggle', ['smsCancel'])}
      <div class="smsprev"><div class="smsprev__label">Example</div><div class="smsprev__bubble">BladeBook: Mia C. cancelled Fri 16 Oct 8:30am, inside your notice period. See email.</div></div>`,
      { title: 'Texts to you', sub: `You get an email when a family cancels inside your ${p.notice}-hour notice period (ADR-009 d9). Other cancellations just free the time. Texts are extra.`, pad: false })}
    ${saveBar()}`);
};
/** One switch per payment type, with its handle (ADR-016 d7, amended 2026-10-12). Used at sign-up and on the profile. */
const payTypeRows = pre => PAY_TYPES.map(([, label, h, k, ph]) => {
  const p = state.profile, on = !!p[k];
  const sub = !h ? 'Families can pay you in cash at the rink.'
    : on ? 'Shown to approved families, and a choice when you mark a lesson paid.'
    : p[h] ? 'Off. Your handle is kept; switching it back on asks you to check it’s still right.'
    : 'Add your handle, then switch it on.';
  return `<div class="paytype">${TOG(label, on, sub, 'payTypeToggle', [k])}${h ? INP(`${pre}-${h}`, `${label} handle`, 'profile.' + h, { placeholder: ph, optional: !on }) : ''}</div>`;
}).join('');
SCREENS['profile-payments'] = () => {
  const p = state.profile, types = payTypesFor(p).map(([, t]) => t);
  return profileShell(`
  ${card(`
    ${TXT('pf-instr', 'How families pay you', 'profile.instructions', { rows: 3, hint: 'Always included in payment reminders. BladeBook doesn’t take payments itself.' })}
    <div class="fieldset"><div class="label">Payment types</div>${payTypeRows('pf')}
      <div class="hint">Each type you switch on is shown to approved families and in payment reminders. Switch one off any time; lessons you’ve already marked keep how they were paid.</div></div>`,
    { title: 'Getting paid' })}
  ${card(`<div class="mp-chips">${types.map(t => `<span class="badge badge--neutral">${t}</span>`).join('')}</div>
    <div class="hint">When you mark a lesson paid you can note how the family paid. The choices are the payment types you’ve switched on, plus Other. Lessons you’ve already marked keep what you chose.</div>`,
    { title: 'How families paid', sub: 'Only you see this.' })}
  ${saveBar()}`);
};
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
/* Switching Cash App, Venmo or PayPal back on: the coach verifies the kept handle first (ADR-016 d7, amended 2026-10-12). */
MODALS.payVerify = m => { const [, label, h, , ph] = PAY_TYPES.find(t => t[3] === m.k); return `
  <div class="dialog__icon">${ic('card', 22)}</div>
  <h2 class="h2">Is this still your ${label}?</h2>
  <p class="fine">Approved families will see it and send money to it. Check it, or change it, before switching ${label} back on.</p>
  ${INP('pv-handle', `${label} handle`, 'profile.' + h, { placeholder: ph })}
  <div class="dialog__actions">${B('Cancel', 'secondary', 'closeModal')}${B('Yes, switch it on', 'primary', 'payVerifyOk')}</div>`; };
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
/* A coach code is 8 random characters from a set with no look-alikes (no 0, O, 1, I, L, 5, S, U), shown 4-dash-4.
   No part of the coach's name; it never expires on its own (ADR-002, amended 2026-10-13). */
const MP_CODE_CHARS = 'ABCDEFGHJKMNPQRTVWXYZ2346789';
Object.assign(ACTIONS, {
  mpSave() { state.flash = 'Saved.'; },
  mpToggle(key) { state.profile[key] = !state.profile[key]; },
  payTypeToggle(k) {
    const p = state.profile, [, label, h] = PAY_TYPES.find(t => t[3] === k), kept = (p.payKept ??= {});
    if (p[k]) { p[k] = false; if (h && p[h]) kept[k] = true; return; }
    if (h && !p[h]) { state.flash = `Add your ${label} handle first.`; return; }
    if (h && kept[k]) { state.modal = { kind: 'payVerify', k }; return; }
    p[k] = true;
  },
  payVerifyOk() {
    const k = state.modal.k, p = state.profile, [, label, h] = PAY_TYPES.find(t => t[3] === k);
    if (!p[h]) { state.flash = `Add your ${label} handle first.`; return; }
    p[k] = true; delete p.payKept[k]; state.modal = null; state.flash = `${label} switched on.`;
  },
  mpPhotoRemove() { state.profile.photo = false; },
  mpRotateAsk() { state.modal = { kind: 'mpRotate' }; },
  mpRotate() {
    const p = state.profile, old = p.code;
    let s = ''; for (let i = 0; i < 8; i++) s += MP_CODE_CHARS[(hash(old + i + s) + i * 7) % MP_CODE_CHARS.length];
    p.code = s.slice(0, 4) + '-' + s.slice(4);
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
    body: p => `<p>Hi Grace,</p><p>Mia is booked with ${esc(p.first)} ${esc(p.last)}:</p><p><b>Wed, Oct 21 · 6:30 AM · 30 min · $50</b><br>Pelham Civic Center</p><p>Need to cancel? Use My bookings on BladeBook. Cancelling within ${p.notice} hours may incur a fee.</p>` },
  { key: 'reminder', who: 'families', name: 'Day-of reminder', when: 'Morning of each lesson', subject: 'Today: Mia’s lesson at 6:30 AM',
    body: p => `<p>Hi Grace,</p><p>A reminder that Mia has a lesson with ${esc(p.first)} today at <b>6:30 AM</b> (30 min).</p><p>See you at the rink.</p>` },
  { key: 'payment', who: 'families', name: 'Payment reminder', when: 'After a lesson is checked in', subject: 'Payment for Mia’s lesson on Oct 14',
    body: p => `<p>Hi Grace,</p><p>Thanks for Mia’s lesson on <b>Wed, Oct 14</b>. The amount is <b>$50</b>.</p><p>${esc(p.instructions)}</p>${payShown(p).length ? `<p>${payShown(p).map(([l, v]) => v ? `${l} ${esc(v)}` : l).join(' · ')}</p>` : ''}` },
  { key: 'coachCancel', who: 'families', name: 'Lesson cancelled by you', when: 'When you cancel a lesson, day or week', required: true, subject: 'Cancelled: Mia’s lesson on Wed, Oct 21',
    body: p => `<p>Hi Grace,</p><p>${esc(p.first)} has cancelled Mia’s lesson on <b>Wed, Oct 21 at 6:30 AM</b>.</p><p>You won’t be charged. Book another time on BladeBook.</p>` },
  { key: 'schedule', who: 'families', name: 'Schedule change', when: 'When a schedule save cancels or re-prices lessons', required: true, subject: 'Changes to Mia’s upcoming lessons',
    body: p => `<p>Hi Grace,</p><p>${esc(p.first)} changed their schedule. This affects Mia’s lessons:</p><p><b>Cancelled:</b> Mon, Nov 2 · 6:00 AM<br><b>New price:</b> Wed, Nov 4 · 6:30 AM, $50 → $55</p><p>Book another time on BladeBook.</p>` },
  // Shared lessons (ADR-026 d5, ADR-033). Only a skater the coach has accepted can be invited, so the invitation never asks
  // the family to join the coach's roster. Invitations and their outcomes are always sent.
  { key: 'shareInvite', who: 'families', name: 'Invitation to share a lesson', when: 'When a family invites one of your skaters from another family', required: true, to: 'tom.okafor@example.com', subject: 'Grace Chen invited Zoe to share a lesson',
    body: p => `<p>Hi Tom,</p><p>Grace Chen invited Zoe to share Mia’s lesson with Coach ${esc(p.first)} on <b>Fri, Oct 16 at 8:30 AM</b>. The lesson’s $50 is split, so Zoe’s share is $25.</p><p>Accept and Zoe is booked straight away. If nobody answers before the lesson starts, the invitation expires.</p><p><a class="link">Review the invitation</a> (you’ll need to sign in)</p>` },
  { key: 'shareExpired', who: 'families', name: 'Invitation no longer available', when: 'To the invited family, when the lesson starts before they answer', required: true, to: 'tom.okafor@example.com', subject: 'Grace Chen’s invitation is no longer available',
    body: p => `<p>Hi Tom,</p><p>Grace Chen’s invitation for Zoe to share the lesson with Coach ${esc(p.first)} on <b>Fri, Oct 16 at 8:30 AM</b> is no longer available, so Zoe wasn’t added.</p><p>Nothing was booked for Zoe.</p>` },
  { key: 'justBooked', who: 'families', name: 'Just booked, then cancelled', when: 'When a family books a time just as your schedule change cancels it', required: true, phase2: true, subject: 'Your new booking on Mon, Nov 2 was cancelled',
    body: p => `<p>Hi Grace,</p><p>You booked Mia’s lesson on <b>Mon, Nov 2 at 6:00 AM</b> just as ${esc(p.first)} changed their schedule, and that time is no longer offered. The booking has been cancelled and you won’t be charged.</p><p>Book another time on BladeBook.</p>` },
  { key: 'declined', who: 'families', name: 'Sign-up declined', when: 'When you decline a new skater', required: true, subject: 'Your sign-up with Dana Whitfield',
    body: p => `<p>Hi Sarah,</p><p>${esc(p.first)} ${esc(p.last)} doesn’t have availability to take on new students right now, so Ava’s sign-up wasn’t accepted.</p>` },
  { key: 'morning', who: 'you', name: 'Morning email', when: 'Around 7 AM on days you have lessons', subject: 'Today: 5 lessons, starting at 6:00 AM',
    body: () => `<p><a class="btn btn--primary btn--lg">Open the rinkside app</a></p><p>Check skaters in from your phone. It uses the same email and password as this website.</p><p><b>Your lessons for Wed, Oct 14 · Pelham Civic Center</b><br>6:00 AM · Sam R. &amp; Leo M. (shared)<br>6:30 AM · Mia C.<br>8:30 AM · Owen B.<br>10:00 AM · Leo M.</p>` },
  { key: 'report', who: 'you', name: 'Daily report', when: 'Every evening at 9 PM', subject: 'Today: 5 lessons, 4 checked in, 1 not recorded',
    body: () => `<p>Your lessons for Wed, Oct 14:</p><p><b>Checked in:</b> Sam R. 6:00, Mia C. 6:30, Owen B. 8:30, Leo M. 10:00<br><b>Not recorded:</b> none</p>` },
  { key: 'familyCancel', who: 'you', name: 'A family cancelled', when: 'When a family cancels inside your notice period', required: true, subject: 'Late cancellation: Mia C., Fri, Oct 16 at 8:30 AM',
    body: p => `<p>Grace Chen cancelled Mia’s lesson on <b>Fri, Oct 16 at 8:30 AM</b>, inside your ${p.notice}-hour notice period. You may charge a late cancellation fee.</p><p>The time is open for booking again. Cancellations made earlier than this don’t send an email.</p>` },
  { key: 'unpaid', who: 'you', name: 'Unpaid lessons', when: 'Weekly, on Monday morning', subject: '4 lessons are still unpaid',
    body: () => `<p>These lessons are more than a week old and still unpaid:</p><p>Leo M. · Fri, Sep 4 · $50<br>Ella A. · Fri, Oct 9 · $50</p><p>Mark each one paid or waived on Payments.</p>` },
];
SCREENS['email-templates'] = () => {
  const ui = (state.ui.tpl ??= { sel: 'confirm', off: {} });
  const p = state.profile, t = MP_TEMPLATES.find(x => x.key === ui.sel) || MP_TEMPLATES[0];
  const item = x => `<div class="mp-tpl${x.key === t.key ? ' is-on' : ''}"><button type="button" class="mp-tpl__pick" data-act="mpTpl" data-arg='["${x.key}"]' aria-pressed="${x.key === t.key}"><span class="mp-tpl__name">${x.name}${x.phase2 ? ' ' + badge('Phase 2', 'neutral') : ''}</span><span class="mp-tpl__when">${x.when}</span></button>
    ${x.required ? badge('Always sent', 'neutral', 'lock') : `<button type="button" class="switch${ui.off[x.key] ? '' : ' is-on'}" role="switch" aria-checked="${!ui.off[x.key]}" aria-label="Send ${esc(x.name)}" data-act="mpTplToggle" data-arg='["${x.key}"]'><span class="switch__knob"></span></button>`}</div>`;
  const group = (who, title, sub) => card(MP_TEMPLATES.filter(x => x.who === who).map(item).join(''), { title, sub, pad: false });
  const off = !t.required && ui.off[t.key];
  return shell(`
    ${pageHead('Email templates', 'See what each automatic email says, and choose which ones go out.', badge('Phase 2', 'neutral'), crumb('profile', 'Profile'))}
    ${banner('info', 'Coming in Phase 2', 'This page isn’t in the first release. Until then, every email here is sent automatically.')}
    <div class="split mp-split">
      <div class="stack">
        ${group('families', 'Emails families get', 'Emails about cancellations, schedule changes and shared lessons are always sent, so families are never left guessing.')}
        ${group('you', 'Emails you get')}
      </div>
      ${card(`
        <div class="mp-mail${off ? ' is-off' : ''}">
          <div class="mp-mail__head">
            ${kv('From', `${esc(p.first)} ${esc(p.last)} via BladeBook`)}
            ${kv('Reply-To', t.who === 'families' ? esc(p.businessEmail) : 'no-reply@bladebook.app')}
            ${kv('To', t.to || (t.who === 'families' ? (t.key === 'declined' ? 'sarah.park@example.com' : 'grace.chen@example.com') : esc(p.loginEmail)))}
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
  { id: 'CoachPaymentsAll', file: 'payments-all', group: 'Payments', title: 'Payments — all lessons', note: 'Redesigned from Forest CoachPayments: every lesson in the range, with Undo on paid and waived ones. Under each Paid badge, how the family paid, which the coach can change (ADR-003 d4). Sam and Leo’s shared Wednesday lessons have a row each.', setup: st => { st.screen = 'payments'; st.ui.pay = { from: '2026-09-01', to: '2026-10-14', filter: 1 }; } },
  { id: 'CoachPaymentsMarkPaid', file: 'payments-mark-paid', group: 'Payments', title: 'Payments — mark paid, how they paid', note: 'New. Marking a lesson paid offers an optional “How did they pay?”: the payment types the coach takes (Cash only if switched on) plus Other, no free text. Coach-only (Open-Pending §3, settled 2026-10-12).', setup: st => {
    st.screen = 'payments'; st.ui.pay = { from: '2026-09-01', to: '2026-10-14', filter: 0, how: 0 };
    const l = st.lessons.find(x => x.sid === 's5' && x.iso === '2026-10-09' && x.t === 360 && x.pay === 'UNPAID') || st.lessons.find(x => x.sid && isPast(x) && x.pay === 'UNPAID');
    st.modal = { kind: 'mpHow', id: l.id, k: -1, edit: false };
  } },
  { id: 'CoachFinances', file: 'finances', group: 'Payments', title: 'Financial summary', note: 'New, MVP feature 16. Year-to-date gross (money received) and rink fees for 2026, month by month, with Pelham Civic Center’s terms. How rink fees are calculated is open (docs/Q_Rink-Fees.md); this shows one reading: 15% or $500 a month by the coach’s choice, a lesson counted in the month it was taught. Rink terms are added by the developer; the coach can’t edit them or enter what they paid. Only September and October have sample lessons.', setup: st => { st.screen = 'finances'; } },
  { id: 'CoachFinancesExport', file: 'finances-export', group: 'Payments', title: 'Financial summary — download', note: 'New state. The summary export (ADR-030 d7, MVP): a CSV for this year or last, one row per month, no skater names, so not a PII read.', setup: st => { st.screen = 'finances'; st.modal = { kind: 'finExport' }; st.ui.finYear = 0; } },
  { id: 'CoachProfileDetails', file: 'profile-details', group: 'Profile', title: 'Profile — details and coach code', note: 'New: name, phone, time zone, initials (photos are Phase 2), read-only currency and the coach code with Rotate.', setup: st => { st.screen = 'profile'; } },
  { id: 'CoachProfileCodePending', file: 'profile-details-code-pending', group: 'Profile', title: 'Profile — coach code not working yet', note: 'New (ADR-016, amended 2026-11-06). The business email from sign-up isn’t confirmed, so the coach code is marked Not working yet, with the same banner as Today. A family who enters it now is told it doesn’t match.', setup: st => { st.screen = 'profile'; st.profile.codePending = true; } },
  { id: 'CoachProfileEmail', file: 'profile-email', group: 'Profile', title: 'Profile — business email', note: 'Redesigned from Forest CoachProfileEmail: a new address needs a confirmation link before it can be chosen.', setup: st => { st.screen = 'profile-email'; st.profile.emails.push({ addr: 'dana@pelhamfsc.org', pending: true }); } },
  { id: 'CoachProfileVisibility', file: 'profile-visibility', group: 'Profile', title: 'Profile — visibility and texts', note: 'Redesigned from Forest CoachProfileVisibility: what approved families see, and the cancellation text.', setup: st => { st.screen = 'profile-visibility'; } },
  { id: 'CoachProfilePayments', file: 'profile-payments', group: 'Profile', title: 'Profile — payment details', note: 'Payment instructions and one switch per payment type (ADR-016 d7, amended 2026-10-12): Cash and Venmo on, Cash App off with its handle kept, PayPal not set up. A type switched on is shown to approved families and is a how-paid choice (ADR-003 d4).', setup: st => { st.screen = 'profile-payments'; } },
  { id: 'CoachProfilePaymentsVerify', file: 'profile-payments-verify', group: 'Profile', title: 'Profile — switching a payment type back on', note: 'New state. Switching Cash App, Venmo or PayPal back on shows the kept handle and asks the coach to verify it before it takes effect (ADR-016 d7, amended 2026-10-12). Cash switches straight back on.', setup: st => { st.screen = 'profile-payments'; st.modal = { kind: 'payVerify', k: 'onCashapp' }; } },
  { id: 'CoachProfileAccount', file: 'profile-account', group: 'Profile', title: 'Profile — account', note: 'New: login email, password change through Cognito, the rinkside app, and Log out.', setup: st => { st.screen = 'profile-account'; } },
  { id: 'CoachEmailTemplates', file: 'email-templates', group: 'Phase 2', title: 'Email templates', note: 'New, Phase 2: each automatic email with an on/off switch and a preview; cancellation, schedule-change and shared-lesson emails can’t be turned off. The “just booked” email is itself Phase 2.', setup: st => { st.screen = 'email-templates'; } },
  { id: 'CoachEmailTemplatesShare', file: 'email-templates-shared', group: 'Phase 2', title: 'Email templates — shared lesson invitation', note: 'New state. The invitation Family B gets (sent by consumer-invite, ADR-026 d5), always sent. Only a skater Coach Dana has already accepted can be invited (ADR-033), so the email has no “join the coach’s roster” consent link; that version is Phase 2. The other shared-lesson emails are in the same list.', setup: st => { st.screen = 'email-templates'; st.ui.tpl = { sel: 'shareInvite', off: {} }; } },
  { id: 'CoachEmailTemplatesMorning', file: 'email-templates-morning', group: 'Phase 2', title: 'Email templates — morning email', note: 'New state. The coach’s morning email (owner, 2026-10-13; ADR-023): the rinkside link first, then the day’s lessons. Sent by the day-of reminder job around 7 AM on days with lessons. It can be switched off here in Phase 2; in MVP it is always sent.', setup: st => { st.screen = 'email-templates'; st.ui.tpl = { sel: 'morning', off: {} }; } },
);
