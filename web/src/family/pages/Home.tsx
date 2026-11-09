/**
 * Home (design: client/screens-account.js SCREENS.home and acHomePending; FeatureDecriptions/ClientHomeView).
 *
 * Waiting with every coach: the waiting page, naming each coach (owner, 2026-10-13). Nothing of a waiting
 * coach is shown beyond the name (ADR-022 d6).
 * Approved by a coach: banners for coaches still waiting, the skaters, and one card per coach with the
 * contact details and payment types that coach shows. Booking, Today and Coming up arrive with Batch 4
 * (gap G-16).
 */
import { Avatar, Badge, Banner, Card, Icon, Row } from '../../shared/components/harbor';
import { firstName, joinNames } from '../../shared/logic/names';
import type { Family } from '../api';

type Coach = Family['coaches'][number];
type Skater = Family['skaters'][number];

const PAYMENT_LABEL = { CASH: 'Cash', CASHAPP: 'Cash App', VENMO: 'Venmo', PAYPAL: 'PayPal' } as const;
const names = (list: string[]) => joinNames(list.map(firstName));
const coachWords = (cs: Coach[]) => joinNames(cs.map((c) => `Coach ${c.firstName}`));

/** A skater a coach declined, or who has no coach yet (ADR-025, 2026-11-06), is with no coach. */
const NO_COACH = <Badge tone="neutral" icon="info">Not with a coach yet</Badge>;

function skaterBadges(k: Skater, multi: boolean) {
  if (!k.coaches.length) return NO_COACH;
  return (
    <span className="ac-kc__list">{k.coaches.map((c) => c.status === 'ACTIVE'
      ? <Badge key={c.firstName + c.lastName} tone="success" icon="check">{multi ? `Coach ${c.firstName}` : 'Approved'}</Badge>
      : <Badge key={c.firstName + c.lastName} tone="warning" icon="clock">{multi ? `Waiting for Coach ${c.firstName}` : 'Waiting for approval'}</Badge>)}
    </span>
  );
}

function Skaters({ family }: { family: Family }) {
  const multi = family.coaches.length > 1;
  return (
    <Card title="Your skaters" flush action={<a className="link" href="#/profile">Profile</a>}>
      {family.skaters.map((k) => (
        <Row key={k.name} lead={<Avatar name={k.name} size="sm" />} title={k.name} sub={k.isMinor ? 'Under 18' : 'Adult'} side={skaterBadges(k, multi)} />
      ))}
    </Card>
  );
}

function CoachCard({ coach, multi }: { coach: Coach; multi: boolean }) {
  const ok = coach.status === 'ACTIVE';
  const d = coach.details;
  const lines = d ? [
    ...(d.phone ? [<span key="p"><Icon name="phone" size={14} />{d.phone}</span>] : []),
    ...(d.email ? [<span key="e"><Icon name="mail" size={14} />{d.email}</span>] : []),
    ...d.payments.map((p) => <span key={p.type}><Icon name="card" size={14} />{PAYMENT_LABEL[p.type]}{p.handle ? ` ${p.handle}` : ''}</span>),
  ] : [];
  const full = `${coach.firstName} ${coach.lastName}`;
  return (
    <Card title={multi ? undefined : 'Your coach'} className="ac-coachcard">
      <div className="found found--plain">
        <Avatar name={full} />
        <div><div className="found__name">Coach {full}</div>{multi && <div className="found__sub">{coach.skaterNames.map(firstName).join(', ')}</div>}</div>
        {multi && !ok && <Badge tone="warning" icon="clock">Waiting</Badge>}
      </div>
      {!ok
        ? <p className="fine">Waiting for Coach {coach.firstName} to approve {names(coach.waitingNames)}. Contact details and booking show once they do.</p>
        : lines.length ? <div className="ac-contact">{lines}</div> : <p className="fine">Reply to any lesson email to reach Coach {coach.firstName}.</p>}
    </Card>
  );
}

function Waiting({ family }: { family: Family }) {
  const waits = family.coaches.filter((c) => c.waitingNames.length);
  const multi = waits.length > 1;
  const one = waits[0];
  const lead = !one ? '' : multi ? `Waiting for ${coachWords(waits)} to approve your skaters`
    : `Waiting for Coach ${one.firstName} to approve ${one.waitingNames.length === family.skaters.length && family.skaters.length > 1 ? 'your skaters' : names(one.waitingNames)}`;
  return (
    <>
      <div className="phead"><div className="phead__text">
        <h1 className="h1">Welcome, {family.contact.firstName}</h1>
        <p className="lede">You’re signed up with {coachWords(family.coaches)}.</p>
      </div></div>
      {one && (
        <div className="alertcard ac-wait">
          <div className="alertcard__head"><Icon name="clock" size={20} />
            <div>
              <div className="alertcard__title">{lead}</div>
              <div className="alertcard__body">{multi ? 'Until a coach approves, you won’t see their times and can’t book with them.' : `Until then you won’t see Coach ${one.firstName}’s times and can’t book.`} Each coach checks that they know each family who signs up with their code.</div>
            </div>
          </div>
          {multi && (
            <div className="listbox ac-waitlist">{waits.map((w) => (
              <Row key={w.firstName + w.lastName} lead={<Avatar name={`${w.firstName} ${w.lastName}`} size="sm" />} title={`Coach ${w.firstName} ${w.lastName}`}
                sub={`Waiting to approve ${names(w.waitingNames)}`} side={<Badge tone="warning" icon="clock">Waiting</Badge>} />
            ))}</div>
          )}
        </div>
      )}
      <Skaters family={family} />
      <Card title="What happens next">
        <ol className="ac-steps">
          <li><b>{multi ? 'Each coach approves' : `Coach ${(one ?? family.coaches[0])?.firstName ?? ''} approves`} each skater.</b> Usually within a day.</li>
          <li><b>Booking opens{multi ? ' with each coach as they approve' : ''}.</b> You’ll see open times and can book single or weekly lessons.</li>
        </ol>
      </Card>
    </>
  );
}

export function Home({ family }: { family: Family }) {
  if (family.waiting) return <Waiting family={family} />;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const multi = family.coaches.length > 1;
  return (
    <>
      <div className="phead"><div className="phead__text">
        <h1 className="h1">{greeting}, {family.contact.firstName}</h1>
        <p className="lede">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div></div>
      {family.coaches.filter((c) => c.waitingNames.length).map((c) => (
        <Banner key={c.firstName + c.lastName} tone="warning" title={`${names(c.waitingNames)} ${c.waitingNames.length === 1 ? 'is' : 'are'} waiting for Coach ${c.firstName}’s approval`}>
          You can book with Coach {c.firstName} once they approve.
        </Banner>
      ))}
      <div className="split split--today">
        <div className="stack"><Skaters family={family} /></div>
        <div className="stack">
          {multi && <div className="ac-cardshead">Your coaches</div>}
          {family.coaches.map((c) => <CoachCard key={c.firstName + c.lastName} coach={c} multi={multi} />)}
        </div>
      </div>
    </>
  );
}
