/**
 * Today, for Batch 1: only the "code not working yet" banner (design: today-code-pending) and the
 * coach code. Lessons, stats and approvals arrive with batches 2 to 8 (gap G-6).
 */
import { Card } from '../../shared/components/harbor';
import type { Profile } from '../api';
import { CodeCard, CodePendingBanner } from '../components/CodeCard';

export function Today({ profile, onUseLogin, busy }: { profile: Profile; onUseLogin: () => void; busy: boolean }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <>
      <div className="phead"><div className="phead__text"><h1 className="h1">{greeting}, {profile.firstName}</h1>
        <p className="lede">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div></div>
      <CodePendingBanner profile={profile} onUseLogin={onUseLogin} busy={busy} />
      <Card title="Your coach code" sub="Hand it to families in person or by message. There’s no public list of coaches.">
        <CodeCard profile={profile} />
      </Card>
      <Card title="Today’s lessons">
        <p className="muted">Your lessons show here once you’ve built your teaching week. That part comes in the next batch.</p>
      </Card>
    </>
  );
}
