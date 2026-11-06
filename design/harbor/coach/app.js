/* BladeBook coach website — Harbor.
   One source for both outputs:
     - the interactive demo (build → demo/index.html), and
     - the static page designs (build → static/*.html), rendered from PRESETS.
   Depends on ../library.js for the shared vocabulary: ic, badge, banner, avatar, eyebrow,
   pageHead, card, row, rowTitle, kv, help, stat, check, toggle, radioCard, monthGrid,
   stepper, codeBoxes, pwRules, COACH_STEPS.
   Screen groups live in screens-*.js and register into SCREENS, ACTIONS, MODALS, PRESETS.
   Nothing here touches the DOM at load, so Node can render every screen. */


/* Shared pieces (sample data, helpers, controls, runtime) live in ../shared.js. */
const APP_TITLE = 'Dana Whitfield · BladeBook coach demo';

function freshState() {
  const students = freshStudents();
  return {
    screen: 'today', authed: true, modal: null, flash: '',
    students, lessons: freshLessons(students), profile: freshProfile(), invites: freshInvites(),
    ui: {},          // per-screen UI state; each screen group owns its own keys
    auth: { step: 0, email: 'dana.whitfield@gmail.com', bizSame: false, error: '' },
  };
}
let state = freshState();

/* ================= shared lessons (ADR-026 d6) =================
   A lesson's booking skater lives on the lesson itself; a second skater is in l.with. Each skater has their own
   attendance and payment. skatersIn() flattens them: k is -1 for the booking skater, else the index in l.with,
   and ref is the object to change. */
const skatersIn = l => !l || !l.sid ? [] : [{ k: -1, ref: l }, ...(l.with || []).map((w, k) => ({ k, ref: w }))]
  .map(({ k, ref }) => ({ id: l.id, k, ref, sid: ref.sid, status: ref.status, pay: ref.pay, paidBy: ref.paidBy, price: ref.price, iso: l.iso, t: l.t, len: l.len, recurring: l.recurring, lesson: l }));
const isShared = l => !!(l && l.with && l.with.length);
/** "Sam R. & Leo M." (short) or "Sam Rivera & Leo Martin". */
const whoIn = (l, short = true) => l && l.sid ? skatersIn(l).map(p => short ? shortName(student(p.sid).name) : student(p.sid).name).join(' & ') : 'Held';
const familiesIn = l => families(skatersIn(l).map(p => student(p.sid)));
/** One attendance badge per skater; a shared lesson labels each with the skater's first name. */
const skaterBadges = l => isShared(l) ? skatersIn(l).map(p => `<span class="sh-badge"><small>${esc(student(p.sid).name.split(' ')[0])}</small>${statusBadge(p)}</span>`).join('') : statusBadge(l);

/** Links into the schedule section (schedule.html). */
const SCHEDULE_PAGES = { hub: 'schedule.html', weekly: 'schedule.html#weekly', away: 'schedule.html#away' };

/* ================= shells ================= */
const NAV_ITEMS = [
  ['Today', 'today'], ['Calendar', 'calendar-week'], ['Schedule', null], ['Students', 'students'],
  ['Lessons', 'lessons'], ['Payments', 'payments'], ['Profile', 'profile'],
];
const SECTION_OF = s => ({
  today: 'Today', 'calendar-month': 'Calendar', 'calendar-week': 'Calendar', 'calendar-day': 'Calendar', 'cancel-preview': 'Calendar',
  students: 'Students', pending: 'Students', lessons: 'Lessons', payments: 'Payments', finances: 'Payments',
  profile: 'Profile', 'profile-email': 'Profile', 'profile-visibility': 'Profile', 'profile-payments': 'Profile', 'profile-account': 'Profile', 'email-templates': 'Profile',
}[s] || 'Today');

