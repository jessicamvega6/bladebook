/* Coach two-step sign-in: multi-factor authentication (MFA) with an authenticator app (Batch 28; I32, owner 2026-11-20).
   Turning it on and off in Profile → Account, and the code at log-in. The code before a schedule save is in
   schedule.html (reauthBox), and the rinkside page's log-in code is in ../rinkside/screens-rink.js.

   Words: the screens say "two-step sign-in", not "MFA", because coaches are the older users (fewest barriers wins).
   Cognito's only app-based second factor is a time-based one-time password (TOTP): AssociateSoftwareToken gives the
   secret, VerifySoftwareToken checks the first code, SetUserMFAPreference turns it on or off. Cognito has no backup
   codes, so a coach who loses the phone needs BladeBook support to turn it off (an open question for the owner). */

const MFA_KEY = 'JBSW Y3DP EHPK 3PXP K4QW 6ZDL R2NB';
/** A drawn stand-in for the QR code (the real one encodes otpauth://totp/BladeBook:<login email>?secret=…). */
function mfaQr() {
  const n = 25, cell = 6, finder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  let rects = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let on;
    if (finder(x, y)) { const fx = x < 7 ? x : x - (n - 7), fy = y < 7 ? y : y - (n - 7); on = fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4); }
    else on = (hash('qr' + x * 31 + y * 17) % 100) < 46;
    if (on) rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}"/>`;
  }
  return `<svg class="mfa-qr" viewBox="-12 -12 ${n * cell + 24} ${n * cell + 24}" role="img" aria-label="QR code to add BladeBook to your authenticator app"><rect x="-12" y="-12" width="${n * cell + 24}" height="${n * cell + 24}" fill="#fff"/><g fill="#1E292D">${rects}</g></svg>`;
}
const mfaUi = () => (state.ui.mfa ??= { step: 0, wrong: false, since: 'Oct 14' });

/* ================= Log in: the code after the password ================= */
SCREENS['login-code'] = () => {
  const u = mfaUi();
  return authShell(card(`
  <h1 class="h1">Enter your sign-in code</h1>
  <p class="lede">Open your authenticator app and type the 6-digit code it shows for <b>BladeBook</b>.</p>
  ${u.wrong ? banner('danger', 'That code didn’t work. Type the code the app shows now. Each one only lasts 30 seconds.') : ''}
  <div class="label">Code</div>${codeBoxes(u.wrong ? ['', '', '', '', '', ''] : ['4', '8', '2', '', '', ''])}
  ${B('Log in', 'primary', 'mfaLogin', { block: true, lg: true })}
  <p class="fine center">${A_('login', 'Back to log in')}</p>`),
  help('Lost your phone?', 'Without the app you can’t log in. Contact BladeBook support: once they’ve checked it’s you, they turn two-step sign-in off so you can log in with your password and set it up again.'),
  { right: `Not you? <a class="link" href="${href('login')}">Log in as someone else</a>` });
};
Object.assign(ACTIONS, {
  mfaLogin() { mfaUi().wrong = false; state.authed = true; go('today'); },
});

