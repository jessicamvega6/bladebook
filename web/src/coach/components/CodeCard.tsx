/**
 * The coach code card and the "not working yet" banner (design/harbor/coach/app.js, codeCardA and
 * codePendingBanner; ADR-016, amended 2026-11-06).
 */
import { useState, type ReactNode } from 'react';
import { Badge, Banner, Button } from '../../shared/components/harbor';
import type { Profile } from '../api';

export function CodeCard({ profile, extra }: { profile: Profile; extra?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const pending = !profile.codeWorks;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(profile.coachCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={`codecard${pending ? ' codecard--pending' : ''}`}>
      <div>
        <div className="codecard__head">
          <div className="codecard__label">Your coach code</div>
          {pending && <Badge tone="warning" icon="clock">Not working yet</Badge>}
        </div>
        <div className="codecard__code" aria-label={`Coach code ${profile.coachCode.split('').join(' ')}`}>{profile.coachCode}</div>
        <div className="codecard__sub">
          {pending ? 'Starts working once you confirm your business email.' : 'Families enter this to sign up with you.'}
        </div>
      </div>
      <span className="cellbtns">
        <Button variant="secondary" icon="copy" onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
        {extra}
      </span>
    </div>
  );
}

/** Shown on Today and Profile while the code waits for the business email. */
export function CodePendingBanner({ profile, onUseLogin, busy }: { profile: Profile; onUseLogin: () => void; busy?: boolean }) {
  if (profile.codeWorks) return null;
  return (
    <div className="codewait">
      <Banner tone="warning" icon="clock" title="Your code starts working once you confirm your business email">
        We sent a link to <b>{profile.pendingBusinessEmail}</b>. Until you click it, families who enter your code are
        told it doesn’t match, and they can’t sign up with you.
      </Banner>
      <p className="fine codewait__links">
        <button type="button" className="link" onClick={onUseLogin} disabled={busy}>Use my login email instead</button>
      </p>
    </div>
  );
}