function shell(body, o = {}) {
  const cur = SECTION_OF(state.screen);
  const n = pending().length;
  const items = NAV_ITEMS.map(([l, s]) => `<a class="nav__item${l === cur ? ' is-active' : ''}" href="${s ? href(s) : SCHEDULE_PAGES.hub}"${l === cur ? ' aria-current="page"' : ''}><span>${l}</span>${l === 'Students' && n ? `<span class="navcount">${n}</span>` : ''}</a>`).join('');
  const p = state.profile;
  return `<div class="app app--coach">
    <header class="nav"><a class="brand" href="${href('today')}"><span class="brand__mark">${ic('logo', 18)}</span><span class="brand__name">BladeBook</span></a>
      <nav class="nav__items" aria-label="Main">${items}</nav>
      <a class="nav__user" href="${href('profile')}"><span class="avatar avatar--sm">${initials(p.first + ' ' + p.last)}</span><span class="nav__user-text"><b>${esc(p.first)} ${esc(p.last)}</b><small>Coach</small></span></a></header>
    <main class="main"><div class="page page--${o.width || 'narrow'}">${state.flash ? banner('success', state.flash) : ''}${body}</div></main></div>`;
}
/** Signed-out frame: brand bar, centred card, optional aside. */
function authShell(main, aside = '', o = {}) {
  return `<div class="app app--wizard">
    <header class="wbar"><span class="brand"><span class="brand__mark">${ic('logo', 18)}</span><span class="brand__name">BladeBook</span></span><span class="wbar__ctx">${o.ctx || 'For coaches'}</span><span class="wbar__right">${o.right ?? `New to BladeBook? <a class="link" href="${href('signup')}">Create a coach account</a>`}</span></header>
    <main class="wmain">${o.steps != null ? stepper(COACH_STEPS, o.steps) : ''}<div class="wgrid${aside ? '' : ' wgrid--solo'}"><div class="wcol">${main}</div>${aside}</div></main></div>`;
}

/* ================= Sign in, password reset (Cognito) ================= */
SCREENS.login = () => authShell(card(`
  <h1 class="h1">Log in</h1><p class="lede">Welcome back. Log in with your login email.</p>
  ${state.auth.notice ? banner('success', state.auth.notice) : ''}
  ${state.auth.error ? banner('danger', state.auth.error) : ''}
  ${INP('login-email', 'Login email', 'auth.email', { type: 'email' })}
  ${INP('login-pw', 'Password', 'auth.pw', { type: 'password', placeholder: '••••••••' })}
  <div class="fine"><a class="link" href="${href('forgot')}">Forgot your password?</a></div>
  ${B('Log in', 'primary', 'login', { block: true, lg: true })}
  <p class="fine center">Sign-in is handled by Amazon Cognito. After five wrong passwords, wait a few minutes before trying again.</p>`),
  help('Checking in at the rink?', 'Use the BladeBook rinkside app on your phone. It signs in with the same email and password, but can only see today’s lessons.'));
SCREENS.forgot = () => authShell(card(state.auth.step === 0 ? `
  <h1 class="h1">Reset your password</h1><p class="lede">We’ll email a 6-digit code to your login email.</p>
  ${INP('fp-email', 'Login email', 'auth.email', { type: 'email' })}
  ${B('Email me a code', 'primary', 'forgotSend', { block: true, lg: true })}
  <p class="fine center">${A_('login', 'Back to log in')}</p>` : `
  <h1 class="h1">Enter the code and a new password</h1><p class="lede">We sent a code to <b>${esc(state.auth.email)}</b>. It expires in an hour.</p>
  <div class="label">Code</div>${codeBoxes(['4', '8', '2', '9', '1', '7'])}
  ${INP('fp-pw', 'New password', 'auth.newpw', { type: 'password', placeholder: 'At least 8 characters' })}
  ${pwRules()}
  ${B('Set new password', 'primary', 'forgotDone', { block: true, lg: true })}
  <p class="fine center"><a class="link" data-act="forgotSend">Send a new code</a> · ${A_('login', 'Back to log in')}</p>`),
  help('No email?', 'Check spam for a message from BladeBook. The code goes to your <b>login</b> email, not your business email.'), { right: `Remembered it? <a class="link" href="${href('login')}">Log in</a>` });
Object.assign(ACTIONS, {
  login() { state.auth.error = ''; state.auth.notice = ''; go('today'); state.authed = true; },
  logout() { state.authed = false; state.auth = { step: 0, email: state.profile.loginEmail }; go('login'); },
  forgotSend() { state.auth.step = 1; state.screen = 'forgot'; },
  forgotDone() { state.auth.step = 0; state.auth.notice = 'Password changed. Log in with your new password.'; go('login'); },
});

/* ================= Coach sign-up (ADR-016) ================= */
/* The coach code works only once the coach has a confirmed business email (ADR-016, amended 2026-11-06): the CODE# item is
   written when the link is confirmed, or at once with the login email. Until then a family who enters the code is told it
   doesn't match, so the card says it isn't working yet. */
