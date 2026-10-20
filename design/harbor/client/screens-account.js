/* Client — account screens: log in, forgot password, sign-up, home, profile, payments (Phase 2).
   Specs: FeatureDecriptions/Client Sign Up, ClientHomeView, ClientProfileView; ADR-002; ADR-007;
   ADR-016 d7a; ADR-022 d6–d7 (a family with no approved skater sees only their own account);
   ADR-026 d4–d5a (share codes, the shared-lesson invitation page and the red home banner).
   Registers SCREENS login / forgot / signup / home / profile / invite / payments, ACTIONS ac* and inv*, MODALS ac*, PRESETS. */

/** A skater's ticked coaches during sign-up; every chosen coach until the family changes it. */
const suSel = (u, key) => (u[key] ??= [...suCids(u)]).filter(id => suCids(u).includes(id));
const acUi = () => (state.ui.ac ??= { fp: 0, newName: '', newMinor: 0, newOrg: 0, newNum: '', adding: false, newCoaches: [], coachAdding: false, coachCode: '', coachKids: [] });
const suUi = () => (state.ui.su ??= { step: 0, code: '', coaches: [], forWho: 1, first: 'Sarah', last: 'Park', phone: '(205) 555-0196', email: 'sarah.park@example.com', pw: '', pw2: '', sms: true, skaters: [], draft: '', draftMinor: 0, draftOrg: 0, draftNum: '', selfOrg: 0, selfNum: '' });
/* Skating organizations a skater can be registered with: Phase 1 takes these three (ADR-029 d2, Learn to Skate USA added
   2026-10-16); Skate Canada and Hockey Canada are Phase 2. The number is required and can't be checked (no API); the coach
   checks it themselves if they want to (FeatureDecriptions/Client Sign Up). */
const SKATE_ORGS = [{ name: 'U.S. Figure Skating', num: 'Member number', eg: 'e.g. 1234567', fmt: '' }, { name: 'USA Hockey', num: 'Registration number', eg: 'e.g. 2027KQ4815MX3T', fmt: ': 14 characters, 9 digits and 5 letters' }, { name: 'Learn to Skate USA', num: 'Member number', eg: 'e.g. 1234567', fmt: '' }];
const orgLine = s => `${SKATE_ORGS[s.org].name} <span class="mono">#${esc(s.num)}</span>`;
/* The number is free text, so it's cleaned (spaces out, uppercase) and its shape checked before it's saved; the cleaned form
   is stored (Client Sign Up; Open-Pending §2b). USA Hockey: 14 characters, 9 digits and 5 letters (the season's check digit
   will be a setting, not code). U.S. Figure Skating's and Learn to Skate USA's formats aren't known yet: letters and digits
   only, up to 20.
   This checks the shape only, never that the number is real. */
const acCleanNum = n => String(n || '').replace(/\s+/g, '').toUpperCase();
function acNumError(org, n) {
  const c = acCleanNum(n), digits = (c.match(/[0-9]/g) || []).length;
  if (!c) return '';
  if (!/^[A-Z0-9]+$/.test(c)) return 'Use letters and numbers only.';
  if (org === 1) return c.length >= 14 && !(c.length === 14 && digits === 9) ? 'USA Hockey numbers are 14 characters: 9 digits and 5 letters.' : '';
  return c.length > 20 ? 'That’s too long for a member number.' : '';
}
const acNumOk = (org, n) => { const c = acCleanNum(n); return !!c && !acNumError(org, n) && (org !== 1 || c.length === 14); };
/** Organization picker plus number field for one skater. base is the ui state path ('ui.su', 'ui.ac'); orgKey/numKey are fields on it. */
const skaterOrgFields = (base, orgKey, numKey, idp, act) => { const u = getPath(base), org = SKATE_ORGS[u[orgKey]]; return `
  <div class="fieldset ac-org"><div class="label">Skating organization</div>${SEG(SKATE_ORGS.map(o => o.name), u[orgKey], act, [], { block: true })}</div>
  ${INP(idp, org.num, `${base}.${numKey}`, { live: true, mono: true, placeholder: org.eg, error: acNumError(u[orgKey], u[numKey]), hint: `From the skater’s ${org.name} membership for this season${org.fmt}. It changes every season.` })}`; };
/* Share codes (ADR-026 d4): every skater has one, issued when the skater is created. A family gives it to a family they
   want to share a lesson with. A skater's code never changes (owner, 2026-10-13).
   Shape (owner, 2026-10-13): the first 3 letters of the first name, filled from the last name if it's shorter (Bo Li → BOL),
   accents dropped, then a dash and 5 random characters from the coach code's look-alike-free set: MIA-4K7QX. */
const SHARE_ALPHABET = 'ABCDEFGHJKMNPQRTVWXYZ2346789';
const acSharePrefix = name => String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
const acShareCode = (name, seed) => { let h = hash(name + seed), c = ''; for (let i = 0; i < 5; i++) { c += SHARE_ALPHABET[h % SHARE_ALPHABET.length]; h = Math.floor(h / SHARE_ALPHABET.length) + 7919 * (i + 1); } return `${acSharePrefix(name)}-${c}`; };
/* Texts to families are Phase 2 (owner, 2026-10-12): until then every reminder and cancellation goes by email. */
const smsLater = () => `<div class="fieldset"><div class="label">Text reminders ${badge('Phase 2', 'neutral')}</div><div class="hint">Texts come in Phase 2. Until then every reminder and cancellation comes by email.</div></div>`;
const SMS_TERMS = 'Texts arrive the morning of a lesson and when a lesson is cancelled. Msg &amp; data rates may apply. Reply STOP to stop, HELP for help. Email reminders always go out.';
const coachPhoto = (sz = 'lg') => avatar(initials(coachName()), sz);
/* Several coaches at sign-up (ADR-025 d2, amended 2026-10-06; designed 2026-10-13). Each code is looked up as it's typed.
   The first coach found carries on as before ("Continue with Dana"); "Add another coach" keeps it and clears the box for the
   next code. Each skater then picks which of those coaches they join, and waits for each one separately. */
/** The coaches chosen so far, plus the one whose code is in the box now. Coach Dana when nothing is entered (static pages). */
const suCids = u => { const f = findCoach(u.code), ids = [...u.coaches]; if (f && !ids.includes(f.id)) ids.push(f.id); return ids.length ? ids : [DANA]; };
const suMulti = u => suCids(u).length > 1;
const suCoachWords = u => suMulti(u) ? 'your coaches' : `Coach ${esc(coachById(suCids(u)[0]).first)}`;
/** A share code typed where a coach code goes: three letters, then a dash (MIA-4K7QX). Only the dash's place tells them
    apart, so a share code typed without its dash gets the ordinary no-match message. */