/* ================= Profile → Account: the row, turning it on, turning it off ================= */
/** The Signing in card's row (drawn into SCREENS['profile-account']). */
function mfaRow() {
  const on = !!state.profile.mfa;
  return row(`<span class="roundicon">${ic('phone', 16)}</span>${rowTitle(`Two-step sign-in ${on ? badge('On', 'success', 'check') : badge('Off', 'neutral')}`,
    on ? `On since ${mfaUi().since}. When you log in, you type your password and then a code from your authenticator app.`
      : 'Ask for a code from an app on your phone as well as your password, so nobody can log in with your password alone.')}`,
    on ? B('Turn off', 'secondary', 'mfaOffAsk', { sm: true }) : B('Turn on', 'secondary', 'mfaStart', { sm: true }), { cls: 'row--boxed' });
}
const MFA_STEPS = ['Check it’s you', 'Add to the app', 'Type a code'];
const mfaSteps = i => `<ol class="mfa-steps">${MFA_STEPS.map((t, k) => `<li class="${k < i ? 'is-done' : k === i ? 'is-now' : ''}"><span>${k < i ? ic('check', 12) : k + 1}</span>${t}</li>`).join('')}</ol>`;
MODALS.mfaSetup = () => {
  const u = mfaUi();
  if (u.step === 0) return `
  ${mfaSteps(0)}
  <h2 class="h2">Turn on two-step sign-in</h2>
  <p class="fine">Each time you log in, you’ll type your password and then a 6-digit code from an app on your phone. The rinkside page asks for it too, and so does saving your schedule when you’ve been signed in a while.</p>
  <div class="mfa-need">${ic('phone', 18)}<div><b>You need an authenticator app</b><span>Google Authenticator or Microsoft Authenticator are free from your phone’s app store. Install one first.</span></div></div>
  ${INP('mfa-pw', 'Your password', 'ui.mfa.pw', { type: 'password', hint: `For ${esc(state.profile.loginEmail)}` })}
  <div class="dialog__actions">${B('Cancel', 'secondary', 'closeModal')}${B('Continue', 'primary', 'mfaNext', { iconR: 'arrowR' })}</div>`;
  if (u.step === 1) return `
  ${mfaSteps(1)}
  <h2 class="h2">Add BladeBook to the app</h2>
  <div class="mfa-scan">${mfaQr()}<div class="mfa-scan__how">
    <ol class="mfa-how"><li>Open the authenticator app.</li><li>Tap <b>+</b> or <b>Add account</b>.</li><li>Choose <b>Scan a QR code</b> and point your phone at this code.</li></ol>
    <div class="mfa-phone"><span class="muted-sm">On your phone now?</span>${B('Open in my authenticator app', 'secondary', '', { sm: true, href: '#profile-account' })}</div></div></div>
  <details class="mfa-key"${u.showKey ? ' open' : ''}><summary>Can’t scan it? Type a key instead</summary>
    <div class="mfa-key__row"><code class="mono">${MFA_KEY}</code>${B('Copy', 'ghost', 'mfaCopy', { sm: true, icon: 'copy' })}</div>
    <p class="fine">In the app, choose <b>Enter a setup key</b> and name it BladeBook. The key works like a password, so don’t share it.</p></details>
  <div class="dialog__actions">${B('Back', 'secondary', 'mfaBack')}${B('I’ve added it', 'primary', 'mfaNext', { iconR: 'arrowR' })}</div>`;
  return `
  ${mfaSteps(2)}
  <h2 class="h2">Type the code the app shows</h2>
  <p class="fine">The app now lists <b>BladeBook</b> with a 6-digit code. Type it here to finish. The code changes every 30 seconds; any code it shows now works.</p>
  ${u.wrong ? banner('danger', 'That code didn’t match. Check you added BladeBook from this page, then type the newest code.') : ''}
  ${codeBoxes(u.wrong ? ['', '', '', '', '', ''] : ['3', '0', '7', '1', '', ''])}
  <div class="dialog__actions">${B('Back', 'secondary', 'mfaBack')}${B('Turn on', 'primary', 'mfaOn')}</div>`;
};
MODALS.mfaOff = () => `
  <div class="dialog__icon dialog__icon--danger">${ic('lock', 22)}</div>
  <h2 class="h2">Turn off two-step sign-in?</h2>
  <p class="fine">You’ll log in with your password only. To confirm, type a code from your authenticator app.</p>
  ${codeBoxes(['', '', '', '', '', ''])}
  <p class="fine">Afterwards you can remove BladeBook from the app. Turning it on again gives you a new code to add.</p>
  <div class="dialog__actions">${B('Keep it on', 'secondary', 'closeModal')}${B('Turn off', 'danger', 'mfaOffDo')}</div>`;