const codeSub = () => state.profile.codePending ? 'Starts working once you confirm your business email.' : 'Families enter this to sign up with you.';
const codeLabel = () => `<div class="codecard__label">Your coach code</div>${state.profile.codePending ? badge('Not working yet', 'warning', 'clock') : ''}`;
const codeCardA = () => `<div class="codecard${state.profile.codePending ? ' codecard--pending' : ''}"><div><div class="codecard__head">${codeLabel()}</div><div class="codecard__code">${state.profile.code}</div><div class="codecard__sub">${codeSub()}</div></div>${B('Copy', 'secondary', 'copyCode', { icon: 'copy' })}</div>`;
/** Shown on Today and Profile while the code waits for the business email (not during sign-up, which has its own banner). */
const codePendingBanner = () => state.profile.codePending ? `<div class="codewait">${banner('warning', 'Your code starts working once you confirm your business email',
  `We sent a link to <b>${esc(state.profile.businessEmail)}</b>. Until you click it, families who enter your code are told it doesn’t match, and they can’t sign up with you.`, 'clock')}
  <p class="fine codewait__links"><a class="link" data-act="codeResend">Resend link</a> · <a class="link" href="${href('profile-email')}">Change address</a> · <a class="link" data-act="codeUseLogin">Use my login email instead</a></p></div>` : '';