const acLooksLikeShare = code => /^\s*[a-z]{3}\s*-\s*[a-z0-9]{5}\s*$/i.test(String(code || ''));
const SHARE_IN_COACH_BOX = 'That looks like a skater’s share code. Ask your coach for their coach code.';
/** Code check, as the lookup does it: letters and digits only, 8 of them. */
function acCodeState(code, taken = []) {
  const c = findCoach(code);
  if (!c && acLooksLikeShare(code)) return 'share';
  if (c === null) return 'typing';
  if (!c) return 'wrong';
  return taken.includes(c.id) ? 'dup' : 'found';
}
const famAside = () => help('How signing up works', `Each coach gives you a code. You create an account, add the skater (you or your child), and each coach approves them. Booking with a coach opens as soon as they do.`);
const coachFound = (c, extra = '') => `<div class="found">${avatar(initials(cName(c)))}<div><div class="found__name">Coach ${esc(cName(c))}</div><div class="found__sub">${RINK_SHORT} · ${esc(c.sport || 'Figure skating')}</div></div>${extra}</div>`;
const coachChip = () => { const ids = suCids(suUi()); return card(`${eyebrow(ids.length > 1 ? 'Signing up with' : 'Signing up with')}${ids.map(id => { const c = coachById(id); return `<div class="found found--plain">${avatar(initials(cName(c)), '')}<div><div class="found__name">Coach ${esc(cName(c))}</div><div class="found__sub mono">${c.code}</div></div></div>`; }).join('')}`); };
/** Which coaches a skater joins, when there's more than one. act toggles one coach; on is the ticked list. */
const suCoachPick = (ids, on, act, args = []) => ids.length < 2 ? '' : `<div class="fieldset"><div class="label">Which coaches?</div><div class="ac-coachkids">${ids.map(id => { const c = coachById(id); return CHK(`Coach ${esc(cName(c))}`, on.includes(id), act, [...args, id], esc(c.sport || 'Figure skating')); }).join('')}</div>${on.length ? '' : `<div class="hint hint--error">${ic('alert', 14)}Pick at least one coach.</div>`}</div>`;

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
  const u = suUi(), cs = acCodeState(u.code, u.coaches), self = u.forWho === 0, ids = suCids(u), multi = ids.length > 1, who = suCoachWords(u);
  const right = `Already have an account? <a class="link" href="${href('login')}">Log in</a>`;
  if (u.step === 0) {
    const c = findCoach(u.code), added = u.coaches.map(coachById), n = added.length + (cs === 'found' ? 1 : 0);
    // A code in the box that doesn't check out blocks Continue, so a mistyped second coach is never dropped without the family noticing.
    const bad = added.length > 0 && (cs === 'wrong' || cs === 'share' || cs === 'dup');
    return authShell(card(`
    <h1 class="h1">Join your coach on BladeBook</h1><p class="lede">Enter the code your coach gave you. More than one coach? Add each one’s code.</p>
    ${added.map((ac, i) => coachFound(ac, B('Remove', 'ghost', 'acSuDropCoach', { sm: true, args: [i] }))).join('')}
    ${INP('ac-code', added.length ? 'Another coach’s code' : 'Coach code', 'ui.su.code', { live: true, mono: true, placeholder: 'e.g. K7QM-4X9T', error: cs === 'wrong' ? 'That code doesn’t match a coach. Check it with your coach. Codes are 8 letters and numbers.' : cs === 'share' ? SHARE_IN_COACH_BOX : cs === 'dup' ? `Coach ${esc(c.first)} is already on your list.` : '', hint: cs === 'typing' ? 'It links your account to your coach’s lessons.' : '' })}
    ${cs === 'found' ? coachFound(c, badge('Code found', 'success', 'check')) + `<button type="button" class="addrow" data-act="acSuAddCoach">${ic('plus', 16)}Add another coach</button>`
      : !added.length ? `<div class="empty-coach">${ic('user', 20)}<span>Your coach will appear here so you can check it’s the right one.</span></div>` : ''}
    ${B(n > 1 ? `Continue with ${n} coaches` : n === 1 ? `Continue with ${esc((cs === 'found' ? c : added[0]).first)}` : 'Continue', 'primary', 'acSuNext', { block: true, lg: true, iconR: n ? 'arrowR' : '', disabled: !n || bad })}
    <p class="fine center">${bad ? `Fix the code or clear the box to continue with ${n > 1 ? `${n} coaches` : `Coach ${esc(added[0].first)}`}.` : n ? 'Wrong coach? Check the code with them.' : 'No code? Ask your coach. Every coach has their own.'}</p>`), famAside(), { steps: 0, ctx: 'Family sign up', right });
  }

  if (u.step === 1) return authShell(card(`
    <h1 class="h1">About you</h1><p class="lede">The person who books and pays for lessons.</p>
    <div class="fieldset"><div class="label">Who are the lessons for?</div>${SEG(['Me (18 or older)', 'A child I’m guardian of'], u.forWho, 'acSuFor', [], { block: true })}<div class="hint">${self ? 'You’re the skater. Under 18? Your guardian signs up and adds you.' : 'Sign up as yourself. You add your child on step 4.'}</div></div>
    <div class="grid2">${INP('ac-su-first', self ? 'First name' : 'Your first name', 'ui.su.first')}${INP('ac-su-last', self ? 'Last name' : 'Your last name', 'ui.su.last')}</div>
    <div class="grid2">${INP('ac-su-phone', 'Mobile phone', 'ui.su.phone', { type: 'tel' })}${INP('ac-su-email', 'Email', 'ui.su.email', { type: 'email', hint: 'For logging in, confirmations and reminders.' })}</div>
    ${INP('ac-su-pw', 'Password', 'ui.su.pw', { type: 'password', placeholder: 'At least 8 characters' })}
    ${pwRules()}
    ${INP('ac-su-pw2', 'Confirm password', 'ui.su.pw2', { type: 'password', placeholder: 'Type it again', hint: 'Type it again rather than pasting. Pasting is turned off here.' })}
    ${smsLater()}
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
      <h1 class="h1">You’re the skater</h1><p class="lede">Check your details. This is who ${who} will see.</p>
      <div class="skater">${avatar(initials(`${u.first} ${u.last}`))}<div class="skater__text"><b>${esc(u.first)} ${esc(u.last)} ${badge('You', 'primary')}</b><small>Adult · from your account details</small></div></div>
      ${CHK('I’m 18 or older', true, 'noop', [], 'If you’re under 18, a guardian needs to sign up and add you as their skater.')}
      ${skaterOrgFields('ui.su', 'selfOrg', 'selfNum', 'ac-su-self-num', 'acSuSelfOrg')}
      ${suCoachPick(ids, suSel(u, 'selfCoaches'), 'acSuSelfCoach')}
      <p class="fine">Booking for someone else? <a class="link" data-act="acSuChangeWho">Change who the lessons are for</a>.</p>
      <div class="actions"><div>${B('Back', 'ghost', 'acSuBack', { icon: 'arrowL' })}</div><div class="actions__r">${B(multi ? 'Send to your coaches' : `Send to ${who}`, 'primary', 'acSuFinish', { lg: true, iconR: 'arrowR', disabled: !acNumOk(u.selfOrg, u.selfNum) || !suSel(u, 'selfCoaches').length })}</div></div>`),
      `<div class="stack">${help('Skating yourself', `${multi ? 'Each coach' : who} still approves you before you can book with them. You’ll get an email when they do.`)}${help('Your skater number', 'Every skater needs a current U.S. Figure Skating, USA Hockey or Learn to Skate USA number to sign up. BladeBook can’t check it; your coach may.')}</div>`,
      { steps: 3, ctx: 'Family sign up', right: '' });
    const list = u.skaters.map((s, i) => `<div class="skater">${avatar(initials(s.name))}<div class="skater__text"><b>${esc(s.name)}</b><small>${s.minor ? 'Under 18 · your child' : '18 or older'} · ${orgLine(s)}${multi ? ` · ${coachOr((s.coaches || ids).filter(id => ids.includes(id)), 'and')}` : ''}</small></div>${B('Remove', 'ghost', 'acSuDropSkater', { sm: true, args: [i] })}</div>`).join('');
    return authShell(card(`
      <h1 class="h1">Who’s skating?</h1><p class="lede">Add everyone who will take lessons with ${who}.</p>
      ${list || `<p class="fine">No skaters yet. Add at least one.</p>`}
      <div class="skater skater--edit">
        <div class="grid2 grid2--wide">${INP('ac-su-skater', 'Skater’s full name', 'ui.su.draft', { placeholder: 'e.g. Ava Park' })}<div class="fieldset"><div class="label">Under 18?</div>${SEG(['Yes', 'No'], u.draftMinor, 'acSuDraftMinor')}</div></div>
        ${skaterOrgFields('ui.su', 'draftOrg', 'draftNum', 'ac-su-skater-num', 'acSuDraftOrg')}
        ${suCoachPick(ids, suSel(u, 'draftCoaches'), 'acSuDraftCoach')}
        <div class="skater__actions">${B(u.skaters.length ? 'Add another skater' : 'Add skater', 'secondary', 'acSuAddSkater', { sm: true, icon: 'plus', disabled: !u.draft.trim() || !acNumOk(u.draftOrg, u.draftNum) || !suSel(u, 'draftCoaches').length })}</div>
      </div>
      <div class="actions"><div>${B('Back', 'ghost', 'acSuBack', { icon: 'arrowL' })}</div><div class="actions__r">${B(multi ? 'Send to your coaches' : `Send to ${who}`, 'primary', 'acSuFinish', { lg: true, iconR: 'arrowR', disabled: !u.skaters.length })}</div></div>`),
      `<div class="stack">${help('What happens next', `${multi ? 'Each coach approves the skaters who chose them' : `${who} approves each skater`} before they can be booked. You can add more skaters and coaches later from your profile.`)}${help('Skater numbers', 'Every skater needs a current U.S. Figure Skating, USA Hockey or Learn to Skate USA number to sign up. BladeBook can’t check it; your coach may.')}</div>`,
      { steps: 3, ctx: 'Family sign up', right: '' });
  }

  const kids = (u.done || []).map(d => typeof d === 'string' ? { name: d, coaches: ids } : d);
  return authShell(card(`
    <div class="hero hero--success hero--stack"><span class="hero__icon">${ic('check', 26)}</span><div><h1 class="h1">You’re in</h1><p class="lede">Signed in as ${esc(u.email)}. One thing left: ${multi ? 'each coach’s approval' : `${who}’s approval`}.</p></div></div>
    <div class="listbox">${kids.map(k => row(`${avatar(initials(k.name), 'sm')}${rowTitle(esc(k.name), `with ${coachOr(k.coaches, 'and')}`)}`, `<span class="ac-kc__list">${k.coaches.map(id => badge(multi ? `Waiting for Coach ${esc(coachById(id).first)}` : 'Waiting for approval', 'warning', 'clock')).join('')}</span>`)).join('')}</div>
    <p class="fine">We’ll email you as soon as ${multi ? 'each coach approves' : `${who} approves`}. Booking with a coach opens once they approve.</p>
    ${B('Go to my account', 'primary', 'acSuToHome', { block: true, lg: true })}`),
    help('While you wait', 'Your account shows your profile and your skaters. You can’t see your coach’s times until a skater is approved.'),
    { steps: 4, ctx: 'Family sign up', right: '' });
};

