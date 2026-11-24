/**
 * The coach website's signed-out pages, BladeBook's own forms talking to Cognito from the browser (ADR-023 d11; designs
 * login, forgot-password, forgot-password-code, signup-1-account and signup-2-verify; FeatureDecriptions/C_Coach Log In.md,
 * C_Coach Forgot Password.md, Coach Sign Up). Passwords and codes go to Cognito only, never to api-coach.
 *
 * Sign-up steps 1–2 are Cognito's: creating the account and verifying the login email with a 6-digit code. The names
 * from step 1 wait in this tab until step 3 sends them with the profile (ADR-016 d9).
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { AuthFailure, coachAuth } from '../../shared/auth';
import { CodeInput, passwordOk, PasswordRules } from '../../shared/components/auth';
import { Banner, Button, Card, Field, Help, Icon } from '../../shared/components/harbor';
import { WizardShell } from '../components/Shells';

export interface SignupNames { firstName: string; lastName: string }

const NAMES_KEY = 'bb.coach.signupNames';
const EMAIL_KEY = 'bb.coach.signupEmail';

function kept(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function keep(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    /* typed again if lost */
  }
}

/** Step 1's names, for step 3 (SignupBusiness). */
export function savedNames(): SignupNames {
  try {
    const raw = kept(NAMES_KEY);
    if (raw) return JSON.parse(raw) as SignupNames;
  } catch {
    /* nothing kept */
  }
  return { firstName: '', lastName: '' };
}

const message = (e: unknown) => (e instanceof AuthFailure || e instanceof Error ? e.message : 'Something went wrong. Try again.');
const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());

const RINK_HELP = (
  <Help title="Checking in at the rink?">
    Use the BladeBook rinkside page on your phone. It signs in with the same email and password, and shows today’s lessons, attendance and cancelling.
  </Help>
);
const SIGNUP_LINK = <>New to BladeBook? <a className="link" href="#/signup">Create a coach account</a></>;
const LOGIN_LINK = <>Remembered it? <a className="link" href="#/login">Log in</a></>;
const HAVE_ACCOUNT = <>Already have an account? <a className="link" href="#/login">Log in</a></>;

/** Log in (design: login). After five wrong passwords Cognito makes the coach wait a few minutes. */
export function Login({ notice, noticeTone = 'info', onSignedIn, onVerify }: {
  /** Shown above the fields: green after a password change or a verified email, otherwise information (design: login). */
  notice?: string; noticeTone?: 'success' | 'info'; onSignedIn: () => void; onVerify: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !pw) { setError('Enter your login email and password.'); return; }
    setBusy(true);
    setError('');
    try {
      const next = await coachAuth().signIn(email, pw);
      if (next === 'confirm-email') {
        keep(EMAIL_KEY, email.trim());
        await coachAuth().resendSignUpCode(email).catch(() => undefined);
        onVerify(email.trim());
      } else {
        onSignedIn();
      }
    } catch (err) {
      setError(message(err));
      setPw('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <WizardShell ctx="For coaches" right={SIGNUP_LINK} aside={RINK_HELP}>
      <Card>
        <form onSubmit={submit} noValidate>
          <h1 className="h1">Log in</h1><p className="lede">Welcome back. Log in with your login email.</p>
          {notice && <Banner tone={noticeTone}>{notice}</Banner>}
          {error && <Banner tone="danger">{error}</Banner>}
          <Field label="Login email" type="email" value={email} onChange={setEmail} autoComplete="username" />
          <Field label="Password" type="password" value={pw} onChange={setPw} autoComplete="current-password" placeholder="••••••••" />
          <div className="fine"><a className="link" href="#/forgot">Forgot your password?</a></div>
          <Button type="submit" block lg disabled={busy}>Log in</Button>
          <p className="fine center">Sign-in is handled by Amazon Cognito. After five wrong passwords, wait a few minutes before trying again.</p>
        </form>
      </Card>
    </WizardShell>
  );
}

/** Forgot password (designs: forgot-password, forgot-password-code). The code goes to the login email. */
export function Forgot({ onDone }: { onDone: (notice: string) => void }) {
  const [step, setStep] = useState<0 | 1>(0);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (again: boolean) => {
    if (!emailOk(email)) { setError('Enter your login email.'); return; }
    setBusy(true);
    setError('');
    try {
      await coachAuth().forgotPassword(email);
      setStep(1);
      setFlash(again ? 'We sent a new code. The one before no longer works.' : '');
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  const set = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) { setError('Enter the 6-digit code from the email.'); return; }
    if (!passwordOk(pw)) { setError('Use a password that meets every rule below.'); return; }
    setBusy(true);
    setError('');
    try {
      await coachAuth().confirmForgotPassword(email, code, pw);
      onDone('Password changed. Log in with your new password.');
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  const aside = (
    <Help title="No email?">Check spam for a message from BladeBook. The code goes to your <b>login</b> email, not your business email.</Help>
  );
  return (
    <WizardShell ctx="For coaches" right={LOGIN_LINK} aside={aside}>
      <Card>
        {step === 0 ? (
          <form onSubmit={(e) => { e.preventDefault(); void send(false); }} noValidate>
            <h1 className="h1">Reset your password</h1><p className="lede">We’ll email a 6-digit code to your login email.</p>
            {error && <Banner tone="danger">{error}</Banner>}
            <Field label="Login email" type="email" value={email} onChange={setEmail} autoComplete="username" />
            <Button type="submit" block lg disabled={busy}>Email me a code</Button>
            <p className="fine center"><a className="link" href="#/login">Back to log in</a></p>
          </form>
        ) : (
          <form onSubmit={set} noValidate>
            <h1 className="h1">Enter the code and a new password</h1>
            <p className="lede">We sent a code to <b>{email.trim()}</b>. It expires in an hour.</p>
            {flash && <Banner tone="success">{flash}</Banner>}
            {error && <Banner tone="danger">{error}</Banner>}
            <CodeInput value={code} onChange={setCode} />
            <Field label="New password" type="password" value={pw} onChange={setPw} autoComplete="new-password" placeholder="At least 8 characters" />
            <PasswordRules password={pw} />
            <Button type="submit" block lg disabled={busy}>Set new password</Button>
            <p className="fine center">
              <button type="button" className="link" onClick={() => void send(true)} disabled={busy}>Send a new code</button>
              {' · '}<a className="link" href="#/login">Back to log in</a>
            </p>
          </form>
        )}
      </Card>
    </WizardShell>
  );
}

const SETUP_HELP = (
  <aside className="help">
    <div className="help__title"><Icon name="info" size={16} />Setup takes four steps</div>
    <ol className="numlist">
      <li>Create your account</li><li>Verify your login email with a code</li><li>How families reach and pay you</li>
      <li>Confirm your business email <small>— skipped if it’s your login email</small></li>
    </ol>
    <div className="help__body">Then build your teaching week and share your coach code.</div>
  </aside>
);

/** Sign-up step 1, the account (design: signup-1-account). Cognito creates it and emails the code. */
export function SignupAccount({ onCreated }: { onCreated: (email: string) => void }) {
  const start = savedNames();
  const [firstName, setFirst] = useState(start.firstName);
  const [lastName, setLast] = useState(start.lastName);
  const [email, setEmail] = useState(kept(EMAIL_KEY) ?? '');
  const [pw, setPw] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const problems = {
    first: firstName.trim() ? '' : 'Enter your first name.',
    last: lastName.trim() ? '' : 'Enter your last name.',
    email: emailOk(email) ? '' : 'Enter the email you’ll log in with.',
    pw: passwordOk(pw) ? '' : 'Use a password that meets every rule below.',
  };
  const show = (p: string) => (tried ? p : '');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.values(problems).some(Boolean)) return;
    setBusy(true);
    setError('');
    try {
      keep(NAMES_KEY, JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }));
      await coachAuth().signUp(email, pw);
      keep(EMAIL_KEY, email.trim());
      onCreated(email.trim());
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <WizardShell step={0} right={HAVE_ACCOUNT} aside={SETUP_HELP}>
      <Card>
        <form onSubmit={submit} noValidate>
          <h1 className="h1">Start coaching on BladeBook</h1><p className="lede">Scheduling, lessons and payment reminders in one place.</p>
          {error && <Banner tone="danger">{error}</Banner>}
          <div className="grid2">
            <Field label="First name" value={firstName} onChange={setFirst} autoComplete="given-name" error={show(problems.first)} />
            <Field label="Last name" value={lastName} onChange={setLast} autoComplete="family-name" error={show(problems.last)} />
          </div>
          <div className="hint">Shown on your booking page and in every email families get.</div>
          <Field label="Login email" type="email" value={email} onChange={setEmail} autoComplete="username"
            hint="You’ll log in with this. Your morning email comes here." error={show(problems.email)} />
          <Field label="Password" type="password" reveal value={pw} onChange={setPw} autoComplete="new-password" placeholder="At least 8 characters" error={show(problems.pw)} />
          <PasswordRules password={pw} />
          <Button type="submit" block lg disabled={busy}>Create account</Button>
        </form>
      </Card>
    </WizardShell>
  );
}

