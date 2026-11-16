/**
 * Sign-up step 4, "Confirm your business email" (design: signup-4-confirm-email). The code shows as Not working yet
 * until the address is confirmed (ADR-016, amended 2026-11-06). The email's link opens the confirm page
 * (#/confirm-email/<token>; ADR-016, amended 2026-11-12), often in another tab or on the phone, so this page looks again
 * whenever the coach comes back to it.
 *
 * "Change address" opens a box here for the corrected address, which replaces the one waiting; in the design it goes
 * back to step 3, whose answers are already saved by now.
 */
import { useEffect, useState } from 'react';
import { Banner, Button, Card, Field, Help, Icon } from '../../shared/components/harbor';
import type { CoachApi, Profile } from '../api';
import { CodeCard } from '../components/CodeCard';
import { WizardShell } from '../components/Shells';
import { fieldErrors } from './SignupBusiness';

export function SignupConfirm({ api, profile, onChange, onFinish }: {
  api: CoachApi; profile: Profile; onChange: (p: Profile) => void; onFinish: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [changing, setChanging] = useState(false);
  const [address, setAddress] = useState('');
  const [addressErr, setAddressErr] = useState('');
  const waiting = profile.pendingBusinessEmail;

  // The link is usually clicked somewhere else; coming back to this tab picks up the confirmation.
  useEffect(() => {
    const look = () => { if (document.visibilityState === 'visible') api.profile().then(onChange).catch(() => { /* the next action says */ }); };
    document.addEventListener('visibilitychange', look);
    window.addEventListener('focus', look);
    return () => { document.removeEventListener('visibilitychange', look); window.removeEventListener('focus', look); };
  }, [api, onChange]);

  const run = async (call: () => Promise<Profile>, done?: () => void) => {
    setBusy(true);
    setError('');
    setFlash('');
    try {
      onChange(await call());
      done?.();
    } catch (e) {
      const f = fieldErrors(e);
      if (f.address) setAddressErr(f.address);
      else setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const change = () => {
    const a = address.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) { setAddressErr('Enter an email address like you@example.com.'); return; }
    setAddressErr('');
    run(() => api.addBusinessEmail(a, waiting ?? undefined), () => { setChanging(false); setFlash(`We sent a link to ${a}.`); });
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
        <p className="lede center">We sent a link (not a code) to<br /><b>{waiting}</b></p>
        <Banner tone="info">Families can’t reach you until this is confirmed. The link works for 3 days.</Banner>
        {flash && <Banner tone="success">{flash}</Banner>}
        {error && <Banner tone="danger">{error}</Banner>}
        {changing && (
          <div className="mp-add">
            <Field label="Business email address" type="email" value={address} onChange={setAddress} error={addressErr || undefined}
              hint="We’ll send a new link here. The link to the old address stops working." />
            <div className="cellbtns">
              <Button variant="secondary" sm onClick={() => { setChanging(false); setAddressErr(''); }}>Cancel</Button>
              <Button sm disabled={busy} onClick={change}>Send confirmation link</Button>
            </div>
          </div>
        )}
        <p className="fine center">
          <button type="button" className="link" disabled={busy || !waiting}
            onClick={() => run(() => api.resendLink(waiting!), () => setFlash(`Sent a new link to ${waiting}. The one sent before no longer works.`))}>
            Resend link</button>{' · '}
          <button type="button" className="link" disabled={busy} onClick={() => { setChanging(true); setAddress(waiting ?? ''); setAddressErr(''); }}>
            Change address</button>{' · '}
          <button type="button" className="link" onClick={() => run(api.useLoginEmail)} disabled={busy}>Use my login email instead</button>
        </p>
        <hr className="hr" />
        <CodeCard profile={profile} />
        <Button block lg onClick={onFinish}>Go to my dashboard</Button>
      </Card>
    </WizardShell>
  );
}
