/**
 * Profile (design: client/screens-account.js SCREENS.profile; FeatureDecriptions/ClientProfileView).
 *
 * Built: the family's name and mobile (saved to the family's own profile; each coach's copy follows through
 * consumer-family-sync, called in-process locally), the skaters with their numbers and coaches, and the
 * coaches; Add a skater, with "None of my coaches yet", and Add a coach (A9; ADR-025 d2 and item k; Batch 15).
 * Not built here: changing the login email (Cognito, gap G-15) and share codes (gap G-17).
 *
 * "Which coaches?" lists only coaches who've approved one of the family's skaters: a waiting family is never given a
 * coach's ID (ADR-MASTER section 16). A coach still waiting is reached through Add a coach, with their code.
 */
import { Fragment, useEffect, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { Avatar, Badge, Banner, Button, Card, Check, Field, Icon, Row } from '../../shared/components/harbor';
import { looksLikeShareCode, normalizeCode, SHARE_IN_COACH_BOX, type FoundCoach } from '../../shared/logic/coachCodes';
import { firstName, joinNames } from '../../shared/logic/names';
import { numberOk, orgName, SKATING_ORGS } from '../../shared/logic/registrationNumber';
import { lookupCoach, type Family, type FamilyApi } from '../api';
import { CoachFound, OrgFields } from './Signup';

/** The profile's wording (design: "Check it with the coach who gave it to you"), not the sign-up's. */
const WRONG_CODE = 'That code doesn’t match a coach. Check it with the coach who gave it to you. Codes are 8 letters and numbers.';

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
  const [flash, setFlash] = useState('');
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

  const added = (f: Family, message: string) => { onChange(f); setSaved(false); setFlash(message); };

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
      {k.shareCode && (
        <div className="ac-code"><span className="ac-code__label">Share code</span><span className="mono ac-code__v">{k.shareCode}</span>
          <span className="ac-code__btns"><Button variant="ghost" sm icon="copy" onClick={() => copyCode(k.shareCode!)}>Copy</Button></span></div>
      )}
    </Fragment>
  );
  // A skater's share code never changes (owner, 2026-10-13); another family enters it to share a lesson (G-17).
  const copyCode = (code: string) => {
    void navigator.clipboard?.writeText(code).catch(() => undefined);
    setFlash(`Copied ${code}.`);
  };

  return (
    <>
      <div className="phead"><div className="phead__text">
        <h1 className="h1">Profile</h1>
        <p className="lede">{multi ? 'How your coaches and BladeBook reach you.' : `How Coach ${coach?.firstName ?? ''} and BladeBook reach you.`}</p>
      </div></div>
      {saved && <Banner tone="success">Saved. Your coaches see the change too.</Banner>}
      {flash && <Banner tone="success">{flash}</Banner>}
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
      <Card title="Skaters" flush sub={multi || family.skaters.some((k) => !k.coaches.length) ? 'Everyone in your family who skates, and the coaches they’re with.' : `Everyone who takes lessons with Coach ${coach?.firstName ?? ''}.`}>
        {family.skaters.map(skaterRow)}
        {family.skaters.some((k) => k.shareCode) && <div className="card__note"><Icon name="users" size={14} /> To share a lesson, give a skater’s share code to the other family. They enter it when they book.</div>}
        {self ? <div className="card__note"><Icon name="info" size={14} /> You skate yourself. To book for a child, they need their own family account.</div>
          : <AddSkater family={family} api={api} onAdded={added} onError={onError} />}
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
        {!family.coaches.length && <div className="row"><span className="muted">No coaches yet.</span></div>}
        <AddCoach family={family} api={api} onAdded={added} onError={onError} />
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

type Added = (f: Family, message: string) => void;
const coachLabel = (cs: Array<{ firstName: string }>, and = 'and') =>
  joinNames(cs.map((x) => `Coach ${x.firstName}`), and);

/** Profile → Add a skater (design: SCREENS.profile, profile-add-skater-*): always asks which coaches, or none yet. */
function AddSkater({ family, api, onAdded, onError }: { family: Family; api: FamilyApi; onAdded: Added; onError: (e: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [org, setOrg] = useState(0);
  const [num, setNum] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [none, setNone] = useState(false);
  const [problem, setProblem] = useState<{ field?: string; message: string }>();
  const [busy, setBusy] = useState(false);
  const approved = family.coaches.filter((x): x is typeof x & { coachId: string } => x.coachId !== null);
  const waiting = family.coaches.filter((x) => x.coachId === null);
  const chosen = approved.filter((x) => picked.includes(x.coachId));
  const reset = () => { setOpen(false); setName(''); setOrg(0); setNum(''); setPicked([]); setNone(false); setProblem(undefined); };

  if (!open) {
    return <button type="button" className="addrow" onClick={() => setOpen(true)}><Icon name="plus" size={16} />Add a skater</button>;
  }
  const orgId = SKATING_ORGS[org]!.id;
  const ready = name.trim() !== '' && numberOk(orgId, num) && (none || chosen.length > 0);
  const send = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      const n = name.trim();
      const f = await api.addSkater({ name: n, skatingOrg: orgId, registrationNumber: num, coachIds: none ? [] : chosen.map((x) => x.coachId), noCoach: none });
      onAdded(f, chosen.length && !none
        ? `${n} added. ${coachLabel(chosen)} will approve them before you can book with ${chosen.length > 1 ? 'them' : 'that coach'}.`
        : `${n} added. They’re not with a coach yet. When you have the coach’s code, use Add a coach.`);
      reset();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 400 || e.status === 409)) setProblem({ field: e.field, message: e.message }); else onError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ac-add">
      <Field label="Skater’s full name" value={name} onChange={setName} placeholder="e.g. Lily Chen"
        hint="Children under 18. A skater 18 or older signs up for their own account." error={problem?.field === 'name' ? problem.message : undefined} />
      <OrgFields org={org} number={num} onOrg={setOrg} onNumber={setNum} />
      <div className="fieldset">
        <div className="label">Which coaches?</div>
        <div className="ac-coachkids">
          {approved.map((x) => (
            <Check key={x.coachId} label={`Coach ${x.firstName} ${x.lastName}`} checked={picked.includes(x.coachId)}
              onChange={() => { setNone(false); setPicked(picked.includes(x.coachId) ? picked.filter((p) => p !== x.coachId) : [...picked, x.coachId]); }} />
          ))}
          <Check label="None of my coaches yet" sub="For a skater who’ll start with a new coach. Use Add a coach when you have their code." checked={none}
            onChange={() => { setNone(!none); if (!none) setPicked([]); }} />
        </div>
        <div className="hint">Pick each coach the new skater will take lessons with, or none yet. You can add more later.</div>
        {/* Not in the design: a coach still waiting to approve anyone can't be picked here (their ID isn't given out). */}
        {waiting.length > 0 && <div className="hint">{coachLabel(waiting)} {waiting.length > 1 ? 'aren’t' : 'isn’t'} listed until they approve one of your skaters. To add this skater for them now, choose “None of my coaches yet”, then Add a coach with their code.</div>}
      </div>
      {none ? <Banner tone="info" title="Not with a coach yet">You can’t book for them, or add them to a shared lesson, until a coach approves them. No coach is told about them until you add one.</Banner>
        : chosen.length > 1 ? <Banner tone="info" title="Each coach you pick approves the new skater">You can book with a coach once they approve.</Banner>
          : <Banner tone="info" title={`${chosen.length ? `Coach ${chosen[0]!.firstName}` : 'The coach you pick'} approves new skaters`}>You can book for them once they’re approved.</Banner>}
      {problem && problem.field !== 'name' && <Banner tone="danger">{problem.message}</Banner>}
      <div className="skater__actions">
        <Button variant="ghost" sm onClick={reset}>Cancel</Button>
        <Button variant="secondary" sm icon="plus" disabled={!ready || busy} onClick={() => void send()}>Add skater</Button>
      </div>
    </div>
  );
}

