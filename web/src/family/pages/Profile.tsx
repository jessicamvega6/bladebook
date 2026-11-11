/**
 * Profile (design: client/screens-account.js SCREENS.profile; FeatureDecriptions/ClientProfileView).
 *
 * Built: the family's name and mobile (saved to the family's own profile; each coach's copy follows through
 * consumer-family-sync, called in-process locally), the skaters with their numbers and coaches, and the
 * coaches. Not built here: changing the login email (Cognito, gap G-15), share codes (gap G-17), and Add a
 * skater and Add a coach (Batch 15).
 */
import { Fragment, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { Avatar, Badge, Banner, Button, Card, Field, Icon, Row } from '../../shared/components/harbor';
import { firstName } from '../../shared/logic/names';
import { orgName } from '../../shared/logic/registrationNumber';
import type { Family, FamilyApi } from '../api';

type Skater = Family['skaters'][number];

function statusBadge(ok: boolean, label?: string) {
  return ok ? <Badge tone="success" icon="check">{label ?? 'Approved'}</Badge> : <Badge tone="warning" icon="clock">{label ? `Waiting for ${label}` : 'Waiting for approval'}</Badge>;
}

export function Profile({ family, api, onChange, onSignOut, onError }: {
  family: Family; api: FamilyApi; onChange: (f: Family) => void; onSignOut: () => void; onError: (e: unknown) => void;
}) {
  const c = family.contact;
  const [first, setFirst] = useState(c.firstName);
  const [last, setLast] = useState(c.lastName);
  const [phone, setPhone] = useState(c.phone);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<{ field?: string; message: string }>();
  const [busy, setBusy] = useState(false);
  const self = c.relationship === 'SELF';
  const multi = family.coaches.length > 1;
  const coach = family.coaches[0];

  const save = async () => {
    setBusy(true);
    setSaved(false);
    setProblem(undefined);
    try {
      onChange(await api.updateContact({ firstName: first, lastName: last, phone }));
      setSaved(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) setProblem({ field: e.field, message: e.message });
      else onError(e);
    } finally {
      setBusy(false);
    }
  };
  const err = (field: string) => (problem?.field === field ? problem.message : undefined);

  const skaterRow = (k: Skater) => (
    <Fragment key={k.name}>
      <Row lead={<Avatar name={k.name} size="sm" />} title={k.name}
        sub={<>{k.isMinor ? 'Under 18' : 'Adult'} · {orgName(k.skatingOrg)} <span className="mono">#{k.registrationNumber}</span></>}
        side={!k.coaches.length ? <Badge tone="neutral" icon="info">Not with a coach yet</Badge>
          : multi ? undefined : statusBadge(k.coaches.some((x) => x.status === 'ACTIVE'))} />
      {multi && k.coaches.length > 0 && (
        <div className="ac-code ac-kc"><span className="ac-code__label">Coaches</span>
          <span className="ac-kc__list">{k.coaches.map((x) => <span key={x.firstName + x.lastName}>{statusBadge(x.status === 'ACTIVE', `Coach ${x.firstName}`)}</span>)}</span>
        </div>
      )}
    </Fragment>
  );

  return (
    <>
      <div className="phead"><div className="phead__text">
        <h1 className="h1">Profile</h1>
        <p className="lede">{multi ? 'How your coaches and BladeBook reach you.' : `How Coach ${coach?.firstName ?? ''} and BladeBook reach you.`}</p>
      </div></div>
      {saved && <Banner tone="success">Saved. Your coaches see the change too.</Banner>}
      {problem && !problem.field && <Banner tone="danger">{problem.message}</Banner>}
      <Card title="Your details">
        <div className="grid2">
          <Field label={self ? 'First name' : 'Your first name'} value={first} onChange={setFirst} autoComplete="given-name" error={err('firstName')} />
          <Field label={self ? 'Last name' : 'Your last name'} value={last} onChange={setLast} autoComplete="family-name" error={err('lastName')} />
        </div>
        <div className="grid2">
          <Field label="Mobile phone" type="tel" value={phone} onChange={setPhone} autoComplete="tel" error={err('phone')} />
          <div className="field">
            <label className="label" htmlFor="pr-email">Email</label>
            <input id="pr-email" className="ctl" value={c.email} disabled readOnly />
            <div className="hint">You log in with this. Changing it comes later.</div>
          </div>
        </div>
        <div className="fieldset"><div className="label">Text reminders <Badge>Phase 2</Badge></div><div className="hint">Texts come in Phase 2. Until then every reminder and cancellation comes by email.</div></div>
        <div className="fieldset"><div className="label">Profile picture <Badge>Phase 2</Badge></div>
          <div className="photo-pick"><Avatar name={`${c.firstName} ${c.lastName}`} size="lg" /><Button variant="secondary" sm disabled>Choose a picture</Button><span className="hint">Picking a picture comes in Phase 2.</span></div>
        </div>
      </Card>
      <Card title="Skaters" flush sub={multi ? 'Everyone in your family who skates, and the coaches they’re with.' : `Everyone who takes lessons with Coach ${coach?.firstName ?? ''}.`}>
        {family.skaters.map(skaterRow)}
        {self && <div className="card__note"><Icon name="info" size={14} /> You skate yourself. To book for a child, they need their own family account.</div>}
      </Card>
      <Card title="Your coaches" flush sub="Each coach approves your skaters and sets their own times and prices.">
        {family.coaches.map((x) => {
          const ok = x.status === 'ACTIVE';
          return (
            <Row key={x.firstName + x.lastName} lead={<Avatar name={`${x.firstName} ${x.lastName}`} size="sm" />} title={`Coach ${x.firstName} ${x.lastName}`}
              sub={x.skaterNames.map((n) => `${firstName(n)}${x.waitingNames.includes(n) ? ' (waiting)' : ''}`).join(', ')}
              side={statusBadge(ok)} />
          );
        })}
      </Card>
      <div className="actions">
        <div />
        <div className="actions__r">
          <Button variant="ghost" onClick={onSignOut}>Log out</Button>
          <Button disabled={busy} onClick={save}>Save</Button>
        </div>
      </div>
    </>
  );
}