SCREENS.signup = () => {
  const a = state.auth, p = state.profile, step = a.signup || 0;
  if (step === 0) return authShell(card(`
    <h1 class="h1">Start coaching on BladeBook</h1><p class="lede">Scheduling, lessons and payment reminders in one place.</p>
    <div class="grid2">${INP('su-first', 'First name', 'profile.first')}${INP('su-last', 'Last name', 'profile.last')}</div>
    <div class="hint">Shown on your booking page and in every email families get.</div>
    ${INP('su-email', 'Login email', 'profile.loginEmail', { type: 'email', hint: 'You’ll log in with this. Your daily report comes here.' })}
    ${INP('su-pw', 'Password', 'auth.pw', { type: 'password', placeholder: 'At least 8 characters' })}
    ${pwRules()}
    ${B('Create account', 'primary', 'signupNext', { block: true, lg: true })}`),
    `<aside class="help"><div class="help__title">${ic('info', 16)}Setup takes four steps</div><ol class="numlist"><li>Create your account</li><li>Verify your login email with a code</li><li>How families reach and pay you</li><li>Confirm your business email <small>— skipped if it’s your login email</small></li></ol><div class="help__body">Then build your teaching week and share your coach code.</div></aside>`,
    { steps: 0, ctx: 'Coach sign up', right: `Already have an account? <a class="link" href="${href('login')}">Log in</a>` });
  if (step === 1) return authShell(card(`
    <div class="mailicon">${ic('mail', 26)}</div>
    <h1 class="h1 center">Check your email</h1><p class="lede center">Enter the 6-digit code we sent to<br><b>${esc(p.loginEmail)}</b></p>
    ${codeBoxes(['3', '0', '7', '5', '', ''])}
    ${B('Verify email', 'primary', 'signupNext', { block: true, lg: true })}
    <p class="fine center"><a class="link" data-act="noop">Resend code</a> · <a class="link" data-act="signupBack">Change email</a></p>`, { cls: 'card--center' }),
    help('Two emails, maybe one', '<p><b>Login email</b>: private. You sign in with it; your daily report goes there. Verified now, with a code.</p><p><b>Business email</b>: the reply address families see. Same as login? Already verified. Different? It gets its own link.</p>'),
    { steps: 1, ctx: 'Coach sign up', right: '' });
  if (step === 2) return authShell(card(`
    <h1 class="h1">How families reach you</h1><p class="lede">You can change any of this later from your profile.</p>
    <div class="fieldset"><div class="label">Business email</div>
      ${SEG(['Use my login email', 'Use a different email'], a.bizSame ? 0 : 1, 'signupBizSame', [], { block: true })}
      ${a.bizSame ? `<div class="input input--readonly"><span class="input__val">${esc(p.loginEmail)}</span>${badge('Verified', 'success', 'check')}</div><div class="hint">Same as your login email, so no extra check is needed.</div>`
                  : INP('su-biz', 'Business email address', 'profile.businessEmail', { type: 'email', hint: 'We’ll send a confirmation link to this address.' })}
    </div>
    <div class="grid2">${INP('su-phone', 'Phone', 'profile.phone', { type: 'tel', optional: true })}${SEL('su-tz', 'Time zone', 'profile.tz', [['Eastern — New York', 'Eastern — New York'], ['Central — Chicago', 'Central — Chicago'], ['Mountain — Denver', 'Mountain — Denver'], ['Pacific — Los Angeles', 'Pacific — Los Angeles'], ['Eastern — Toronto', 'Eastern — Toronto']])}</div>
    <div class="fieldset"><div class="label">Currency</div>${SEG(['USD', 'CAD'], p.currency === 'USD' ? 0 : 1, 'signupCurrency', [], { block: true })}<div class="hint">Chosen once. Every lesson is priced in it.</div></div>
    ${TXT('su-instr', 'How families pay you', 'profile.instructions', { hint: 'Included in payment reminders. BladeBook doesn’t take payments itself.' })}
    <div class="fieldset"><div class="label">Payment types <span class="label__opt">Optional</span></div>${payTypeRows('su')}<div class="hint">Switch on each way families can pay you. You can change these any time from your profile.</div></div>
    <div class="fieldset"><div class="label">Profile photo <span class="label__opt">Optional</span></div><div class="photo-pick">${avatar(initials(p.first + ' ' + p.last), 'lg')}${B('Upload a photo', 'secondary', 'noop', { sm: true, icon: 'plus' })}<span class="hint">JPG or PNG, up to 2 MB. Families see it after entering your coach code.</span></div></div>
    ${B(a.bizSame ? 'Finish setup' : 'Save and continue', 'primary', 'signupNext', { block: true, lg: true })}`),
    help('Why a business email?', 'It’s the only address families see. Emails go out as “Dana Whitfield via BladeBook” and replies come to you. Your login email stays private unless you choose it here.'),
    { steps: 2, ctx: 'Coach sign up', right: '' });
  if (step === 3) return authShell(card(`
    <div class="mailicon">${ic('mail', 26)}</div>
    <h1 class="h1 center">Confirm your business email</h1><p class="lede center">We sent a link (not a code) to<br><b>${esc(p.businessEmail)}</b></p>
    ${banner('info', 'Families can’t reach you until this is confirmed.')}
    <p class="fine center"><a class="link" data-act="noop">Resend link</a> · <a class="link" data-act="signupBack">Change address</a> · <a class="link" data-act="signupUseLogin">Use my login email instead</a></p>
    <hr class="hr">${codeCardA()}
    ${B('I’ve clicked the link', 'secondary', 'signupConfirmed', { block: true })}
    ${B('Go to my dashboard', 'primary', 'signupFinish', { block: true, lg: true })}`, { cls: 'card--center' }),
    help('Why confirm this one?', 'A typo here would send every family’s replies to a stranger, and nobody would notice. Confirming proves the address is yours.'),
    { steps: 3, ctx: 'Coach sign up', right: '' });
  return authShell(card(`
    <div class="hero hero--success hero--stack"><span class="hero__icon">${ic('check', 26)}</span><div><h1 class="h1">You’re all set</h1><p class="lede">Families will reach you at <b>${esc(a.bizSame ? p.loginEmail : p.businessEmail)}</b>.</p></div></div>
    ${codeCardA()}
    <div class="nextup"><div>${eyebrow('Next up')}<div class="nextup__title">Build your teaching week</div><div class="nextup__sub">Set your blocks, lesson lengths and prices.</div></div>${B('Start', 'primary', '', { lg: true, iconR: 'arrowR', href: SCHEDULE_PAGES.weekly })}</div>
    <p class="fine center">${A_('today', 'Or go to your dashboard')}</p>`),
    help('Want a different address later?', 'Change your business email any time from your profile. A new address gets a confirmation link before families see it.'),
    { steps: 4, ctx: 'Coach sign up', right: '' });
};
Object.assign(ACTIONS, {
  signupNext() { const a = state.auth; a.signup = (a.signup || 0) + 1; if (a.signup === 3 && a.bizSame) a.signup = 4; if (a.signup === 3) state.profile.codePending = true; },
  signupBack() { state.auth.signup = Math.max(0, (state.auth.signup || 0) - 1); },
  signupBizSame(i) { state.auth.bizSame = i === 0; },
  signupCurrency(i) { state.profile.currency = i === 0 ? 'USD' : 'CAD'; },
  signupUseLogin() { state.auth.bizSame = true; state.profile.businessEmail = state.profile.loginEmail; state.profile.codePending = false; state.auth.signup = 4; },
  signupConfirmed() { state.profile.codePending = false; state.auth.signup = 4; },
  codeResend() { state.flash = `Sent a new link to ${state.profile.businessEmail}.`; },
  codeUseLogin() { const p = state.profile; p.businessEmail = p.loginEmail; p.codePending = false; state.flash = `Your code works now. Families’ replies go to ${p.loginEmail}.`; },
  signupFinish() { state.authed = true; go('today'); },
  copyCode() { state.flash = `Copied ${state.profile.code}.`; },
  noop() {},
});