/** Profile → Add a coach (design: acCoachesCard, profile-add-coach-*): the coach's code, then which skaters join them. */
function AddCoach({ family, api, onAdded, onError }: { family: Family; api: FamilyApi; onAdded: Added; onError: (e: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [lookup, setLookup] = useState<{ code: string; coach: FoundCoach | null }>();
  const [kids, setKids] = useState<string[]>([]);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const code = normalizeCode(typed);

  useEffect(() => {
    if (code.length !== 8 || lookup?.code === code) return;
    let live = true;
    lookupCoach(code)
      .then((coach) => live && setLookup({ code, coach }))
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 404) setLookup({ code, coach: null }); else onError(e);
      });
    return () => { live = false; };
  }, [code, lookup?.code, onError]);

  const reset = () => { setOpen(false); setTyped(''); setKids([]); setProblem(''); };
  if (!open) {
    return <button type="button" className="addrow" onClick={() => setOpen(true)}><Icon name="plus" size={16} />Add a coach</button>;
  }
  const found = code.length === 8 && lookup?.code === code ? lookup.coach : undefined;
  const wrong = code.length === 8 && lookup?.code === code && lookup.coach === null;
  /** This skater's link with the found coach, matched by name: the code lookup gives no ID. */
  const linkWith = (k: Skater) => (found ? k.coaches.find((x) => x.firstName === found.firstName && x.lastName === found.lastName) : undefined);
  const chosen = family.skaters.filter((k) => kids.includes(k.studentId) && !linkWith(k));
  const err = wrong ? (looksLikeShareCode(typed) ? SHARE_IN_COACH_BOX : WRONG_CODE) : code.length < 8 && looksLikeShareCode(typed) ? SHARE_IN_COACH_BOX : problem || undefined;
  const send = async () => {
    if (!found) return;
    setBusy(true);
    setProblem('');
    try {
      const f = await api.addCoach({ coachCode: code, studentIds: chosen.map((k) => k.studentId) });
      onAdded(f, `Sent to Coach ${found.firstName} ${found.lastName}. ${joinNames(chosen.map((k) => firstName(k.name)), 'and')} can book with Coach ${found.firstName} once they approve.`);
      reset();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 400 || e.status === 409)) setProblem(e.message); else onError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ac-add">
      <Field label="Coach code" value={typed} onChange={(v) => { setTyped(v); setProblem(''); }} mono placeholder="e.g. K7QM-4X9T" error={err}
        hint={!found && !err ? 'Every coach has their own code. Ask the new coach for theirs.' : undefined} />
      {found && (
        <>
          <CoachFound coach={found} extra={<Badge tone="success" icon="check">Code found</Badge>} />
          <div className="fieldset">
            <div className="label">Who will skate with Coach {found.firstName}?</div>
            <div className="ac-coachkids">
              {family.skaters.map((k) => {
                const st = linkWith(k);
                if (st) {
                  return (
                    <div key={k.studentId} className="check ac-check--done">
                      <span className="check__text"><span className="check__label">{k.name}</span>
                        <span className="check__sub">{st.status === 'ACTIVE' ? `Already Coach ${found.firstName}’s student` : `Already waiting for Coach ${found.firstName}`}</span></span>
                      <Badge tone={st.status === 'ACTIVE' ? 'success' : 'warning'}>{st.status === 'ACTIVE' ? 'Approved' : 'Waiting'}</Badge>
                    </div>
                  );
                }
                return <Check key={k.studentId} label={k.name} checked={kids.includes(k.studentId)}
                  sub={k.coaches.length ? `Also with ${k.coaches.map((x) => `Coach ${x.firstName}`).join(', ')}` : undefined}
                  onChange={() => setKids(kids.includes(k.studentId) ? kids.filter((x) => x !== k.studentId) : [...kids, k.studentId])} />;
              })}
            </div>
            <div className="hint">Skater not listed? Add them under Skaters and choose “None of my coaches yet”. They’ll then appear here.</div>
          </div>
          <Banner tone="info" title={`Coach ${found.firstName} approves each skater`}>You can book with Coach {found.firstName} once they do. Your other coaches aren’t affected.</Banner>
        </>
      )}
      <div className="skater__actions">
        <Button variant="ghost" sm onClick={reset}>Cancel</Button>
        <Button variant="secondary" sm icon="arrowR" disabled={!found || !chosen.length || busy} onClick={() => void send()}>{found ? `Send to Coach ${found.firstName}` : 'Send'}</Button>
      </div>
    </div>
  );
}