/* ================= Home ================= */
/** One card per coach (owner, 2026-10-13). A coach who hasn't approved any of the family's skaters shows no contact
    details or payment handles: a waiting family reads nothing of that coach (ADR-022 d6, ADR-025 d3). */
const acCoachCard = cid => {
  const p = coachById(cid), lines = [], kids = myKids().filter(k => linkOf(k, cid)), ok = kids.some(k => linkOf(k, cid) === 'ACTIVE');
  if (ok && p.showPhone && p.phone) lines.push(`<span>${ic('phone', 14)}${esc(p.phone)}</span>`);
  if (ok && p.showEmail && p.businessEmail) lines.push(`<span>${ic('mail', 14)}${esc(p.businessEmail)}</span>`);
  if (ok) lines.push(...payShown(p).map(([k, v]) => `<span>${ic('card', 14)}${k}${v ? ' ' + esc(v) : ''}</span>`));   // one switch per type (ADR-016 d7)
  const multi = multiCoach();
  return card(`<div class="found found--plain">${avatar(initials(cName(p)), '')}<div><div class="found__name">Coach ${esc(cName(p))}</div><div class="found__sub">${RINK_SHORT} · ${esc(p.sport || 'Figure skating')}${multi ? ` · ${kids.map(k => esc(firstName(k.name))).join(', ')}` : ''}</div></div>${multi && !ok ? badge('Waiting', 'warning', 'clock') : ''}</div>
    ${!ok ? `<p class="fine">Waiting for Coach ${esc(p.first)} to approve ${kids.map(k => esc(firstName(k.name))).join(' and ')}. Contact details and booking show once they do.</p>`
      : lines.length ? `<div class="ac-contact">${lines.join('')}</div>` : `<p class="fine">Reply to any lesson email to reach Coach ${esc(p.first)}.</p>`}`, { title: multi ? '' : 'Your coach', cls: 'ac-coachcard' });
};
const acCoachCards = () => `${multiCoach() ? `<div class="ac-cardshead">Your coaches</div>` : ''}${myCoachIds().map(acCoachCard).join('')}`;
const acLessonRow = l => row(`<span class="ac-when num"><b>${fmtShortT(l.t)}</b><small>${l.iso === TODAY ? 'Today' : dDow(l.iso)}</small></span>${avatar(initials(nameOf(l)), 'sm')}${rowTitle(esc(nameOf(l)), `${coachTag(l).replace(/^ · /, '')}${coachTag(l) ? ' · ' : ''}${l.len} min · ${money(l.price)}${l.recurring ? ' · repeats weekly' : ''}${l.with ? ' · shared' : l.invited ? ' · invited to share' : ''}`)}`,
  isStarted(l) ? statusBadge(l) : badge('Booked', 'primary'));

/* The red shared-lesson banner (ADR-026 d5a), worked out when the page loads from the invitation's status and lesson time.
   Family A: the lesson goes ahead private at the booking's own price. Family B: the skater won't join. */
const acShareBanners = (only = null) => [
  ...invsFromMe().filter(i => invWarned(i) && (!only || i === only)).map(i => { const b = esc(firstName(student(i.skater).name)), cf = esc(invCoach(i).first);
    return banner('danger', `Coach ${cf} hasn’t confirmed ${b} for your shared lesson on ${dDow(i.iso)} at ${fmtT(i.t)}`, `Unless Coach ${cf} does, it will go ahead as a private lesson, charged at the booking’s own price.`); }),
  ...invsToMe().filter(i => invWarned(i) && (!only || i === only)).map(i => { const b = esc(firstName(student(i.skater).name)), cf = esc(invCoach(i).first);
    return banner('danger', `Coach ${cf} hasn’t accepted ${b} yet`, `If Coach ${cf} doesn’t before the lesson, ${b} won’t join the ${dDow(i.iso)} ${fmtT(i.t)} lesson.`); }),
].join('');
/** Invitations for this family's skaters that are still open: answer one, or see it waiting for the coach. */
const acInviteCard = () => {
  const open = invsToMe().filter(i => i.status === 'SENT' || i.status === 'AWAITING_COACH');
  if (!open.length) return '';
  return card(open.map(i => { const k = student(i.skater), host = student(i.fromSkater);
    return row(`<span class="roundicon">${ic('users', 18)}</span>${rowTitle(`${esc(i.from)} invited ${esc(firstName(k.name))} to share a lesson with Coach ${esc(cName(invCoach(i)))}`, `${invWhen(i)}${i.series ? ` · ${invDates(i)}` : ''} · with ${esc(shortName(host.name))}`)}`,
      i.status === 'SENT' ? invLink(i.id, 'See the invitation') : `${badge(`Waiting for Coach ${esc(invCoach(i).first)}`, 'warning', 'clock')}${invLink(i.id, 'Details', 'ghost')}`); }).join(''),
    { title: 'Shared lesson invitations', sub: 'Another family invited your skater to share their lesson.', pad: false, cls: open.some(i => i.status === 'SENT') ? 'card--attn' : '' });
};

/* Per-coach wording (owner, 2026-10-13): every coach a skater is waiting for is named, never only Coach Dana. */
function acHomePending() {
  const kids = myKids(), waits = waitingByCoach(), multi = waits.length > 1;
  // A skater invited to share a lesson waits for the coach like any sign-up, then joins (ADR-026 d5 step 5).
  const invited = kids.filter(k => k.pendingJoins && k.pendingJoins.length), inv = invited.length ? state.invites.find(i => i.id === invited[0].pendingJoins[0].invite) : null;
  const names = list => list.length === 1 ? esc(firstName(list[0].name)) : list.map(k => esc(firstName(k.name))).join(' and ');
  const coaches = coachOr(waits.map(w => w.cid), 'and');
  const lead = waits.length ? (multi ? `Waiting for ${coaches} to approve your skaters` : `Waiting for Coach ${esc(waits[0].c.first)} to approve ${waits[0].kids.length === kids.length && kids.length > 1 ? 'your skaters' : names(waits[0].kids)}`) : '';
  const icn = inv ? esc(invCoach(inv).first) : '';
  return shell(`
    ${pageHead(`Welcome, ${esc(firstName(state.me.name))}`, invited.length && inv ? `${esc(firstName(invited[0].name))} is joining Coach ${esc(cName(invCoach(inv)))}’s students.` : `You’re signed up with ${coachOr(myCoachIds(), 'and')}.`)}
    ${acShareBanners()}
    ${waits.length ? `<div class="alertcard ac-wait"><div class="alertcard__head">${ic('clock', 20)}<div><div class="alertcard__title">${lead}</div><div class="alertcard__body">${invited.length && inv
      ? `You agreed to ${names(invited)} joining Coach ${icn}’s students when you accepted ${esc(inv.from)}’s invitation. Until Coach ${icn} accepts, you won’t see Coach ${icn}’s times and can’t book.`
      : `${multi ? 'Until a coach approves, you won’t see their times and can’t book with them.' : `Until then you won’t see Coach ${esc(waits[0].c.first)}’s times and can’t book.`} Each coach checks that they know each family who signs up with their code.`}</div></div></div>${multi ? `<div class="listbox ac-waitlist">${waits.map(w => row(`${avatar(initials(cName(w.c)), 'sm')}${rowTitle(`Coach ${esc(cName(w.c))}`, `Waiting to approve ${names(w.kids)}`)}`, badge('Waiting', 'warning', 'clock'))).join('')}</div>` : ''}</div>` : ''}
    ${acInviteCard()}
    ${card(kids.map(k => row(`${avatar(initials(k.name), 'sm')}${rowTitle(esc(k.name), `${k.minor ? 'Under 18' : 'Adult'} · ${acKidCoaches(k).length ? `signed up ${dShort(k.since)}` : 'invited to share a lesson'}`)}`, acKidCoaches(k).length ? `<span class="ac-kc__list">${acKidCoaches(k).map(id => badge(multiCoach() ? `Waiting for Coach ${esc(coachById(id).first)}` : 'Waiting for approval', 'warning', 'clock')).join('')}</span>` : badge(`Not Coach ${esc(icn || coachFirst())}’s student yet`, 'neutral'))).join(''),
      { title: 'Your skaters', pad: false, action: A_('profile', 'Profile') })}
    ${card(`<ol class="ac-steps"><li><b>${multi ? 'Each coach approves' : `Coach ${esc((waits[0] || { c: coachById(DANA) }).c.first)} approves`} each skater.</b> Usually within a day.</li><li><b>We email you</b> at ${esc(state.me.email)}${multi ? ' as each coach approves' : ''}.</li>${invited.length && inv ? `<li><b>${esc(firstName(invited[0].name))} joins the shared lesson</b> on ${invWhen(inv)}, as long as it hasn’t started.</li>` : ''}<li><b>Booking opens${multi ? ' with each coach as they approve' : ''}.</b> You’ll see open times and can book single or weekly lessons.</li></ol>`, { title: 'What happens next' })}`);
}