/* ================= Today (the coach dashboard) ================= */

SCREENS.today = () => {
  const today = lessonsOn(TODAY);
  const ws = weekStart(TODAY), we = addDays(ws, 6);
  const week = state.lessons.filter(l => l.sid && l.iso >= ws && l.iso <= we).flatMap(skatersIn);
  const unpaid = state.lessons.filter(l => l.sid && isPast(l)).flatMap(skatersIn).filter(p => p.pay === 'UNPAID');
  const pend = pending();
  const next = today.find(l => l.sid && !isStarted(l));
  const lessonRow = l => row(`<span class="tlist__t num">${fmtShortT(l.t)}</span>${l.sid ? avatar(initials(nameOf(l)), 'sm') : `<span class="roundicon">${ic('lock', 14)}</span>`}${rowTitle(l.sid ? esc(whoIn(l, false)) : 'Held slot', `${l.len} min${l.sid ? ' · ' + skatersIn(l).map(p => money(p.price)).join(' + ') : ' · not bookable'}${isShared(l) ? ' · shared lesson' : ''}`)}`,
    `${l === next ? badge('Next', 'primary') : ''}${l.sid ? skaterBadges(l) : ''}`, { cls: isStarted(l) && !(l === next) ? 'row--muted' : '' });
  const famSub = kids => kids.map(k => esc(k.name)).join(' & ') + ' · signed up ' + dShort(kids[0].since);
  return shell(`
    ${pageHead(`Good morning, ${esc(state.profile.first)}`, dLong(TODAY), B('Open week view', 'secondary', '', { href: href('calendar-week'), icon: 'calendar' }))}
    ${codePendingBanner()}
    ${card(`<div class="rink-cta"><div class="rink-cta__text"><b>Heading to the rink?</b><span class="muted">Check skaters in from your phone at <span class="num">/coach/rinkside</span>, with the same email and password. The link is in your morning email too.</span></div>${B('Open the rinkside app', 'primary', '', { lg: true, icon: 'phone', href: '../../rinkside/demo/index.html' })}</div>`)}
    <div class="stats">
      ${stat('This week', plural(week.length, 'lesson'), `${money(week.reduce((s, l) => s + l.price, 0))} booked`, 'calendar')}
      ${stat('Unpaid', money(unpaid.reduce((s, l) => s + l.price, 0)), plural(unpaid.length, 'past lesson'), 'card')}
      ${stat('Waiting for approval', plural(pend.length, 'skater'), pend.length ? families(pend).join(', ') : 'Nobody waiting', 'users')}
    </div>
    <div class="split split--today">
      ${card(today.length ? today.map(lessonRow).join('') + `<div class="card__note">${ic('info', 14)} Attendance comes from the rinkside app. Fix a mistake on ${A_('lessons', 'Lessons')}.</div>`
        : `<div class="pempty"><span class="pempty__icon">${ic('calendar', 22)}</span><b>No lessons today</b><span class="muted">Your next lesson is on Friday.</span></div>`,
        { title: 'Today’s lessons', sub: `${plural(today.filter(l => l.sid).length, 'lesson')} · Pelham Civic Center`, pad: false, action: A_('calendar-day', 'Day view') })}
      <div class="stack">
        ${pend.length ? card(`${families(pend).map(f => { const kids = pend.filter(s => s.client === f); return row(`${avatar(initials(f), 'sm')}${rowTitle(esc(f), famSub(kids))}`, ''); }).join('')}
          <div class="card__foot">${B('Review sign-ups', 'primary', '', { href: href('pending'), block: true })}</div>`, { title: 'New families to approve', sub: 'They can’t see your times or book until you approve them.', pad: false, cls: 'card--attn' }) : ''}
        ${card(`<div class="quick">
          ${[['Edit weekly schedule', 'repeat', SCHEDULE_PAGES.weekly], ['Time off or special schedule', 'calOff', SCHEDULE_PAGES.away], ['Month', 'calendar', href('calendar-month')], ['Week', 'calendar', href('calendar-week')],
             ['Students', 'users', href('students')], ['Payments', 'card', href('payments')], ['Financial summary', 'trend', href('finances')], ['Profile', 'user', href('profile')], ['Email templates', 'mail', href('email-templates')]]
            .map(([t, i, h]) => `<a class="quick__item" href="${h}"><span class="quick__icon">${ic(i, 18)}</span><span>${t}</span>${t === 'Email templates' ? '<small>Phase 2</small>' : ''}</a>`).join('')}
        </div>`, { title: 'Go to' })}
      </div>
    </div>`, { width: 'wide' });
};

