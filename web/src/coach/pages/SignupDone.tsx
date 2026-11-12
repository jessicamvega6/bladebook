/** Sign-up "You’re all set" (design: signup-5-all-set). */
import { Badge, Button, Card, Help, Icon } from '../../shared/components/harbor';
import type { Profile } from '../api';
import { CodeCard } from '../components/CodeCard';
import { WizardShell } from '../components/Shells';

export function SignupDone({ profile }: { profile: Profile }) {
  return (
    <WizardShell step={4} aside={
      <Help title="Want a different address later?">
        Change your business email any time from your profile. A new address gets a confirmation link before families see it.
      </Help>}>
      <Card>
        <div className="hero hero--success hero--stack">
          <span className="hero__icon"><Icon name="check" size={26} /></span>
          <div>
            <h1 className="h1">You’re all set</h1>
            <p className="lede">Families will reach you at <b>{profile.businessEmail}</b>.</p>
          </div>
        </div>
        <CodeCard profile={profile} />
        <div className="nextup">
          <div>
            <div className="eyebrow">Next up</div>
            <div className="nextup__title">Build your repeating weekly schedule <Badge>Next batch</Badge></div>
            <div className="nextup__sub">Set your blocks, lesson lengths and prices.</div>
          </div>
          <Button lg iconRight="arrowR" disabled>Start</Button>
        </div>
        <p className="fine center"><a className="link" href="#/today">Or go to your dashboard</a></p>
      </Card>
    </WizardShell>
  );
}
