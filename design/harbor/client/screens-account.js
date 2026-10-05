/* Client — account screens: log in, forgot password, sign-up, home, profile, payments (Phase 2).
   Specs: FeatureDecriptions/Client Sign Up, ClientHomeView, ClientProfileView; ADR-002; ADR-007;
   ADR-016 d7a; ADR-022 d6–d7 (a family with no approved skater sees only their own account).
   Registers SCREENS login / forgot / signup / home / profile / payments, ACTIONS ac*, MODALS ac*, PRESETS. */

const acUi = () => (state.ui.ac ??= { fp: 0, newName: '', newMinor: 0, adding: false });
const suUi = () => (state.ui.su ??= { step: 0, code: '', forWho: 1, first: 'Sarah', last: 'Park', phone: '(205) 555-0196', email: 'sarah.park@example.com', pw: '', pw2: '', sms: true, skaters: [], draft: '', draftMinor: 0 });
const SMS_TERMS = 'Texts arrive the morning of a lesson and when a lesson is cancelled. Msg &amp; data rates may apply. Reply STOP to stop, HELP for help. Email reminders always go out.';
const coachPhoto = (sz = 'lg') => avatar(initials(coachName()), sz);
/** Code check, as the lookup does it: letters and digits only, 8 of them, compared with the coach's code. */
function acCodeState(code) {
  const raw = String(code || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (raw.length < 8) return 'typing';
  return raw === state.profile.code.replace(/[^A-Z0-9]/g, '') ? 'found' : 'wrong';
}
const famAside = () => help('How signing up works', `Your coach gives you a code. You create an account, add the skater (you or your child), and your coach approves them. Booking opens as soon as they do.`);
const coachChip = () => card(`${eyebrow('Signing up with')}<div class="found found--plain">${coachPhoto('')}<div><div class="found__name">Coach ${esc(coachName())}</div><div class="found__sub mono">${state.profile.code}</div></div></div>`);

/* ================= Log in, forgot password (Cognito) ================= */
SCREENS.login = () => authShell(card(`
  <h1 class="h1">Log in</h1><p class="lede">Book lessons and see your skaters’ schedule.</p>
  ${state.auth.notice ? banner('success', state.auth.notice) : ''}
  ${INP('ac-login-email', 'Email', 'auth.email', { type: 'email' })}
  ${INP('ac-login-pw', 'Password', 'auth.pw', { type: 'password', placeholder: '••••••••' })}
  <div class="fine"><a class="link" href="${href('forgot')}">Forgot your password?</a></div>
  ${B('Log in', 'primary', 'acLogin', { block: true, lg: true })}`),
  help('First time here?', `You need a code from your coach to sign up. <a class="link" href="${href('signup')}">Sign up with a coach code</a>.`));

SCREENS.forgot = () => {
  const u = acUi();
  return authShell(card(u.fp === 0 ? `
    <h1 class="h1">Reset your password</h1><p class="lede">We’ll email a 6-digit code to the address you log in with.</p>
    ${INP('ac-fp-email', 'Email', 'auth.email', { type: 'email' })}
    ${B('Email me a code', 'primary', 'acForgotSend', { block: true, lg: true })}
    <p class="fine center">${A_('login', 'Back to log in')}</p>` : `
    <h1 class="h1">Enter the code and a new password</h1><p class="lede">We sent a code to <b>${esc(state.auth.email || '')}</b>. It expires in an hour.</p>
    <div class="label">Code</div>${codeBoxes(['5', '1', '8', '3', '0', '6'])}
    ${INP('ac-fp-pw', 'New password', 'auth.newpw', { type: 'password', placeholder: 'At least 8 characters' })}
    ${pwRules()}
    ${B('Set new password', 'primary', 'acForgotDone', { block: true, lg: true })}
    <p class="fine center"><a class="link" data-act="acForgotSend">Send a new code</a> · ${A_('login', 'Back to log in')}</p>`),
    help('No email?', 'Check spam for a message from BladeBook. The code goes to the email you log in with.'),
    { right: `Remembered it? <a class="link" href="${href('login')}">Log in</a>` });
};

/* ================= Sign-up (ADR-002) ================= */
SCREENS.signup = () => {
  const u = suUi(), cs = acCodeState(u.code), self = u.forWho === 0;
  const right = `Already have an account? <a class="link" href="${href('login')}">Log in</a>`;
  if (u.step === 0) return authShell(card(`
    <h1 class="h1">Join your coach on BladeBook</h1><p class="lede">Enter the code your coach gave you.</p>
    ${INP('ac-code', 'Coach code', 'ui.su.code', { live: true, mono: true, placeholder: 'e.g. ABCD-1234', error: cs === 'wrong' ? 'That code doesn’t match a coach. Check it with your coach. Codes are 8 letters and numbers.' : '', hint: cs === 'typing' ? 'It links your account to your coach’s lessons.' : '' })}
    ${cs === 'found' ? `<div class="found">${coachPhoto()}<div><div class="found__name">Coach ${esc(coachName())}</div><div class="found__sub">Pelham Ice Rink · Figure skating</div></div>${badge('Code found', 'success', 'check')}</div>`
      : `<div class="empty-coach">${ic('user', 20)}<span>Your coach will appear here so you can check it’s the right one.</span></div>`}
    ${B(cs === 'found' ? `Continue with ${esc(coachFirst())}` : 'Continue', 'primary', 'acSuNext', { block: true, lg: true, iconR: cs === 'found' ? 'arrowR' : '', disabled: cs !== 'found' })}
    <p class="fine center">${cs === 'found' ? 'Wrong coach? Check the code with them.' : 'No code? Ask your coach. Every coach has their own.'}</p>`), famAside(), { steps: 0, ctx: 'Family sign up', right });

  if (u.step === 1) return authShell(card(`
    <h1 class="h1">About you</h1><p class="lede">The person who books and pays for lessons.</p>
    <div class="fieldset"><div class="label">Who are the lessons for?</div>${SEG(['Me (18 or older)', 'A child I’m guardian of'], u.forWho, 'acSuFor', [], { block: true })}<div class="hint">${self ? 'You’re the skater. Under 18? Your guardian signs up and adds you.' : 'Sign up as yourself. You add your child on step 4.'}</div></div>
    <div class="grid2">${INP('ac-su-first', self ? 'First name' : 'Your first name', 'ui.su.first')}${INP('ac-su-last', self ? 'Last name' : 'Your last name', 'ui.su.last')}</div>
    <div class="grid2">${INP('ac-su-phone', 'Mobile phone', 'ui.su.phone', { type: 'tel' })}${INP('ac-su-email', 'Email', 'ui.su.email', { type: 'email', hint: 'For logging in, confirmations and reminders.' })}</div>
    ${INP('ac-su-pw', 'Password', 'ui.su.pw', { type: 'password', placeholder: 'At least 8 characters' })}
    ${pwRules()}
    ${INP('ac-su-pw2', 'Confirm password', 'ui.su.pw2', { type: 'password', placeholder: 'Type it again', hint: 'Type it again rather than pasting. Pasting is turned off here.' })}
    ${CHK('Text me reminders too', u.sms, 'acSuSms', [], SMS_TERMS)}
    <div class="actions"><div>${B('Back', 'ghost', 'acSuBack', { icon: 'arrowL' })}</div><div class="actions__r">${B('Create account', 'primary', 'acSuNext', { lg: true })}</div></div>`),
    `<div class="stack">${coachChip()}${help(self ? 'Skating yourself' : 'Signing up for your child?', self ? 'Reminders, confirmations and payment reminders all come to you.' : 'Sign up as yourself. You add your child as a skater on step 4, and you can add more than one.')}</div>`,
    { steps: 1, ctx: 'Family sign up', right });

  if (u.step === 2) return authShell(card(`
    <div class="mailicon">${ic('mail', 26)}</div>
    <h1 class="h1 center">Check your email</h1><p class="lede center">We sent a 6-digit code to <b>${esc(u.email)}</b>.<br>It expires in 24 hours.</p>
    ${codeBoxes(['4', '8', '2', '9', '', ''])}
    ${B('Verify email', 'primary', 'acSuNext', { block: true, lg: true })}
    <p class="fine center"><a class="link" data-act="noop">Resend code</a> · <a class="link" data-act="acSuBack">Use a different email</a></p>`, { cls: 'card--center' }),
    help('Why a code?', 'It proves the email is yours before lesson reminders go there. Can’t find it? Check spam for “Your verification code” from BladeBook.'),
    { steps: 2, ctx: 'Family sign up', right: '' });

  if (u.step === 3) {
    if (self) return authShell(card(`
      <h1 class="h1">You’re the skater</h1><p class="lede">Check your details. This is who Coach ${esc(coachFirst())} will see.</p>
      <div class="skater">${avatar(initials(`${u.first} ${u.last}`))}<div class="skater__text"><b>${esc(u.first)} ${esc(u.last)} ${badge('You', 'primary')}</b><small>Adult · from your account details</small></div></div>
      ${CHK('I’m 18 or older', true, 'noop', [], 'If you’re under 18, a guardian needs to sign up and add you as their skater.')}
      <p class="fine">Booking for someone else? <a class="link" data-act="acSuChangeWho">Change who the lessons are for</a>.</p>
      <div class="actions"><div>${B('Back', 'ghost', 'acSuBack', { icon: 'arrowL' })}</div><div class="actions__r">${B(`Send to Coach ${esc(coachFirst())}`, 'primary', 'acSuFinish', { lg: true, iconR: 'arrowR' })}</div></div>`),
      help('Skating yourself', `Coach ${esc(coachFirst())} still approves you before you can book. You’ll get an email when they do.`),
      { steps: 3, ctx: 'Family sign up', right: '' });
    const list = u.skaters.map((s, i) => `<div class="skater">${avatar(initials(s.name))}<div class="skater__text"><b>${esc(s.name)}</b><small>${s.minor ? 'Under 18 · your child' : '18 or older'}</small></div>${B('Remove', 'ghost', 'acSuDropSkater', { sm: true, args: [i] })}</div>`).join('');
    return authShell(card(`
      <h1 class="h1">Who’s skating?</h1><p class="lede">Add everyone who will take lessons with Coach ${esc(coachFirst())}.</p>
      ${list || `<p class="fine">No skaters yet. Add at least one.</p>`}
      <div class="skater skater--edit">
        <div class="grid2 grid2--wide">${INP('ac-su-skater', 'Skater’s full name', 'ui.su.draft', { placeholder: 'e.g. Ava Park' })}<div class="fieldset"><div class="label">Under 18?</div>${SEG(['Yes', 'No'], u.draftMinor, 'acSuDraftMinor')}</div></div>
        <div class="skater__actions">${B(u.skaters.length ? 'Add another skater' : 'Add skater', 'secondary', 'acSuAddSkater', { sm: true, icon: 'plus' })}</div>
      </div>
      <div class="actions"><div>${B('Back', 'ghost', 'acSuBack', { icon: 'arrowL' })}</div><div class="actions__r">${B(`Send to Coach ${esc(coachFirst())}`, 'primary', 'acSuFinish', { lg: true, iconR: 'arrowR', disabled: !u.skaters.length })}</div></div>`),
      help('What happens next', `Coach ${esc(coachFirst())} approves each skater before they can be booked. You can add more skaters later from your profile.`),
      { steps: 3, ctx: 'Family sign up', right: '' });
  }

  const kids = u.done || [];
  return authShell(card(`
    <div class="hero hero--success hero--stack"><span class="hero__icon">${ic('check', 26)}</span><div><h1 class="h1">You’re in</h1><p class="lede">Signed in as ${esc(u.email)}. One thing left: Coach ${esc(coachFirst())}’s approval.</p></div></div>
    <div class="listbox">${kids.map(n => row(`${avatar(initials(n), 'sm')}${rowTitle(esc(n), `with Coach ${esc(coachName())}`)}`, badge('Waiting for approval', 'warning', 'clock'))).join('')}</div>
    <p class="fine">We’ll email you as soon as Coach ${esc(coachFirst())} approves. Booking opens for each skater once they’re approved.</p>
    ${B('Go to my account', 'primary', 'acSuToHome', { block: true, lg: true })}`),
    help('While you wait', 'Your account shows your profile and your skaters. You can’t see your coach’s times until a skater is approved. Added the wrong skater? Edit or remove them from your profile.'),
    { steps: 4, ctx: 'Family sign up', right: '' });
};

/* ================= Home ================= */
const acCoachCard = () => {
  const p = state.profile, lines = [];
  if (p.showPhone) lines.push(`<span>${ic('phone', 14)}${esc(p.phone)}</span>`);
  if (p.showEmail) lines.push(`<span>${ic('mail', 14)}${esc(p.businessEmail)}</span>`);
  if (p.showHandles) lines.push(...[['Venmo', p.venmo], ['Cash App', p.cashapp], ['PayPal', p.paypal]].filter(x => x[1]).map(([k, v]) => `<span>${ic('card', 14)}${k} ${esc(v)}</span>`));
  return card(`<div class="found found--plain">${coachPhoto('')}<div><div class="found__name">Coach ${esc(coachName())}</div><div class="found__sub">Pelham Ice Rink · Figure skating</div></div></div>
    ${lines.length ? `<div class="ac-contact">${lines.join('')}</div>` : `<p class="fine">Reply to any lesson email to reach Coach ${esc(coachFirst())}.</p>`}`, { title: 'Your coach' });
};
const acLessonRow = l => row(`<span class="ac-when num"><b>${fmtShortT(l.t)}</b><small>${l.iso === TODAY ? 'Today' : dDow(l.iso)}</small></span>${avatar(initials(nameOf(l)), 'sm')}${rowTitle(esc(nameOf(l)), `${l.len} min · ${money(l.price)}${l.recurring ? ' · repeats weekly' : ''}`)}`,
  isStarted(l) ? statusBadge(l) : badge('Booked', 'primary'));

function acHomePending() {
  const kids = myKids();
  return shell(`
    ${pageHead(`Welcome, ${esc(firstName(state.me.name))}`, `You’re signed up with Coach ${esc(coachName())}.`)}
    <div class="alertcard ac-wait"><div class="alertcard__head">${ic('clock', 20)}<div><div class="alertcard__title">Waiting for Coach ${esc(coachFirst())} to approve ${kids.length === 1 ? esc(firstName(kids[0].name)) : 'your skaters'}</div><div class="alertcard__body">Until then you won’t see Coach ${esc(coachFirst())}’s times and can’t book. Your coach checks that they know each family who signs up with their code.</div></div></div></div>
    ${card(kids.map(k => row(`${avatar(initials(k.name), 'sm')}${rowTitle(esc(k.name), `${k.minor ? 'Under 18' : 'Adult'} · signed up ${dShort(k.since)}`)}`, badge('Waiting for approval', 'warning', 'clock'))).join(''),
      { title: 'Your skaters', pad: false, action: A_('profile', 'Edit or remove') })}
    ${card(`<ol class="ac-steps"><li><b>Coach ${esc(coachFirst())} approves each skater.</b> Usually within a day.</li><li><b>We email you</b> at ${esc(state.me.email)}.</li><li><b>Booking opens.</b> You’ll see open times and can book single or weekly lessons.</li></ol>`, { title: 'What happens next' })}
    <p class="fine">Signed up by mistake, or with the wrong coach? Remove your skaters from your ${A_('profile', 'profile')}.</p>`);
}

SCREENS.home = () => {
  if (isPendingFamily()) return acHomePending();
  const mine = myLessons(), today = mine.filter(l => l.iso === TODAY);
  const next = mine.filter(l => !isStarted(l)).slice(0, 4);
  const unpaid = mine.filter(l => isPast(l) && l.pay === 'UNPAID');
  const waiting = myKids().filter(k => k.status === 'PENDING');
  return shell(`
    ${pageHead(`Good morning, ${esc(firstName(state.me.name))}`, dLong(TODAY), B('Book a lesson', 'primary', '', { href: href('book'), icon: 'calendar' }))}
    ${waiting.length ? banner('warning', `${waiting.map(k => esc(firstName(k.name))).join(' and ')} ${waiting.length === 1 ? 'is' : 'are'} waiting for Coach ${esc(coachFirst())}’s approval`, 'You can book for them once they’re approved.') : ''}
    <div class="split split--today">
      <div class="stack">
        ${card(today.length ? today.map(acLessonRow).join('') : `<div class="pempty"><span class="pempty__icon">${ic('calendar', 22)}</span><b>No lessons today</b><span class="muted">${next[0] ? `Next: ${esc(firstName(nameOf(next[0])))}, ${dDow(next[0].iso)} at ${fmtT(next[0].t)}` : 'Nothing booked yet.'}</span></div>`,
          { title: 'Today', sub: dLong(TODAY), pad: false })}
        ${card(next.length ? next.map(acLessonRow).join('') : `<div class="pempty"><b>Nothing booked</b><span class="muted">${A_('book', 'Book a lesson')}</span></div>`,
          { title: 'Coming up', pad: false, action: A_('bookings', 'All bookings') })}
      </div>
      <div class="stack">
        ${acCoachCard()}
        ${card(`<div class="quick">
          ${[['Book a lesson', 'calendar', href('book')], ['My bookings', 'list', href('bookings')], ['Profile', 'user', href('profile')], ['Payments', 'card', href('payments')]]
            .map(([t, i, h]) => `<a class="quick__item" href="${h}"><span class="quick__icon">${ic(i, 18)}</span><span>${t}</span>${t === 'Payments' ? '<small>Phase 2</small>' : ''}</a>`).join('')}
        </div>${unpaid.length ? `<p class="fine">${plural(unpaid.length, 'past lesson')} not marked paid yet · ${money(unpaid.reduce((s, l) => s + l.price, 0))}</p>` : ''}`, { title: 'Go to' })}
      </div>
    </div>`, { width: 'wide' });
};

/* ================= Profile ================= */
SCREENS.profile = () => {
  const u = acUi(), kids = myKids(), self = state.me.rel === 'Self';
  const skaterRow = k => row(`${avatar(initials(k.name), 'sm')}${rowTitle(esc(k.name), k.minor ? 'Under 18' : 'Adult')}`,
    `${k.status === 'ACTIVE' ? badge('Approved', 'success', 'check') : badge('Waiting for approval', 'warning', 'clock')}${B('Remove', 'ghost', 'acRemoveOpen', { sm: true, args: [k.id] })}`);
  return shell(`
    ${pageHead('Profile', 'How Coach ' + esc(coachFirst()) + ' and BladeBook reach you.')}
    ${card(`
      ${INP('ac-pr-name', self ? 'Your name' : `Your name (${state.me.rel.toLowerCase()})`, 'me.name')}
      <div class="grid2">${INP('ac-pr-phone', 'Mobile phone', 'me.phone', { type: 'tel' })}${INP('ac-pr-email', 'Email', 'me.email', { type: 'email', hint: 'You log in with this. Changing it sends a code to the new address.' })}</div>
      ${TOG('Text me reminders', state.me.sms, SMS_TERMS, 'acSms')}
      <div class="fieldset"><div class="label">Profile picture ${badge('Phase 2', 'neutral')}</div><div class="photo-pick">${avatar(initials(state.me.name), 'lg')}${B('Choose a picture', 'secondary', '', { sm: true, disabled: true })}<span class="hint">Picking a picture comes in Phase 2.</span></div></div>`,
      { title: 'Your details' })}
    ${card(`${kids.map(skaterRow).join('') || `<div class="row"><span class="muted">No skaters.</span></div>`}
      ${self ? `<div class="card__note">${ic('info', 14)} You skate yourself. To book for a child, they need their own family account.</div>`
        : u.adding ? `<div class="ac-add">
          <div class="grid2 grid2--wide">${INP('ac-new-name', 'Skater’s full name', 'ui.ac.newName', { placeholder: 'e.g. Lily Chen' })}<div class="fieldset"><div class="label">Under 18?</div>${SEG(['Yes', 'No'], u.newMinor, 'acNewMinor')}</div></div>
          ${banner('info', `Coach ${esc(coachFirst())} approves new skaters`, 'You can book for them once they’re approved. We’ll email you.')}
          <div class="skater__actions">${B('Cancel', 'ghost', 'acAddCancel', { sm: true })}${B('Add skater', 'secondary', 'acAddSkater', { sm: true, icon: 'plus', disabled: !u.newName.trim() })}</div></div>`
        : `<button type="button" class="addrow" data-act="acAddStart">${ic('plus', 16)}Add a skater</button>`}`,
      { title: 'Skaters', sub: `Everyone who takes lessons with Coach ${esc(coachFirst())}.`, pad: false })}
    <div class="actions"><div></div><div class="actions__r">${B('Log out', 'ghost', 'acLogout')}${B('Save', 'primary', 'acSave')}</div></div>`);
};

/* ================= Payments (Phase 2) ================= */
SCREENS.payments = () => {
  const p = state.profile, unpaid = myLessons().filter(l => isPast(l) && l.pay === 'UNPAID');
  const total = unpaid.reduce((s, l) => s + l.price, 0);
  const handles = [['Venmo', p.venmo], ['Cash App', p.cashapp], ['PayPal', p.paypal]].filter(x => x[1]);
  return shell(`
    ${pageHead('Payments', 'Lessons Coach ' + esc(coachFirst()) + ' hasn’t marked paid yet.', badge('Phase 2', 'neutral'), crumb('home', 'Home'))}
    ${banner('info', 'Coming in Phase 2', 'This page isn’t in the first release. BladeBook doesn’t take payments: you pay Coach ' + esc(coachFirst()) + ' directly, and they mark the lesson paid.')}
    <div class="stats">${stat('Not marked paid', money(total), plural(unpaid.length, 'lesson'), 'card')}${stat('Skaters', String(myActiveKids().length), myActiveKids().map(k => esc(firstName(k.name))).join(' & '), 'users')}${stat('Notice period', `${p.notice} hours`, 'Late cancels may be charged', 'clock')}</div>
    ${card(unpaid.length ? `<div class="ac-tablewrap"><table class="table"><thead><tr><th>Skater</th><th>Lesson</th><th>Attendance</th><th class="r">Amount</th></tr></thead><tbody>${unpaid.map(l => `<tr><td><span class="cellname">${avatar(initials(nameOf(l)), 'sm')}${esc(nameOf(l))}</span></td><td>${dDow(l.iso)} · ${fmtT(l.t)}</td><td>${statusBadge(l)}</td><td class="r money">${money(l.price)}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="pempty"><span class="pempty__icon">${ic('check', 22)}</span><b>All paid</b><span class="muted">Nothing is waiting to be marked paid.</span></div>`, { title: 'Not marked paid', pad: false })}
    ${card(`<p class="ac-instr">${esc(p.instructions)}</p>${p.showHandles && handles.length ? `<div class="ac-contact">${handles.map(([k, v]) => `<span>${ic('card', 14)}${k} ${esc(v)}</span>`).join('')}</div>` : ''}`, { title: `How to pay Coach ${esc(coachFirst())}` })}`, { width: 'wide' });
};

/* ================= modals ================= */
MODALS.acRemove = m => {
  const k = student(m.id), up = state.lessons.filter(l => l.sid === k.id && !isStarted(l)).length;
  return `<div class="dialog__icon dialog__icon--danger">${ic('trash', 22)}</div>
    <h2 class="h2">Remove ${esc(k.name)}?</h2>
    <p class="fine">${k.status === 'PENDING' ? `Coach ${esc(coachFirst())} won’t see this sign-up any more.` : up ? `${plural(up, 'upcoming lesson')} ${up === 1 ? 'is' : 'are'} cancelled and Coach ${esc(coachFirst())} is told. Late cancellations may be charged.` : `Nothing is booked for ${esc(firstName(k.name))}.`}</p>
    <div class="dialog__actions">${B('Keep skater', 'secondary', 'closeModal')}${B('Remove skater', 'danger', 'acRemove')}</div>`;
};

/* ================= actions ================= */
Object.assign(ACTIONS, {
  acLogin() { state.auth.notice = ''; state.authed = true; go('home'); },
  acLogout() { state.authed = false; state.auth = { email: state.me.email }; go('login'); },
  acForgotSend() { acUi().fp = 1; state.screen = 'forgot'; },
  acForgotDone() { acUi().fp = 0; state.auth.notice = 'Password changed. Log in with your new password.'; go('login'); },
  acSuNext() { const u = suUi(); if (u.step === 0 && acCodeState(u.code) !== 'found') return; u.step = Math.min(4, u.step + 1); },
  acSuBack() { const u = suUi(); u.step = Math.max(0, u.step - 1); },
  acSuFor(i) { suUi().forWho = i; },
  acSuChangeWho() { const u = suUi(); u.forWho = 1; u.step = 1; },
  acSuSms() { const u = suUi(); u.sms = !u.sms; },
  acSuDraftMinor(i) { suUi().draftMinor = i; },
  acSuAddSkater() { const u = suUi(); const n = u.draft.trim(); if (!n) return; u.skaters.push({ name: n, minor: u.draftMinor === 0 }); u.draft = ''; },
  acSuDropSkater(i) { suUi().skaters.splice(i, 1); },
  acSuFinish() {
    const u = suUi(), self = u.forWho === 0, name = `${u.first} ${u.last}`.trim();
    const rel = ['Self', 'Guardian'][u.forWho];
    const kids = self ? [{ name, minor: false }] : u.skaters;
    if (!kids.length) return;
    // The new family exists only in this demo session: their skaters are PENDING with Coach Dana.
    state.students = state.students.filter(s => s.client !== name);
    kids.forEach((k, i) => state.students.push({ id: `n${Date.now() % 100000}${i}`, name: k.name, minor: k.minor, rel, client: name, email: u.email, phone: u.phone, sms: u.sms, status: 'PENDING', since: TODAY }));
    state.me = { name, rel, email: u.email, phone: u.phone, sms: u.sms };
    u.done = kids.map(k => k.name); u.step = 4;
  },
  acSuToHome() { state.authed = true; state.ui.su = null; go('home'); },
  acSms() { state.me.sms = !state.me.sms; },
  acSave() { for (const s of myKids()) Object.assign(s, { client: state.me.name, email: state.me.email, phone: state.me.phone, sms: state.me.sms }); state.flash = 'Saved.'; },
  acAddStart() { acUi().adding = true; },
  acAddCancel() { const u = acUi(); u.adding = false; u.newName = ''; },
  acNewMinor(i) { acUi().newMinor = i; },
  acAddSkater() {
    const u = acUi(), n = u.newName.trim(); if (!n) return;
    state.students.push({ id: `n${Date.now() % 100000}`, name: n, minor: u.newMinor === 0, rel: state.me.rel, client: state.me.name, email: state.me.email, phone: state.me.phone, sms: state.me.sms, status: 'PENDING', since: TODAY });
    u.adding = false; u.newName = ''; state.flash = `${n} added. Coach ${coachFirst()} will approve them before you can book.`;
  },
  acRemoveOpen(id) { state.modal = { kind: 'acRemove', id }; },
  acRemove() {
    const k = student(state.modal.id);
    state.lessons = state.lessons.filter(l => !(l.sid === k.id && !isStarted(l)));
    state.students = state.students.filter(s => s.id !== k.id);
    state.modal = null; state.flash = `${k.name} removed.`;
  },
});

/* ================= presets ================= */
const acSu = (st, o) => { st.screen = 'signup'; st.ui.su = { step: 0, code: '', forWho: 1, first: 'Sarah', last: 'Park', phone: '(205) 555-0196', email: 'sarah.park@example.com', pw: 'Skate2026!', pw2: 'Skate2026!', sms: true, skaters: [], draft: '', draftMinor: 0, ...o }; };
const acAsSarah = st => Object.assign(st, freshState('sarah'));
PRESETS.push(
  { id: 'ClientLogin', file: 'login', group: 'Sign in', title: 'Log in', note: 'New. Cognito sign-in for families, with a way in for families who only have a coach code.', setup: st => { st.authed = false; st.screen = 'login'; } },
  { id: 'ClientForgot', file: 'forgot-password', group: 'Sign in', title: 'Forgot password — email a code', note: 'New. Cognito sends a code to the email the family logs in with.', setup: st => { st.screen = 'forgot'; } },
  { id: 'ClientForgotCode', file: 'forgot-password-code', group: 'Sign in', title: 'Forgot password — code and new password', note: 'New. The code plus the new password rules.', setup: st => { st.screen = 'forgot'; st.ui.ac = { fp: 1, newName: '', newMinor: 0, adding: false }; } },
  { id: 'ClientCodeEmpty', file: 'signup-1-code-empty', group: 'Sign up', title: '1 · Coach code — empty', note: 'Redesigned from ClientCodeEmpty. Continue stays disabled until a code is found.', setup: st => acSu(st, {}) },
  { id: 'ClientCode', file: 'signup-1-code-found', group: 'Sign up', title: '1 · Coach code — found', note: 'Redesigned from ClientCode. The lookup returns only the coach’s name; MVP shows their initials, and the photo is Phase 2 (ADR-016 d5, ADR-022 d7).', setup: st => acSu(st, { code: 'DANA-7K2Q' }) },
  { id: 'ClientCodeWrong', file: 'signup-1-code-wrong', group: 'Sign up', title: '1 · Coach code — no match', note: 'New state. A full-length code that matches no coach; the error says what to do.', setup: st => acSu(st, { code: 'DANA-7K2X' }) },
  { id: 'ClientDetails', file: 'signup-2-details', group: 'Sign up', title: '2 · Your details', note: 'Redesigned from ClientDetails. Who the lessons are for, the account fields, password confirm with pasting off, and the SMS opt-in terms (ADR-007).', setup: st => acSu(st, { step: 1, code: 'DANA-7K2Q' }) },
  { id: 'ClientVerify', file: 'signup-3-verify', group: 'Sign up', title: '3 · Verify email', note: 'Redesigned from ClientVerify.', setup: st => acSu(st, { step: 2, code: 'DANA-7K2Q' }) },
  { id: 'ClientSkaters', file: 'signup-4-skaters', group: 'Sign up', title: '4 · Add skaters', note: 'Redesigned from ClientSkaters. A guardian adds one or more children in one sign-up (ADR-002).', setup: st => acSu(st, { step: 3, code: 'DANA-7K2Q', skaters: [{ name: 'Ava Park', minor: true }], draft: 'Jack Park' }) },
  { id: 'ClientSkatersSelf', file: 'signup-4-skater-myself', group: 'Sign up', title: '4 · Skater — myself', note: 'Redesigned from ClientSkatersSelf. An adult signing up for themselves is the skater.', setup: st => acSu(st, { step: 3, code: 'DANA-7K2Q', forWho: 0, first: 'Olivia', last: 'Grant', email: 'olivia.grant@example.com' }) },
  { id: 'ClientDone', file: 'signup-5-waiting', group: 'Sign up', title: '5 · Waiting for approval', note: 'Redesigned from ClientDone. Each skater waits for the coach; booking opens once approved.', setup: st => acSu(st, { step: 4, code: 'DANA-7K2Q', done: ['Ava Park', 'Jack Park'] }) },
  { id: 'ClientHome', file: 'home', group: 'Home', title: 'Home', note: 'New (ClientHomeView). Today’s lessons, what’s coming up, the coach card with only the contact details the coach switched on, and a button to every page.', setup: st => { st.screen = 'home'; } },
  { id: 'ClientHomePending', file: 'home-pending', group: 'Home', title: 'Home — waiting for approval', note: 'New. A family with no approved skater sees only their own account: no schedule, open times or coach contact details (ADR-022 d6).', setup: st => { acAsSarah(st); st.screen = 'home'; } },
  { id: 'ClientProfile', file: 'profile', group: 'Profile', title: 'Profile', note: 'New (ClientProfileView). Contact details, SMS opt-in, skaters with add and remove; a new skater waits for approval.', setup: st => { st.screen = 'profile'; st.ui.ac = { fp: 0, newName: 'Lily Chen', newMinor: 0, adding: true }; } },
  { id: 'ClientProfilePending', file: 'profile-pending', group: 'Profile', title: 'Profile — waiting for approval', note: 'New. The same profile for a family still waiting; this is most of what they can see.', setup: st => { acAsSarah(st); st.screen = 'profile'; } },
  { id: 'ClientProfileRemove', file: 'profile-remove-skater', group: 'Profile', title: 'Profile — remove a skater', note: 'New. Removing an approved skater cancels their upcoming lessons. One reading of the open “delete a student” decision (Open-Pending.md).', setup: st => { st.screen = 'profile'; st.modal = { kind: 'acRemove', id: 's2' }; } },
  { id: 'ClientPayments', file: 'payments', group: 'Phase 2', title: 'Payments', note: 'New, Phase 2. Lessons the coach hasn’t marked paid, with the coach’s payment instructions; BladeBook doesn’t take payments.', setup: st => { st.screen = 'payments'; } },
);
