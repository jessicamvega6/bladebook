/**
 * The family website's Log in and Forgot password (designs: client login, forgot-password, forgot-password-code;
 * FeatureDecriptions/C_Client Log In.md, C_Client Forgot Password.md). BladeBook's own forms, talking to Cognito from
 * the browser (ADR-023 d11): the password and code go to Cognito only, never to api-client.
 *
 * A family changes its password through "Forgot/change password"; the family Profile has no Change password (I32).
 */
import { useState, type FormEvent } from 'react';
import { familyAuth } from '../../shared/auth';
import { CodeInput, passwordOk, PasswordRules } from '../../shared/components/auth';
import { Banner, Button, Card, Field, Help } from '../../shared/components/harbor';
import { AuthShell } from '../components/Shells';

const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

export function Login({ onSignedIn, onVerify, notice, noticeTone = 'info' }: {
  onSignedIn: () => void;
  /** Green after a password change (design: login), otherwise information. */
  noticeTone?: 'success' | 'info';
  /** An account whose email was never verified: sign-up's verify step, with a new code sent. */
  onVerify: (email: string) => void;
  notice?: string;
}) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !pw) { setError('Enter your email and password.'); return; }
    setBusy(true);
    setError('');
    try {
      const next = await familyAuth().signIn(email, pw);
      if (next === 'confirm-email') {
        await familyAuth().resendSignUpCode(email).catch(() => undefined);
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
    <AuthShell aside={
      <Help title="First time here?">
        You need a code from your coach to sign up. <a className="link" href="#/signup">Sign up with a coach code</a>.
      </Help>}>
      <Card>
        <form onSubmit={submit} noValidate>
          <h1 className="h1">Log in</h1>
          <p className="lede">Book lessons and see your skaters’ schedule.</p>
          {notice && <Banner tone={noticeTone}>{notice}</Banner>}
          {error && <Banner tone="danger">{error}</Banner>}
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" />
          <Field label="Password" type="password" reveal value={pw} onChange={setPw} autoComplete="current-password" placeholder="••••••••" />
          <div className="fine"><a className="link" href="#/forgot">Forgot/change password</a></div>
          <Button type="submit" block lg disabled={busy}>Log in</Button>
        </form>
      </Card>
    </AuthShell>
  );
}

/** Two steps on one page: email a code, then the code and a new password. "Email me a code" answers the same either way. */
export function Forgot({ onDone }: { onDone: (notice: string) => void }) {
  const [step, setStep] = useState<0 | 1>(0);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (again: boolean) => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('Enter the email you log in with.'); return; }
    setBusy(true);
    setError('');
    try {
      await familyAuth().forgotPassword(email);
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
      await familyAuth().confirmForgotPassword(email, code, pw);
      onDone('Password changed. Log in with your new password.');
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell right={<>Remembered it? <a className="link" href="#/login">Log in</a></>}
      aside={<Help title="No email?">Check spam for a message from BladeBook. The code goes to the email you log in with.</Help>}>
      <Card>
        {step === 0 ? (
          <form onSubmit={(e) => { e.preventDefault(); void send(false); }} noValidate>
            <h1 className="h1">Reset your password</h1><p className="lede">We’ll email a 6-digit code to the address you log in with.</p>
            {error && <Banner tone="danger">{error}</Banner>}
            <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" />
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
            <Field label="New password" type="password" reveal value={pw} onChange={setPw} autoComplete="new-password" placeholder="At least 8 characters" />
            <PasswordRules password={pw} />
            <Button type="submit" block lg disabled={busy}>Set new password</Button>
            <p className="fine center">
              <button type="button" className="link" onClick={() => void send(true)} disabled={busy}>Send a new code</button>
              {' · '}<a className="link" href="#/login">Back to log in</a>
            </p>
          </form>
        )}
      </Card>
    </AuthShell>
  );
}
