/**
 * LOCAL STAND-IN (shortcut SC-1) for Cognito's family log-in (design: client login). There is no password:
 * the same email always logs in as the same family.
 */
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../shared/api/client';
import { familySession } from '../../shared/auth/localAuth';
import { Badge, Banner, Button, Card, Field, Help } from '../../shared/components/harbor';
import { AuthShell } from '../components/Shells';

export function Login({ onSignedIn, notice }: { onSignedIn: (token: string) => void; notice?: string }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSignedIn(await familySession.signIn(email));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
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
          <h1 className="h1">Log in <Badge tone="warning">Local stand-in</Badge></h1>
          <p className="lede">Book lessons and see your skaters’ schedule.</p>
          {notice && <Banner tone="info">{notice}</Banner>}
          {error && <Banner tone="danger">{error}</Banner>}
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email"
            hint="On this computer there’s no password: the same email always logs in as the same family." />
          <Button type="submit" block lg disabled={busy || !email.trim()}>Log in</Button>
        </form>
      </Card>
    </AuthShell>
  );
}