Object.assign(ACTIONS, {
  mfaStart() { Object.assign(mfaUi(), { step: 0, wrong: false, pw: '', showKey: false }); state.modal = { kind: 'mfaSetup' }; },
  mfaNext() { const u = mfaUi(); u.step = Math.min(2, u.step + 1); u.wrong = false; },
  mfaBack() { const u = mfaUi(); u.step = Math.max(0, u.step - 1); u.wrong = false; },
  mfaCopy() { mfaUi().showKey = true; },
  mfaOn() { state.profile.mfa = true; mfaUi().since = 'Oct 14'; state.modal = null; state.flash = 'Two-step sign-in is on. Next time you log in, you’ll be asked for a code from the app.'; },
  mfaOffAsk() { state.modal = { kind: 'mfaOff' }; },
  mfaOffDo() { state.profile.mfa = false; state.modal = null; state.flash = 'Two-step sign-in is off. You’ll log in with your password only.'; },
});

/* ================= presets ================= */
PRESETS.push(
  { id: 'CoachLoginCode', file: 'login-code', group: 'Sign in', title: 'Log in — two-step sign-in code', note: 'New (Batch 28, I32). After the password, a coach with two-step sign-in on types the 6-digit code from the authenticator app (Cognito’s TOTP challenge). Lost phone: BladeBook support turns it off after checking it’s the coach.', setup: st => { st.authed = false; st.profile.mfa = true; st.screen = 'login-code'; } },
  { id: 'CoachLoginCodeWrong', file: 'login-code-wrong', group: 'Sign in', title: 'Log in — wrong code', note: 'New (Batch 28). A wrong or out-of-date code: the boxes clear and the coach types the newest one.', setup: st => { st.authed = false; st.profile.mfa = true; st.screen = 'login-code'; st.ui.mfa = { step: 0, wrong: true, since: 'Oct 14' }; } },
  { id: 'CoachProfileAccountMfaOn', file: 'profile-account-mfa-on', group: 'Profile', title: 'Profile — account, two-step sign-in on', note: 'New (Batch 28). The Signing in card with two-step sign-in on, and Turn off.', setup: st => { st.screen = 'profile-account'; st.profile.mfa = true; } },
  { id: 'CoachMfaSetup1', file: 'mfa-setup-1-password', group: 'Profile', title: 'Turn on two-step sign-in — 1 · check it’s you', note: 'New (Batch 28). What it means, the app needed, and the password, so nobody using an open session can turn it on and lock the coach out.', setup: st => { st.screen = 'profile-account'; ACTIONS.mfaStart(); } },
  { id: 'CoachMfaSetup2', file: 'mfa-setup-2-scan', group: 'Profile', title: 'Turn on two-step sign-in — 2 · add to the app', note: 'New (Batch 28). The QR code (drawn here as a stand-in) from Cognito’s AssociateSoftwareToken, how to scan it, a link for a coach already on the phone, and the setup key to type instead.', setup: st => { st.screen = 'profile-account'; ACTIONS.mfaStart(); st.ui.mfa.step = 1; st.ui.mfa.showKey = true; } },
  { id: 'CoachMfaSetup3', file: 'mfa-setup-3-code', group: 'Profile', title: 'Turn on two-step sign-in — 3 · type a code', note: 'New (Batch 28). The first code proves the app was set up (VerifySoftwareToken); only then is it turned on (SetUserMFAPreference).', setup: st => { st.screen = 'profile-account'; ACTIONS.mfaStart(); st.ui.mfa.step = 2; } },
  { id: 'CoachMfaSetupWrong', file: 'mfa-setup-3-wrong', group: 'Profile', title: 'Turn on two-step sign-in — wrong code', note: 'New (Batch 28). The code didn’t match, so it stays off.', setup: st => { st.screen = 'profile-account'; ACTIONS.mfaStart(); st.ui.mfa.step = 2; st.ui.mfa.wrong = true; } },
  { id: 'CoachMfaOn', file: 'mfa-on', group: 'Profile', title: 'Two-step sign-in turned on', note: 'New (Batch 28). Back on Account, with the confirmation.', setup: st => { st.screen = 'profile-account'; ACTIONS.mfaOn(); } },
  { id: 'CoachMfaOff', file: 'mfa-off', group: 'Profile', title: 'Turn off two-step sign-in', note: 'New (Batch 28). Always confirms, with a current code.', setup: st => { st.screen = 'profile-account'; st.profile.mfa = true; ACTIONS.mfaOffAsk(); } },
);