SCREENS.home = () => {
  if (isPendingFamily()) return acHomePending();
  const mine = myLessons(), today = mine.filter(l => l.iso === TODAY);
  const next = mine.filter(l => !isStarted(l)).slice(0, 4);
  const waits = waitingByCoach();
  return shell(`
    ${pageHead(`Good morning, ${esc(firstName(state.me.name))}`, dLong(TODAY), B('Book a lesson', 'primary', '', { href: href('book'), icon: 'calendar' }))}
    ${acShareBanners()}
    ${bkAskFullCards()}
    ${waits.map(w => banner('warning', `${w.kids.map(k => esc(firstName(k.name))).join(' and ')} ${w.kids.length === 1 ? 'is' : 'are'} waiting for Coach ${esc(w.c.first)}’s approval`, `You can book with Coach ${esc(w.c.first)} once they approve.`)).join('')}
    ${acInviteCard()}
    <div class="split split--today">
      <div class="stack">
        ${card(today.length ? today.map(acLessonRow).join('') : `<div class="pempty"><span class="pempty__icon">${ic('calendar', 22)}</span><b>No lessons today</b><span class="muted">${next[0] ? `Next: ${esc(firstName(nameOf(next[0])))}, ${dDow(next[0].iso)} at ${fmtT(next[0].t)}` : 'Nothing booked yet.'}</span></div>`,
          { title: 'Today', sub: dLong(TODAY), pad: false })}
        ${card(next.length ? next.map(acLessonRow).join('') : `<div class="pempty"><b>Nothing booked</b><span class="muted">${A_('book', 'Book a lesson')}</span></div>`,
          { title: 'Coming up', pad: false, action: A_('bookings', 'All bookings') })}
      </div>
      <div class="stack">
        ${acCoachCards()}
        ${card(`<div class="quick">
          ${[['Book a lesson', 'calendar', href('book')], ['My bookings', 'list', href('bookings')], ['Profile', 'user', href('profile')], ['Payments', 'card', href('payments')]]
            .map(([t, i, h]) => `<a class="quick__item" href="${h}"><span class="quick__icon">${ic(i, 18)}</span><span>${t}</span>${t === 'Payments' ? '<small>Phase 2</small>' : ''}</a>`).join('')}
        </div>`, { title: 'Go to' })}
      </div>
    </div>`, { width: 'wide' });
};

/* ================= Profile ================= */
/* Many coaches (ADR-025 d2, d7). Your coaches lists every coach a skater is with or waiting for. Add a coach: enter that
   coach's code, see who it is, and choose which skaters join; each new link waits for that coach alone. "Coach Sam will see
   that Mia also skates with Coach Dana" is Phase 2 with d4, so it isn't shown. */