/** The email the verify step is for: the one just signed up, or a log-in that hadn't verified yet. */
export function signupEmail(): string {
  return kept(EMAIL_KEY) ?? '';
}

/**
 * Sign-up step 2, verify the login email (design: signup-2-verify). Cognito confirms it; auth-post-confirmation adds the
 * Coach group (ADR-023 d10); then the website signs in. In the same page load as step 1 that happens by itself; after a
 * reload the password is gone, so the coach logs in.
 */
export function SignupVerify({ email, onVerified, onLogIn }: {
  email: string; onVerified: () => void; onLogIn: (notice: string) => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);
  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) { setError('Enter the 6-digit code from the email.'); return; }
    setBusy(true);
    setError('');
    try {
      await coachAuth().confirmSignUp(email, code);
      keep(EMAIL_KEY, null);
      if (await coachAuth().refresh()) onVerified();
      else onLogIn('Your email is verified. Log in to finish setting up.');
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  const resend = async () => {
    setBusy(true);
    setError('');
    try {
      await coachAuth().resendSignUpCode(email);
      setFlash('We sent a new code.');
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  const aside: ReactNode = (
    <Help title="Two emails, maybe one">
      <p><b>Login email</b>: private. You sign in with it; your morning email goes there. Verified now, with a code.</p>
      <p><b>Business email</b>: the reply address families see. Same as login? Already verified. Different? It gets its own link.</p>
    </Help>
  );
  return (
    <WizardShell step={1} aside={aside}>
      <Card className="card--center">
        <form onSubmit={verify} noValidate>
          <div className="mailicon"><Icon name="mail" size={26} /></div>
          <h1 className="h1 center">Check your email</h1>
          <p className="lede center">Enter the 6-digit code we sent to<br /><b>{email}</b></p>
          {flash && <Banner tone="success">{flash}</Banner>}
          {error && <Banner tone="danger">{error}</Banner>}
          <CodeInput value={code} onChange={setCode} />
          <Button type="submit" block lg disabled={busy}>Verify email</Button>
          <p className="fine center">
            <button type="button" className="link" onClick={() => void resend()} disabled={busy}>Resend code</button>
            {' · '}<a className="link" href="#/signup">Change email</a>
          </p>
        </form>
      </Card>
    </WizardShell>
  );
}
