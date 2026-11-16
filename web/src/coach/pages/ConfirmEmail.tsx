/**
 * The business-email confirm page, opened from the confirmation email's link (#/confirm-email/<token>; ADR-016, amended
 * 2026-11-12; architecture.md section 6.13). The coach is signed in first, like every coach page. Opening the link
 * changes nothing: it only says which address the link is for, and the coach chooses Confirm, so a mail scanner that
 * follows links can't confirm an address.
 *
 * The Harbor design has no screen for this page: it's built from sign-up step 4's card, accepted as is by the owner (G-40, 2026-11-16).
 */
import { useEffect, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { Banner, Button, Card, Icon } from '../../shared/components/harbor';
import type { CoachApi, Profile } from '../api';

type State =
  | { kind: 'checking' }
  | { kind: 'ready'; address: string }
  | { kind: 'done'; address: string; codeStarted: boolean }
  | { kind: 'refused'; message: string };

export function ConfirmEmail({ api, token, profile, onChange, onError }: {
  api: CoachApi; token: string; profile: Profile; onChange: (p: Profile) => void; onError: (e: unknown) => void;
}) {
  const [state, setState] = useState<State>({ kind: 'checking' });
  const [busy, setBusy] = useState(false);

  // A refused link (used, replaced, expired, another coach's) is a 409 with the reason; anything else goes to the app.
  const refusedOr = (e: unknown) => {
    if (e instanceof ApiError && e.status === 409) setState({ kind: 'refused', message: e.message });
    else onError(e);
  };

  useEffect(() => {
    let live = true;
    api.checkLink(token)
      .then((r) => live && setState({ kind: 'ready', address: r.address }))
      .catch((e: unknown) => live && refusedOr(e));
    return () => { live = false; };
  }, [api, token]); // refusedOr only reads its arguments and the setters

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await api.confirmLink(token);
      setState({ kind: 'done', address: r.address, codeStarted: !profile.codeWorks && r.profile.codeWorks });
      onChange(r.profile);
    } catch (e) {
      refusedOr(e);
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === 'checking') {
    return <Card className="card--center"><p className="muted" aria-busy="true">Checking your link…</p></Card>;
  }
  if (state.kind === 'refused') {
    return (
      <Card className="card--center">
        <div className="mailicon"><Icon name="mail" size={26} /></div>
        <h1 className="h1 center">This link doesn’t work any more</h1>
        <Banner tone="warning">{state.message}</Banner>
        <p className="lede center">You can send yourself a new link from your profile.</p>
        <a className="btn btn--primary btn--lg btn--block" href="#/profile/email"><span>Go to Business email</span></a>
        <p className="fine center"><a className="link" href="#/today">Or go to your dashboard</a></p>
      </Card>
    );
  }
  if (state.kind === 'done') {
    return (
      <Card>
        <div className="hero hero--success hero--stack">
          <span className="hero__icon"><Icon name="check" size={26} /></span>
          <div>
            <h1 className="h1">Business email confirmed</h1>
            <p className="lede">Families’ replies to your lesson emails now go to <b>{state.address}</b>.</p>
          </div>
        </div>
        {state.codeStarted && <Banner tone="success">Your coach code works now. Families can sign up with it.</Banner>}
        <a className="btn btn--primary btn--lg btn--block" href="#/today"><span>Go to my dashboard</span></a>
        <p className="fine center"><a className="link" href="#/profile/email">See your business email list</a></p>
      </Card>
    );
  }
  return (
    <Card className="card--center">
      <div className="mailicon"><Icon name="mail" size={26} /></div>
      <h1 className="h1 center">Confirm your business email</h1>
      <p className="lede center">Use <b>{state.address}</b> as your business email?<br />Families’ replies to your lesson emails will come here.</p>
      <Button lg block disabled={busy} onClick={confirm}>Confirm</Button>
      <p className="fine center">Didn’t ask for this? Leave this page. Nothing changes unless you choose Confirm.</p>
    </Card>
  );
}
