/**
 * LOCAL STAND-IN (shortcut SC-1) for Cognito's sign-up steps 1–2 and Log in. Asks for what step 1
 * would: names and the login email. The names wait in this tab until step 3 sends them.
 */
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../shared/api/client';
import { signInLocally } from '../../shared/auth/localAuth';
import { Badge, Banner, Button, Card, Field, Help } from '../../shared/components/harbor';
import { WizardShell } from '../components/Shells';

export interface SignupNames { firstName: string; lastName: string }

const NAMES_KEY = 'bb.coach.signupNames';

export function savedNames(): SignupNames {
  try {
    const raw = window.sessionStorage.getItem(NAMES_KEY);
    if (raw) return JSON.parse(raw) as SignupNames;
  } catch {
    /* nothing kept */
  }
  return { firstName: '', lastName: '' };
}

function saveNames(n: SignupNames) {
  try {
    window.sessionStorage.setItem(NAMES_KEY, JSON.stringify(n));
  } catch {
    /* names are typed again at step 3 */
  }
}

export function LocalSignIn({ onSignedIn, notice }: { onSignedIn: (token: string) => void; notice?: string }) {
  const start = savedNames();
  const [firstName, setFirst] = useState(start.firstName);
  const [lastName, setLast] = useState(start.lastName);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      saveNames({ firstName, lastName });
      onSignedIn(await signInLocally(email));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <WizardShell step={0} aside={
      <Help title="Not the real sign-in">
        <p>This page stands in for Amazon Cognito while BladeBook runs on this computer. There is no password.</p>
        <p>The same email always signs in as the same coach. The names are used at step 3 for a new account.</p>
      </Help>}>
      <Card>
        <form onSubmit={submit} noValidate>
          <h1 className="h1">Sign in on this computer <Badge tone="warning">Local stand-in</Badge></h1>
          <p className="lede">Stands in for creating your account, verifying your login email, and logging in.</p>
          {notice && <Banner tone="info">{notice}</Banner>}
          {error && <Banner tone="danger">{error}</Banner>}
          <div className="grid2">
            <Field label="First name" value={firstName} onChange={setFirst} autoComplete="given-name" />
            <Field label="Last name" value={lastName} onChange={setLast} autoComplete="family-name" />
          </div>
          <div className="hint">Shown on your booking page and in every email families get.</div>
          <Field label="Login email" type="email" value={email} onChange={setEmail} autoComplete="email"
            hint="You’ll log in with this. Your daily report comes here." />
          <Button type="submit" block lg disabled={busy}>Continue</Button>
        </form>
      </Card>
    </WizardShell>
  );
}
