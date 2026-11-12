/**
 * Today: the "code not working yet" banner (design: today-code-pending), the coach code, and new families to
 * approve (design: today, "New families to approve"). Lessons and stats arrive with batches 4 to 8 (gap G-6);
 * for now the lessons card points at the calendar and the schedule. Batch 7: the "Heading to the rink?" card, one of
 * the coach's two ways to the rinkside page (FeatureDecriptions/Coach Dashboard on website.md; the other is the
 * morning email, not built yet).
 */
import { Avatar, Card, Icon, Row } from '../../shared/components/harbor';
import type { Profile, StudentDto } from '../api';
import { CodeCard, CodePendingBanner } from '../components/CodeCard';

/** Waiting skaters grouped by family, in sign-up order. */
function byFamily(pending: StudentDto[]): StudentDto[][] {
  const by = new Map<string, StudentDto[]>();
  for (const s of pending) by.set(s.familyId, [...(by.get(s.familyId) ?? []), s]);
  return [...by.values()];
}

export function Today({ profile, onUseLogin, busy, pending = [] }: { profile: Profile; onUseLogin: () => void; busy: boolean; pending?: StudentDto[] }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <>
      <div className="phead"><div className="phead__text"><h1 className="h1">{greeting}, {profile.firstName}</h1>
        <p className="lede">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div></div>
      <CodePendingBanner profile={profile} onUseLogin={onUseLogin} busy={busy} />
      <Card>
        <div className="rink-cta">
          <div className="rink-cta__text"><b>Heading to the rink?</b>
            <span className="muted">Check skaters in from your phone at <span className="num">/coach/rinkside</span>, with the same email and password. The link is in your morning email too.</span></div>
          <a className="btn btn--primary btn--lg" href="/coach/rinkside/"><Icon name="phone" /><span>Open the rinkside app</span></a>
        </div>
      </Card>
      {pending.length > 0 && (
        <Card title="New families to approve" sub="They can’t see your times or book until you approve them." flush className="card--attn">
          {byFamily(pending).map((kids) => (
            <Row key={kids[0]!.familyId} lead={<Avatar name={kids[0]!.clientName} size="sm" />} title={kids[0]!.clientName}
              sub={`${kids.map((k) => k.studentName).join(' & ')} · signed up ${new Date(kids[0]!.signedUpAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`} />
          ))}
          <div className="card__foot"><a className="btn btn--primary btn--block" href="#/students/pending"><span>Review sign-ups</span></a></div>
        </Card>
      )}
      <Card title="Your coach code" sub="Hand it to families in person or by message. There’s no public list of coaches.">
        <CodeCard profile={profile} />
      </Card>
      <Card title="Today’s lessons">
        <p className="muted">See today’s times on your <a className="link" href="#/calendar">calendar</a>, or <a className="link" href="#/schedule/weekly">edit your teaching week</a>.</p>
      </Card>
    </>
  );
}
