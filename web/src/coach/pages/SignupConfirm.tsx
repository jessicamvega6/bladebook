/**
 * Sign-up step 4, "Confirm your business email" (design: signup-4-confirm-email). The code shows as
 * Not working yet until the address is confirmed (ADR-016, amended 2026-11-06).
 *
 * "I’ve clicked the link" is the LOCAL STAND-IN (shortcut SC-2) until batch 14 sends a real link.
 * "Resend link" and "Change address" need that email, so they aren't here yet (gap G-1).
 */
import { useState } from 'react';
import { Badge, Banner, Button, Card, Help, Icon } from '../../shared/components/harbor';
import type { CoachApi, Profile } from '../api';
import { CodeCard } from '../components/CodeCard';
import { WizardShell } from '../components/Shells';

export function SignupConfirm({ api, profile, onChange, onFinish }: {
  api: CoachApi; profile: Profile; onChange: (p: Profile) => void; onFinish: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (call: () => Promise<Profile>) => {
    setBusy(true);
    setError('');
    try {
      onChange(await call());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <WizardShell step={3} aside={
      <Help title="Why confirm this one?">
        A typo here would send every family’s replies to a stranger, and nobody would notice. Confirming proves the
        address is yours.
      </Help>}>
      <Card className="card--center">
        <div className="mailicon"><Icon name="mail" size={26} /></div>
        <h1 className="h1 center">Confirm your business email</h1>
        <p className="lede center">We sent a link (not a code) to<br /><b>{profile.pendingBusinessEmail}</b></p>
        <Banner tone="info">Families can’t reach you until this is confirmed.</Banner>
        {error && <Banner tone="danger">{error}</Banner>}
        <p className="fine center">
          <button type="button" className="link" onClick={() => run(api.useLoginEmail)} disabled={busy}>Use my login email instead</button>
        </p>
        <hr className="hr" />
        <CodeCard profile={profile} />
        <Button variant="secondary" block disabled={busy} onClick={() => run(api.markBusinessEmailConfirmed)}>
          I’ve clicked the link
        </Button>
        <p className="fine center"><Badge tone="warning">Local stand-in</Badge> No email is sent on this computer; this button confirms the address.</p>
        <Button block lg onClick={onFinish}>Go to my dashboard</Button>
      </Card>
    </WizardShell>
  );
}