PRESETS.push(
  { id: 'CoachLogin', file: 'login', group: 'Sign in', title: 'Log in', note: 'New. Cognito sign-in with the forgot-password link and a pointer to the rinkside app.', setup: st => { st.authed = false; st.screen = 'login'; } },
  { id: 'CoachForgot', file: 'forgot-password', group: 'Sign in', title: 'Forgot password — email a code', note: 'New. Cognito ForgotPassword sends a code to the login email (ADR-016 d3).', setup: st => { st.screen = 'forgot'; st.auth.step = 0; } },
  { id: 'CoachForgotCode', file: 'forgot-password-code', group: 'Sign in', title: 'Forgot password — code and new password', note: 'New. ConfirmForgotPassword: code plus the new password rules.', setup: st => { st.screen = 'forgot'; st.auth.step = 1; } },
  { id: 'CoachAccount', file: 'signup-1-account', group: 'Sign up', title: '1 · Account', note: 'From CoachAccount; first and last name split, as ADR-016 stores them.', setup: st => { st.screen = 'signup'; st.auth.signup = 0; } },
  { id: 'CoachVerify', file: 'signup-2-verify', group: 'Sign up', title: '2 · Verify login email', note: 'From CoachVerify.', setup: st => { st.screen = 'signup'; st.auth.signup = 1; } },
  { id: 'CoachBusiness', file: 'signup-3-business', group: 'Sign up', title: '3 · Business details — different email', note: 'From CoachBusiness; adds phone, one switch per payment type (Cash, Venmo, Cash App, PayPal; ADR-016 d7, amended 2026-10-12) and the optional photo from the sign-up spec.', setup: st => { st.screen = 'signup'; st.auth.signup = 2; st.auth.bizSame = false; } },
  { id: 'CoachBusinessSame', file: 'signup-3-business-same', group: 'Sign up', title: '3 · Business details — same email', note: 'From CoachBusinessSame.', setup: st => { st.screen = 'signup'; st.auth.signup = 2; st.auth.bizSame = true; } },
  { id: 'CoachConfirm', file: 'signup-4-confirm-email', group: 'Sign up', title: '4 · Confirm business email', note: 'From CoachConfirm. The coach code is shown as Not working yet: it starts working once the link is clicked (ADR-016, amended 2026-11-06).', setup: st => { st.screen = 'signup'; st.auth.signup = 3; st.profile.codePending = true; } },
  { id: 'CoachAllSet', file: 'signup-5-all-set', group: 'Sign up', title: '5 · All set', note: 'From CoachAllSet.', setup: st => { st.screen = 'signup'; st.auth.signup = 4; st.auth.bizSame = true; } },
  { id: 'CoachTodayCodePending', file: 'today-code-pending', group: 'Dashboard', title: 'Today — coach code not working yet', note: 'New (ADR-016, amended 2026-11-06). Dana chose a different business email at sign-up and went to her dashboard without clicking the link. Her coach code doesn’t work until she does: the CODE# item is written only once the address is confirmed. The banner says so, with Resend link, Change address and Use my login email instead (which makes the code work at once).', setup: st => { st.screen = 'today'; st.profile.codePending = true; } },
  { id: 'CoachToday', file: 'today', group: 'Dashboard', title: 'Today', note: 'New. The spec’s dashboard: a large link to the rinkside app (owner, 2026-10-13), today’s lessons (Sam and Leo share the 6:00), the numbers a coach checks, new families to approve, and a button to every page, including the financial summary.', setup: st => { st.screen = 'today'; } },
);