/** Code check for adding a coach: the family's own coaches, plus the demo directory. */
function acCoachLookup(code) {
  const raw = String(code || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (raw.length < 8) return { st: 'typing' };
  const c = [coachById(DANA), ...Object.values(state.coaches), ...COACH_DIRECTORY].find(c => c.code.replace(/[^A-Z0-9]/g, '') === raw);
  return c ? { st: 'found', c } : { st: acLooksLikeShare(code) ? 'share' : 'wrong' };
}
const acKidCoaches = k => [DANA, ...Object.keys(state.coaches)].filter(cid => linkOf(k, cid));
/** One badge per coach the skater is with: approved, or waiting for that coach. */
const acCoachBadges = k => acKidCoaches(k).map(cid => linkOf(k, cid) === 'ACTIVE' ? badge(`Coach ${esc(coachById(cid).first)}`, 'success', 'check') : badge(`Waiting for Coach ${esc(coachById(cid).first)}`, 'warning', 'clock')).join('');
function acCoachesCard() {
  const u = acUi(), kids = myKids(), ids = myCoachIds();
  const crow = cid => { const c = coachById(cid), with_ = kids.filter(k => linkOf(k, cid)), ok = with_.some(k => linkOf(k, cid) === 'ACTIVE');
    return row(`${avatar(initials(cName(c)), 'sm')}${rowTitle(`Coach ${esc(cName(c))}`, `${esc(c.sport || 'Figure skating')} · ${with_.map(k => `${esc(firstName(k.name))}${linkOf(k, cid) === 'PENDING' ? ' (waiting)' : ''}`).join(', ')}`)}`,
      ok ? badge('Approved', 'success', 'check') : badge('Waiting for approval', 'warning', 'clock')); };
  let add = `<button type="button" class="addrow" data-act="acCoachStart">${ic('plus', 16)}Add a coach</button>`;
  if (u.coachAdding) {
    const lk = acCoachLookup(u.coachCode), c = lk.c, picked = kids.filter(k => u.coachKids.includes(k.id) && !(c && linkOf(k, c.id)));
    add = `<div class="ac-add">
      ${INP('ac-coach-code', 'Coach code', 'ui.ac.coachCode', { live: true, mono: true, placeholder: 'e.g. K7QM-4X9T', error: lk.st === 'wrong' ? 'That code doesn’t match a coach. Check it with the coach who gave it to you. Codes are 8 letters and numbers.' : lk.st === 'share' ? SHARE_IN_COACH_BOX : '', hint: lk.st === 'typing' ? 'Every coach has their own code. Ask the new coach for theirs.' : '' })}
      ${c ? `<div class="found">${avatar(initials(cName(c)))}<div><div class="found__name">Coach ${esc(cName(c))}</div><div class="found__sub">${RINK_SHORT} · ${esc(c.sport || 'Figure skating')}</div></div>${badge('Code found', 'success', 'check')}</div>
        <div class="fieldset"><div class="label">Who will skate with Coach ${esc(c.first)}?</div>
          <div class="ac-coachkids">${kids.map(k => { const st = linkOf(k, c.id);
            return st ? `<div class="check ac-check--done"><span class="check__text"><span class="check__label">${esc(k.name)}</span><span class="check__sub">${st === 'ACTIVE' ? `Already Coach ${esc(c.first)}’s student` : `Already waiting for Coach ${esc(c.first)}`}</span></span>${badge(st === 'ACTIVE' ? 'Approved' : 'Waiting', st === 'ACTIVE' ? 'success' : 'warning')}</div>`
              : CHK(esc(k.name), u.coachKids.includes(k.id), 'acCoachKid', [k.id], acKidCoaches(k).length ? `Also with ${acKidCoaches(k).map(id => `Coach ${esc(coachById(id).first)}`).join(', ')}` : ''); }).join('')}</div>
          <div class="hint">To add a new skater, add them under Skaters first.</div></div>
        ${banner('info', `Coach ${esc(c.first)} approves each skater`, `You can book with Coach ${esc(c.first)} once they do. We’ll email you. Your other coaches aren’t affected.`)}` : ''}
      <div class="skater__actions">${B('Cancel', 'ghost', 'acCoachCancel', { sm: true })}${B(c ? `Send to Coach ${esc(c.first)}` : 'Send', 'secondary', 'acCoachSend', { sm: true, icon: 'arrowR', disabled: !c || !picked.length })}</div></div>`;
  }
  return card(`${ids.map(crow).join('') || `<div class="row"><span class="muted">No coaches yet.</span></div>`}${add}`,
    { title: 'Your coaches', sub: 'Each coach approves your skaters and sets their own times and prices.', pad: false });
}
SCREENS.profile = () => {
  const u = acUi(), kids = myKids(), self = state.me.rel === 'Self', multi = multiCoach();
  const status = k => multi ? '' : k.status === 'ACTIVE' ? badge('Approved', 'success', 'check') : k.status === 'PENDING' ? badge('Waiting for approval', 'warning', 'clock') : badge('Not Coach ' + esc(coachFirst()) + '’s student yet', 'neutral');
  const skaterRow = k => row(`${avatar(initials(k.name), 'sm')}${rowTitle(esc(k.name), `${k.minor ? 'Under 18' : 'Adult'}${k.orgNum ? ` · ${orgLine({ org: k.org, num: k.orgNum })}` : ''}`)}`,
    status(k))
    + (multi ? `<div class="ac-code ac-kc"><span class="ac-code__label">Coaches</span><span class="ac-kc__list">${acCoachBadges(k) || '<span class="muted">None yet</span>'}</span></div>` : '')
    + (k.shareCode ? `<div class="ac-code"><span class="ac-code__label">Share code</span><span class="mono ac-code__v">${esc(k.shareCode)}</span><span class="ac-code__btns">${B('Copy', 'ghost', 'acCopyCode', { sm: true, icon: 'copy', args: [k.id] })}</span></div>` : '');
  return shell(`
    ${pageHead('Profile', multi ? 'How your coaches and BladeBook reach you.' : 'How Coach ' + esc(coachFirst()) + ' and BladeBook reach you.')}
    ${card(`
      ${INP('ac-pr-name', self ? 'Your name' : `Your name (${state.me.rel.toLowerCase()})`, 'me.name')}
      <div class="grid2">${INP('ac-pr-phone', 'Mobile phone', 'me.phone', { type: 'tel' })}${INP('ac-pr-email', 'Email', 'me.email', { type: 'email', hint: 'You log in with this. Changing it sends a code to the new address.' })}</div>
      ${smsLater()}
      <div class="fieldset"><div class="label">Profile picture ${badge('Phase 2', 'neutral')}</div><div class="photo-pick">${avatar(initials(state.me.name), 'lg')}${B('Choose a picture', 'secondary', '', { sm: true, disabled: true })}<span class="hint">Picking a picture comes in Phase 2.</span></div></div>`,
      { title: 'Your details' })}
    ${card(`${kids.map(skaterRow).join('') || `<div class="row"><span class="muted">No skaters.</span></div>`}
      ${kids.length ? `<div class="card__note">${ic('users', 14)} To share a lesson, give a skater’s share code to the other family. They enter it when they book.</div>` : ''}
      ${self ? `<div class="card__note">${ic('info', 14)} You skate yourself. To book for a child, they need their own family account.</div>`
        : u.adding ? `<div class="ac-add">
          <div class="grid2 grid2--wide">${INP('ac-new-name', 'Skater’s full name', 'ui.ac.newName', { placeholder: 'e.g. Lily Chen' })}<div class="fieldset"><div class="label">Under 18?</div>${SEG(['Yes', 'No'], u.newMinor, 'acNewMinor')}</div></div>
          ${skaterOrgFields('ui.ac', 'newOrg', 'newNum', 'ac-new-num', 'acNewOrg')}
          ${multi ? `<div class="fieldset"><div class="label">Which coaches?</div><div class="ac-coachkids">${myCoachIds().map(id => { const c = coachById(id); return CHK(`Coach ${esc(cName(c))}`, u.newCoaches.includes(id), 'acNewCoach', [id], esc(c.sport || 'Figure skating')); }).join('')}</div><div class="hint">Pick each coach the new skater will take lessons with. You can add more later.</div></div>` : ''}
          ${banner('info', multi ? 'Each coach you pick approves the new skater' : `Coach ${esc(coachFirst())} approves new skaters`, multi ? 'You can book with a coach once they approve. We’ll email you.' : 'You can book for them once they’re approved. We’ll email you.')}
          <div class="skater__actions">${B('Cancel', 'ghost', 'acAddCancel', { sm: true })}${B('Add skater', 'secondary', 'acAddSkater', { sm: true, icon: 'plus', disabled: !u.newName.trim() || !acNumOk(u.newOrg, u.newNum) || (multi && !u.newCoaches.length) })}</div></div>`
        : `<button type="button" class="addrow" data-act="acAddStart">${ic('plus', 16)}Add a skater</button>`}`,
      { title: 'Skaters', sub: multi ? 'Everyone in your family who skates, and the coaches they’re with.' : `Everyone who takes lessons with Coach ${esc(coachFirst())}.`, pad: false })}
    ${acCoachesCard()}
    <div class="actions"><div></div><div class="actions__r">${B('Log out', 'ghost', 'acLogout')}${B('Save', 'primary', 'acSave')}</div></div>`);
};

/* ================= Shared-lesson invitation (ADR-026 d5 steps 3–5) =================
   Opened from the invitation email. It's inside the signed-in shell: opening the link does nothing on its own, and signing
   in proves it's Family B. Shows who invited, the lesson or series, which skater, and clashes with that skater's other
   lessons (ADR-025 d5); Family B goes ahead or declines. A skater who isn't the coach's student yet goes to the coach first,
   exactly like a coach-code sign-up, and joins when the coach accepts. The lesson's price is split between the two skaters
   (owner, 2026-10-13; ADR-026 P2). */
const invUi = () => (state.ui.inv ??= { id: null });
const invCur = () => { const mine = invsToMe(); return mine.find(i => i.id === invUi().id) || mine.find(i => i.status === 'SENT') || mine[0]; };
SCREENS.invite = () => {
  const inv = invCur();
  if (!inv) return shell(card(`<div class="pempty"><span class="pempty__icon">${ic('users', 22)}</span><b>No invitations</b><span class="muted">Nothing to answer right now.</span>${B('Back to home', 'secondary', '', { href: href('home') })}</div>`));
  const ic_ = invCoach(inv), kid = student(inv.skater), kf = esc(firstName(kid.name)), host = esc(shortName(student(inv.fromSkater).name)), coach = esc(ic_.first);
  const ls = invLessons(inv), isStudent = kid.status === 'ACTIVE' || inv.status === 'CONFIRMED', them = inv.series ? 'the lessons' : 'the lesson';
  const details = card(`
    ${kv('Invited by', `${esc(inv.from)}, for ${host}`)}
    ${kv('Lesson', inv.series ? `${DOW_LONG[inv.dow]}s at ${fmtT(inv.t)} · ${inv.len} min` : `${dLong(inv.iso)} at ${fmtT(inv.t)} · ${inv.len} min`)}
    ${inv.series ? kv('Dates', invDates(inv)) : ''}
    ${kv('Coach', `Coach ${esc(cName(ic_))} · ${RINK_SHORT}`)}
    ${kv('Skater', esc(kid.name))}
    ${(() => { const l0 = ls[0], full = l0 ? (l0.full ?? l0.price) : 0; return kv('Price', full ? `${money(full / 2)} for ${kf}${inv.series ? ' per lesson' : ''}: the lesson’s ${money(full)}, split between the two skaters. You pay Coach ${coach} directly.` : `You pay Coach ${coach} directly.`); })()}`, { title: inv.series ? 'The lessons' : 'The lesson' });
  const aside = `<div class="stack">${help('Shared lessons', `Two skaters share one lesson with Coach ${coach}. Each skater’s attendance and payment are kept separately.`)}${inv.series ? help('A repeating lesson', `Going ahead joins ${kf} to every lesson in the series.`) : ''}</div>`;
  const page = (top, body = '') => shell(`${top}${acShareBanners(inv)}<div class="split split--today"><div class="stack">${details}${body}</div>${aside}</div>`, { width: 'wide' });
  const hero = (cls, icon, title, sub) => `<div class="crumb">${crumb('home', 'Home')}</div><div class="hero ${cls}"><span class="hero__icon">${ic(icon, 26)}</span><div><h1 class="h1">${title}</h1><p class="lede">${sub}</p></div></div>`;
  // After answering, the same link shows where the invitation stands.
  if (inv.status === 'AWAITING_COACH') return page(hero('ac-hero--wait', 'clock', `${kf} is waiting for Coach ${coach}`, `Thanks, you’ve said yes. Coach ${coach} needs to accept ${kf}, then ${kf} joins ${them} on ${invWhen(inv)}. We’ll email you either way.`));
  if (inv.status === 'CONFIRMED') return page(hero('hero--success', 'check', `${kf} has joined ${host}’s ${inv.series ? 'lessons' : 'lesson'}`, `${inv.series ? `Every lesson in the series is` : 'It’s'} in ${isPendingFamily() ? 'your account' : A_('bookings', 'My bookings')}. Coach ${coach} sees both skaters.`));
  if (inv.status === 'DECLINED') return page(hero('bk-hero--warn', 'x', 'Invitation declined', `We’ve told ${esc(inv.from)}. Nothing was booked for ${kf}.`));
  if (inv.status === 'WITHDRAWN') return page(hero('bk-hero--warn', 'x', `${esc(inv.from)} withdrew this invitation`, `Nothing was booked for ${kf}.`));
  if (inv.status === 'EXPIRED') return page(hero('bk-hero--warn', 'clock', 'This lesson has expired', isStudent ? `It was no longer available, so ${kf} wasn’t added.` : `Please reach out to Coach ${coach} to be accepted as a student for any future shared lessons.`));
  const clashes = inv.clashes || [];
  return page(pageHead(`${esc(inv.from)} invited ${kf} to share a lesson`, `${host} and ${kf}, together with Coach ${esc(cName(ic_))}${inv.series ? `, ${invWhen(inv)}` : ` on ${invWhen(inv)}`}.`, '', crumb('home', 'Home'))
    + (isStudent ? '' : banner('info', `Coach ${coach} needs to accept ${kf} first`, `By going ahead you agree to ${kf} being added to Coach ${coach}’s roster of students, and ${kf} joins ${them} once Coach ${coach} accepts.`, 'users')), `
    ${card(clashes.length ? `${banner('warning', `${plural(clashes.length, 'clash', 'clashes')} with ${kf}’s other lessons`, `${kf} can’t be in two places at once. You can still go ahead and sort out the other lesson.`)}
      <div class="listbox">${clashes.map(c => row(`<span class="roundicon roundicon--warn">${ic('alert', 16)}</span>${rowTitle(esc(c.when), esc(c.what))}`)).join('')}</div>`
      : row(`<span class="roundicon roundicon--ok">${ic('check', 16)}</span>${rowTitle('No clashes', `Nothing else is booked for ${kf} at ${inv.series ? 'these times' : 'that time'}.`)}`), { title: 'Clashes', sub: `Checked against ${kf}’s other lessons, with any coach.` })}
    <div class="actions"><div>${B('Decline', 'secondary', 'invDecline')}</div><div class="actions__r">${B('Go ahead', 'primary', 'invGo', { lg: true, iconR: 'arrowR' })}</div></div>
    <p class="fine">${isStudent ? `Going ahead adds ${kf} to ${inv.series ? `all ${plural(ls.length, 'lesson')}` : 'the lesson'} now.` : `Nothing is booked for ${kf} until Coach ${coach} accepts.`}</p>`);
};

/* ================= Payments (Phase 2) ================= */
SCREENS.payments = () => {
  const p = state.profile, unpaid = myLessons().filter(l => isPast(l) && l.pay === 'UNPAID');
  const total = unpaid.reduce((s, l) => s + l.price, 0);
  const handles = payShown(p);
  return shell(`
    ${pageHead('Payments', 'Lessons Coach ' + esc(coachFirst()) + ' hasn’t marked paid yet.', badge('Phase 2', 'neutral'), crumb('home', 'Home'))}
    ${banner('info', 'Coming in Phase 2', 'This page isn’t in the first release. BladeBook doesn’t take payments: you pay Coach ' + esc(coachFirst()) + ' directly, and they mark the lesson paid.')}
    <div class="stats">${stat('Not marked paid', money(total), plural(unpaid.length, 'lesson'), 'card')}${stat('Skaters', String(myActiveKids().length), myActiveKids().map(k => esc(firstName(k.name))).join(' & '), 'users')}${stat('Notice period', `${p.notice} hours`, 'Late cancels may be charged', 'clock')}</div>
    ${card(unpaid.length ? `<div class="ac-tablewrap"><table class="table"><thead><tr><th>Skater</th><th>Lesson</th><th>Attendance</th><th class="r">Amount</th></tr></thead><tbody>${unpaid.map(l => `<tr><td><span class="cellname">${avatar(initials(nameOf(l)), 'sm')}${esc(nameOf(l))}</span></td><td>${dDow(l.iso)} · ${fmtT(l.t)}</td><td>${statusBadge(l)}</td><td class="r money">${money(l.price)}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="pempty"><span class="pempty__icon">${ic('check', 22)}</span><b>All paid</b><span class="muted">Nothing is waiting to be marked paid.</span></div>`, { title: 'Not marked paid', pad: false })}
    ${card(`<p class="ac-instr">${esc(p.instructions)}</p>${handles.length ? `<div class="ac-contact">${handles.map(([k, v]) => `<span>${ic('card', 14)}${k}${v ? ' ' + esc(v) : ''}</span>`).join('')}</div>` : ''}`, { title: `How to pay Coach ${esc(coachFirst())}` })}`, { width: 'wide' });
};

/* ================= modals ================= */
/* ================= actions ================= */
Object.assign(ACTIONS, {
  acLogin() { state.auth.notice = ''; state.authed = true; go('home'); },
  acLogout() { state.authed = false; state.auth = { email: state.me.email }; go('login'); },
  acForgotSend() { acUi().fp = 1; state.screen = 'forgot'; },
  acForgotDone() { acUi().fp = 0; state.auth.notice = 'Password changed. Log in with your new password.'; go('login'); },
  acSuNext() {
    const u = suUi();
    if (u.step === 0) { if (acCodeState(u.code, u.coaches) === 'found') ACTIONS.acSuAddCoach(); if (!u.coaches.length) return; }
    u.step = Math.min(4, u.step + 1);
  },
  /** Keep the coach whose code is in the box, and clear it for the next code. */
  acSuAddCoach() { const u = suUi(), c = findCoach(u.code); if (!c || u.coaches.includes(c.id)) return; u.coaches.push(c.id); u.code = ''; u.draftCoaches = null; u.selfCoaches = null; },
  acSuDropCoach(i) { const u = suUi(); u.coaches.splice(i, 1); u.draftCoaches = null; u.selfCoaches = null; },
  acSuDraftCoach(id) { const u = suUi(), on = suSel(u, 'draftCoaches'); u.draftCoaches = on.includes(id) ? on.filter(x => x !== id) : [...on, id]; },
  acSuSelfCoach(id) { const u = suUi(), on = suSel(u, 'selfCoaches'); u.selfCoaches = on.includes(id) ? on.filter(x => x !== id) : [...on, id]; },
  acSuBack() { const u = suUi(); u.step = Math.max(0, u.step - 1); },
  acSuFor(i) { suUi().forWho = i; },
  acSuChangeWho() { const u = suUi(); u.forWho = 1; u.step = 1; },
  acSuSms() { const u = suUi(); u.sms = !u.sms; },
  acSuDraftMinor(i) { suUi().draftMinor = i; },
  acSuDraftOrg(i) { suUi().draftOrg = i; },
  acSuSelfOrg(i) { suUi().selfOrg = i; },
  acSuAddSkater() { const u = suUi(); const n = u.draft.trim(), num = acCleanNum(u.draftNum), cs = suSel(u, 'draftCoaches'); if (!n || !acNumOk(u.draftOrg, num) || !cs.length) return; u.skaters.push({ name: n, minor: u.draftMinor === 0, org: u.draftOrg, num, coaches: cs }); u.draft = ''; u.draftNum = ''; u.draftCoaches = null; },
  acSuDropSkater(i) { suUi().skaters.splice(i, 1); },
  acSuFinish() {
    const u = suUi(), self = u.forWho === 0, name = `${u.first} ${u.last}`.trim();
    const rel = ['Self', 'Guardian'][u.forWho];
    const kids = (self ? [{ name, minor: false, org: u.selfOrg, num: acCleanNum(u.selfNum), coaches: suSel(u, 'selfCoaches') }] : u.skaters).map(k => ({ ...k, coaches: (k.coaches || suCids(u)).filter(id => suCids(u).includes(id)) }));
    if (!kids.length || kids.some(k => !acNumOk(k.org, k.num) || !k.coaches.length)) return;
    // The new family exists only in this demo session: each skater is PENDING with each coach they chose (ADR-025 d2).
    state.students = state.students.filter(s => s.client !== name);
    for (const id of suCids(u)) if (id !== DANA && !state.coaches[id]) state.coaches[id] = { ...coachById(id) };
    kids.forEach((k, i) => state.students.push({ id: `n${Date.now() % 100000}${i}`, name: k.name, minor: k.minor, org: k.org, orgNum: k.num, rel, client: name, email: u.email, phone: u.phone, sms: u.sms,
      status: k.coaches.includes(DANA) ? 'PENDING' : 'NONE', links: Object.fromEntries(k.coaches.filter(id => id !== DANA).map(id => [id, 'PENDING'])), since: TODAY, shareCode: acShareCode(k.name, i) }));
    state.me = { name, rel, email: u.email, phone: u.phone, sms: u.sms };
    u.done = kids.map(k => ({ name: k.name, coaches: k.coaches })); u.step = 4;
  },
  acSuToHome() { state.authed = true; state.ui.su = null; go('home'); },
  acSms() { state.me.sms = !state.me.sms; },
  acSave() { for (const s of myKids()) Object.assign(s, { client: state.me.name, email: state.me.email, phone: state.me.phone, sms: state.me.sms }); state.flash = 'Saved.'; },
  acAddStart() { acUi().adding = true; },
  acAddCancel() { const u = acUi(); u.adding = false; u.newName = ''; u.newNum = ''; },
  acNewMinor(i) { acUi().newMinor = i; },
  acNewOrg(i) { acUi().newOrg = i; },
  acNewCoach(id) { const u = acUi(); u.newCoaches = u.newCoaches.includes(id) ? u.newCoaches.filter(x => x !== id) : [...u.newCoaches, id]; },
  /** A new skater waits for each coach the family picked (one coach: that coach). */
  acAddSkater() {
    const u = acUi(), n = u.newName.trim(), num = acCleanNum(u.newNum), cs = multiCoach() ? u.newCoaches : myCoachIds().slice(0, 1);
    if (!n || !acNumOk(u.newOrg, num) || !cs.length) return;
    state.students.push({ id: `n${Date.now() % 100000}`, name: n, minor: u.newMinor === 0, org: u.newOrg, orgNum: num, rel: state.me.rel, client: state.me.name, email: state.me.email, phone: state.me.phone, sms: state.me.sms,
      status: cs.includes(DANA) ? 'PENDING' : 'NONE', links: Object.fromEntries(cs.filter(id => id !== DANA).map(id => [id, 'PENDING'])), since: TODAY, shareCode: acShareCode(n, TODAY) });
    u.adding = false; u.newName = ''; u.newNum = ''; u.newCoaches = [];
    state.flash = `${n} added. ${coachOr(cs, 'and')} will approve them before you can book with ${cs.length > 1 ? 'them' : 'that coach'}.`;
  },
  acCoachStart() { Object.assign(acUi(), { coachAdding: true, coachCode: '', coachKids: [] }); },
  acCoachCancel() { Object.assign(acUi(), { coachAdding: false, coachCode: '', coachKids: [] }); },
  acCoachKid(id) { const u = acUi(); u.coachKids = u.coachKids.includes(id) ? u.coachKids.filter(x => x !== id) : [...u.coachKids, id]; },
  /** Each chosen skater gets a PENDING link with the new coach, approved by that coach alone (ADR-025 d2). */
  acCoachSend() {
    const u = acUi(), lk = acCoachLookup(u.coachCode); if (lk.st !== 'found') return;
    const c = lk.c, kids = myKids().filter(k => u.coachKids.includes(k.id) && !linkOf(k, c.id)); if (!kids.length) return;
    if (c.id !== DANA && !state.coaches[c.id]) state.coaches[c.id] = { ...c };
    for (const k of kids) { if (c.id === DANA) Object.assign(k, { status: 'PENDING', since: TODAY }); else (k.links ??= {})[c.id] = 'PENDING'; }
    Object.assign(u, { coachAdding: false, coachCode: '', coachKids: [] });
    state.flash = `Sent to Coach ${cName(c)}. ${kids.map(k => firstName(k.name)).join(' and ')} can book with Coach ${c.first} once they approve. We’ll email you.`;
  },
  acCopyCode(id) { const c = student(id).shareCode; try { navigator.clipboard.writeText(c); } catch (e) { /* static build: no clipboard */ } state.flash = `Copied ${c}.`; },
  invOpen(id) { invUi().id = id; go('invite'); },
  /** Go ahead: a skater who is the coach's student joins now; one who isn't becomes PENDING with pendingJoins (ADR-026 d5). */
  invGo() {
    const inv = invCur(), kid = student(inv.skater), ls = invLessons(inv);
    if (kid.status === 'ACTIVE') { for (const l of ls) { l.with = [...(l.with || []), { sid: kid.id, status: 'BOOKED', pay: 'UNPAID', paidBy: null, price: null }]; splitPrice(l); } inv.status = 'CONFIRMED'; }
    else { Object.assign(kid, { status: 'PENDING', since: TODAY, invitedBy: inv.from, pendingJoins: ls.map(l => ({ iso: l.iso, t: l.t, invite: inv.id })) }); inv.status = 'AWAITING_COACH'; inv.confirmed = TODAY;
      // A late confirmation whose warning falls due before tonight's sweep gets the warning straight away (ADR-026 d5a).
      if (inv.iso && bkMinutesUntil(inv.iso, inv.t) - (24 + NOTICE_H) * 60 <= 21 * 60 - NOW_MIN) inv.warnedAt = TODAY; }
    state._scrollTop = true;
  },
  invDecline() { invCur().status = 'DECLINED'; state._scrollTop = true; },
});

/* ================= presets ================= */
const acSu = (st, o) => { st.screen = 'signup'; st.ui.su = { step: 0, code: '', coaches: [], forWho: 1, first: 'Sarah', last: 'Park', phone: '(205) 555-0196', email: 'sarah.park@example.com', pw: 'Skate2026!', pw2: 'Skate2026!', sms: true, skaters: [], draft: '', draftMinor: 0, draftOrg: 0, draftNum: '', selfOrg: 0, selfNum: '', ...o }; };
const acAsSarah = st => Object.assign(st, freshState('sarah'));
const acAsTom = st => Object.assign(st, freshState('tom'));
/** Before Tom answers: i2 just sent, and Zoe isn't on Coach Dana's roster at all yet (not a student, not pending). */
const acTomBefore = st => { acAsTom(st); const i = st.invites.find(x => x.id === 'i2'), z = st.students.find(x => x.id === 'p4');
  Object.assign(i, { status: 'SENT', sent: TODAY }); delete i.confirmed; delete i.warnedAt; z.status = 'NOT_STUDENT'; delete z.pendingJoins; delete z.invitedBy; };
PRESETS.push(
  { id: 'ClientLogin', file: 'login', group: 'Sign in', title: 'Log in', note: 'New. Cognito sign-in for families, with a way in for families who only have a coach code.', setup: st => { st.authed = false; st.screen = 'login'; } },
  { id: 'ClientForgot', file: 'forgot-password', group: 'Sign in', title: 'Forgot password — email a code', note: 'New. Cognito sends a code to the email the family logs in with.', setup: st => { st.screen = 'forgot'; } },
  { id: 'ClientForgotCode', file: 'forgot-password-code', group: 'Sign in', title: 'Forgot password — code and new password', note: 'New. The code plus the new password rules.', setup: st => { st.screen = 'forgot'; st.ui.ac = { fp: 1, newName: '', newMinor: 0, newOrg: 0, newNum: '', adding: false, newCoaches: [], coachAdding: false, coachCode: '', coachKids: [] }; } },
  { id: 'ClientCodeEmpty', file: 'signup-1-code-empty', group: 'Sign up', title: '1 · Coach code — empty', note: 'Redesigned from ClientCodeEmpty. Continue stays disabled until a code is found.', setup: st => acSu(st, {}) },
  { id: 'ClientCode', file: 'signup-1-code-found', group: 'Sign up', title: '1 · Coach code — found', note: 'Redesigned from ClientCode. The lookup returns only the coach’s name; MVP shows their initials, and the photo is Phase 2 (ADR-016 d5, ADR-022 d7).', setup: st => acSu(st, { code: '7K2Q-M9XT' }) },
  { id: 'ClientCodeWrong', file: 'signup-1-code-wrong', group: 'Sign up', title: '1 · Coach code — no match', note: 'New state. A full-length code that matches no coach; the error says what to do.', setup: st => acSu(st, { code: '7K2Q-M9XR' }) },
  { id: 'ClientCodeShare', file: 'signup-1-share-code', group: 'Sign up', title: '1 · Coach code — a share code typed instead', note: 'New (owner, 2026-10-13). Sarah typed Ava’s friend’s share code, MIA-4K7QX, into the coach-code box. A share code is three letters, a dash and five characters; a coach code is two groups of four with no name in it, so the box can say what went wrong without looking anything up. Typed without its dash, it gets the ordinary no-match message.', setup: st => acSu(st, { code: 'MIA-4K7QX' }) },
  { id: 'ClientCodeTwo', file: 'signup-1-two-coaches', group: 'Sign up', title: '1 · Coach code — a second coach', note: 'New (ADR-025 d2, designed 2026-10-13). Sarah added Coach Dana, pressed Add another coach and typed Coach Ben’s code. Each coach is shown so she can check it’s the right one; Continue counts the coaches.', setup: st => acSu(st, { coaches: [DANA], code: '4R8T-WH6C' }) },
  { id: 'ClientCodeTwoWrong', file: 'signup-1-second-code-wrong', group: 'Sign up', title: '1 · Coach code — second code doesn’t match', note: 'New. Sarah added Coach Dana, pressed Add another coach and mistyped Coach Ben’s code (4R8T-WH6G). Dana stays on the list; the error is on the second box only. Continue is off until the code is fixed or the box cleared, so a mistyped coach is never dropped without her noticing.', setup: st => acSu(st, { coaches: [DANA], code: '4R8T-WH6G' }) },
  { id: 'ClientCodeDup', file: 'signup-1-code-already-added', group: 'Sign up', title: '1 · Coach code — coach already added', note: 'New. Coach Dana and Coach Ben are on the list and Sarah typed Dana’s code again. The box says Dana is already on the list; Continue waits until the box is cleared.', setup: st => acSu(st, { coaches: [DANA, 'ben'], code: '7K2Q-M9XT' }) },
  { id: 'ClientDetails', file: 'signup-2-details', group: 'Sign up', title: '2 · Your details', note: 'Redesigned from ClientDetails. Who the lessons are for, the account fields, password confirm with pasting off, and the SMS opt-in terms (ADR-007).', setup: st => acSu(st, { step: 1, code: '7K2Q-M9XT' }) },
  { id: 'ClientVerify', file: 'signup-3-verify', group: 'Sign up', title: '3 · Verify email', note: 'Redesigned from ClientVerify.', setup: st => acSu(st, { step: 2, code: '7K2Q-M9XT' }) },
  { id: 'ClientSkaters', file: 'signup-4-skaters', group: 'Sign up', title: '4 · Add skaters', note: 'Redesigned from ClientSkaters. A guardian adds one or more children in one sign-up (ADR-002). Each skater needs their U.S. Figure Skating, USA Hockey or Learn to Skate USA number for this season; only its shape is checked (USA Hockey: 14 characters, 9 digits and 5 letters), so the coach checks it if they care.', setup: st => acSu(st, { step: 3, code: '7K2Q-M9XT', skaters: [{ name: 'Ava Park', minor: true, org: 0, num: '3318246' }], draft: 'Jack Park', draftOrg: 1, draftNum: '2027HN7342PW6R' }) },
  { id: 'ClientSkatersNumError', file: 'signup-4-skaters-number-error', group: 'Sign up', title: '4 · Add skaters — number format', note: 'New state. The number is cleaned (spaces out, uppercase) and its shape checked before it’s saved: a USA Hockey number is 14 characters, 9 digits and 5 letters. This one has 10 digits, so Add skater stays disabled. U.S. Figure Skating’s and Learn to Skate USA’s formats aren’t known yet, so they only allow letters and digits (Open-Pending §2b).', setup: st => acSu(st, { step: 3, code: '7K2Q-M9XT', skaters: [{ name: 'Ava Park', minor: true, org: 0, num: '3318246' }], draft: 'Jack Park', draftOrg: 1, draftNum: '20274q4815mx3t' }) },
  { id: 'ClientSkatersSelf', file: 'signup-4-skater-myself', group: 'Sign up', title: '4 · Skater — myself', note: 'Redesigned from ClientSkatersSelf. An adult signing up for themselves is the skater, and enters their own U.S. Figure Skating, USA Hockey or Learn to Skate USA number.', setup: st => acSu(st, { step: 3, code: '7K2Q-M9XT', forWho: 0, first: 'Olivia', last: 'Grant', email: 'olivia.grant@example.com', selfNum: '2904417' }) },
  { id: 'ClientSkatersTwoCoaches', file: 'signup-4-skaters-two-coaches', group: 'Sign up', title: '4 · Add skaters — which coaches', note: 'New. With two coaches, each skater picks which coaches they join; every coach is ticked to start. Ava joins both; Jack is being added for Coach Ben only. Each skater waits for each coach separately.', setup: st => acSu(st, { step: 3, coaches: [DANA, 'ben'], skaters: [{ name: 'Ava Park', minor: true, org: 0, num: '3318246', coaches: [DANA, 'ben'] }], draft: 'Jack Park', draftOrg: 1, draftNum: '2027HN7342PW6R', draftCoaches: ['ben'] }) },
  { id: 'ClientDone', file: 'signup-5-waiting', group: 'Sign up', title: '5 · Waiting for approval', note: 'Redesigned from ClientDone. Each skater waits for the coach; booking opens once approved.', setup: st => acSu(st, { step: 4, code: '7K2Q-M9XT', done: ['Ava Park', 'Jack Park'] }) },
  { id: 'ClientDoneTwo', file: 'signup-5-waiting-two-coaches', group: 'Sign up', title: '5 · Waiting — two coaches', note: 'New. Each skater lists each coach they’re waiting for. Booking with a coach opens once that coach approves.', setup: st => acSu(st, { step: 4, coaches: [DANA, 'ben'], done: [{ name: 'Ava Park', coaches: [DANA, 'ben'] }, { name: 'Jack Park', coaches: ['ben'] }] }) },
  { id: 'ClientHome', file: 'home', group: 'Home', title: 'Home', note: 'New (ClientHomeView). Today’s lessons, what’s coming up, one card per coach (owner, 2026-10-13) with only the contact details each coach switched on — Coach Lauren hasn’t approved Noah, so hers shows none and a banner says Noah is waiting for her — and a button to every page. Shared lessons (ADR-026): the red banner because Coach Dana hasn’t accepted Zoe for Mia’s Friday lesson inside the warning time (d5a), and Owen Brooks’s invitation for Noah to answer.', setup: st => { st.screen = 'home'; } },
  { id: 'ClientHomePending', file: 'home-pending', group: 'Home', title: 'Home — waiting for approval', note: 'New. A family with no approved skater sees only their own account: no schedule, open times or coach contact details (ADR-022 d6).', setup: st => { acAsSarah(st); st.screen = 'home'; } },
  { id: 'ClientHomePendingTwo', file: 'home-pending-two-coaches', group: 'Home', title: 'Home — waiting for two coaches', note: 'New (owner, 2026-10-13). Sarah signed up with Coach Dana and Coach Ben; neither has approved yet, so she still sees only Home and Profile. Each waiting coach is named with the skaters they’re approving, and each coach’s card has no contact details until they approve.', setup: st => { acAsSarah(st); st.students.find(x => x.id === 'p1').links = { ben: 'PENDING' }; st.screen = 'home'; } },
  { id: 'ClientHomeTom', file: 'home-invited', group: 'Home', title: 'Home — Tom, invited family waiting for coach', note: 'New (ADR-026 d5a). Tom accepted Grace’s invitation, so Zoe waits for Coach Dana like any sign-up and Tom sees only Home and Profile. The red banner says Zoe won’t join the Friday lesson unless Coach Dana accepts her first.', setup: st => { acAsTom(st); st.screen = 'home'; } },
  { id: 'ClientProfile', file: 'profile', group: 'Profile', title: 'Profile', note: 'New (ClientProfileView). Contact details, SMS opt-in, skaters and adding one (no Remove: owner, 2026-10-13); adding Lily asks which coaches she joins (ticked: Coach Dana and Coach Ben; owner, 2026-10-13); a new skater needs their U.S. Figure Skating, USA Hockey or Learn to Skate USA number (shape checked) and waits for approval. Each skater shows their share code with Copy; a skater’s code never changes (owner, 2026-10-13).', setup: st => { st.screen = 'profile'; st.ui.ac = { fp: 0, newName: 'Lily Chen', newMinor: 0, newOrg: 0, newNum: '3407715', adding: true, newCoaches: [DANA, 'ben'], coachAdding: false, coachCode: '', coachKids: [] }; } },
  { id: 'ClientProfileAddCoach', file: 'profile-add-coach', group: 'Profile', title: 'Profile — add a coach', note: 'New (ADR-025 d2). Grace’s skaters already have three coaches between them: each skater lists theirs (approved, or waiting for that coach). Your coaches lists each coach with which skaters are theirs. Add a coach: 6P2D-NB4Y finds Coach Marcus Lee, and Grace ticks Mia. Noah stays unticked.', setup: st => { st.screen = 'profile'; Object.assign(acUi(), { coachAdding: true, coachCode: '6P2D-NB4Y', coachKids: ['s1'] }); } },
  { id: 'ClientProfileCoachWrongOne', file: 'profile-add-coach-wrong-one-coach', group: 'Profile', title: 'Profile — add a coach, code doesn’t match (one coach)', note: 'New. Grace before her other coaches: Mia and Noah skate only with Coach Dana. She typed a second coach’s code wrong (6P2D-NB4K). The error says to check it with the coach who gave it; Send stays off and nothing else on the profile changes.', setup: st => { st.students.forEach(k => { delete k.links; }); st.coaches = {}; st.screen = 'profile'; Object.assign(acUi(), { coachAdding: true, coachCode: '6P2D-NB4K', coachKids: [] }); } },
  { id: 'ClientProfileCoachWrong', file: 'profile-add-coach-wrong', group: 'Profile', title: 'Profile — add a coach, code doesn’t match (several coaches)', note: 'New. Grace already has three coaches between them and mistyped Coach Marcus’s code (6P2D-NB4K). Her coaches and skaters are unchanged; there’s no skater list to tick until a code is found, and Send stays off.', setup: st => { st.screen = 'profile'; Object.assign(acUi(), { coachAdding: true, coachCode: '6P2D-NB4K', coachKids: [] }); } },
  { id: 'ClientProfileCoachSent', file: 'profile-coach-sent', group: 'Profile', title: 'Profile — coach added, waiting', note: 'New. After Send to Coach Marcus: Mia waits for Coach Marcus alone. She stays approved with Coach Dana and Coach Ben, and Grace can keep booking with them.', setup: st => { st.screen = 'profile'; Object.assign(acUi(), { coachAdding: true, coachCode: '6P2D-NB4Y', coachKids: ['s1'] }); ACTIONS.acCoachSend(); } },
  { id: 'ClientProfilePending', file: 'profile-pending', group: 'Profile', title: 'Profile — waiting for approval', note: 'New. The same profile for a family still waiting; this is most of what they can see.', setup: st => { acAsSarah(st); st.screen = 'profile'; } },
  { id: 'ClientPayments', file: 'payments', group: 'Phase 2', title: 'Payments', note: 'New, Phase 2. Lessons the coach hasn’t marked paid, with the coach’s payment instructions; BladeBook doesn’t take payments.', setup: st => { st.screen = 'payments'; } },
);
