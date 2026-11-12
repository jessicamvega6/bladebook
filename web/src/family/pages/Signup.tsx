/**
 * Family sign-up (design: client/screens-account.js SCREENS.signup; FeatureDecriptions/Client Sign Up;
 * ADR-MASTER section 5). Five steps on the stepper:
 *
 *   1 Coach code: checked as it's typed, several coaches allowed (ADR-025 item h).
 *   2 Your details: who the lessons are for, names, mobile, and the account. Creating the account is Cognito's;
 *     here the local stand-in signs the family in with the email (shortcut SC-1). An email that already has a
 *     family account is refused here, as Cognito's sign-up would refuse it. Already signed in (an
 *     account with no family yet), the email is shown, not asked for.
 *   3 Verify email: Cognito's, not built (gap G-14). The stepper marks it done.
 *   4 Skaters: the adult themselves, or a guardian's children (minors only, A7), each with an organization and
 *     number and the coaches they join. An adult ticks "I’m 18 or older" before sending (owner, 2026-11-09).
 *   5 Waiting for approval. No page promises an approval email (A10).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '../../shared/api/client';
import { emailFromToken, familySession } from '../../shared/auth/localAuth';
import { Avatar, Badge, Banner, Button, Card, Check, Field, Help, Icon, Row, Seg } from '../../shared/components/harbor';
import {
  codeState, continueLabel, looksLikeShareCode, normalizeCode, NO_SUCH_COACH, SHARE_IN_COACH_BOX, type FoundCoach, type Lookup,
} from '../../shared/logic/coachCodes';
import { joinNames } from '../../shared/logic/names';
import {
  liveNumberError, numberOk, orgName, SKATING_ORGS, type SkatingOrg,
} from '../../shared/logic/registrationNumber';
import { familyApi, lookupCoach, type Family } from '../api';
import { AuthShell } from '../components/Shells';

interface Listed { code: string; coach: FoundCoach }
interface SkaterDraft { name: string; org: number; number: string; coaches: string[] | null }

const coachName = (c: FoundCoach) => `${c.firstName} ${c.lastName}`;
const LOGIN_RIGHT = <>Already have an account? <a className="link" href="#/login">Log in</a></>;

/** At least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol (design's pwRules). */
const PASSWORD_RULES: Array<[string, (p: string) => boolean]> = [
  ['At least 8 characters', (p) => p.length >= 8],
  ['An uppercase letter', (p) => /[A-Z]/.test(p)],
  ['A lowercase letter', (p) => /[a-z]/.test(p)],
  ['A number', (p) => /[0-9]/.test(p)],
  ['A symbol (!@#$…)', (p) => /[^A-Za-z0-9]/.test(p)],
];

function phoneOk(p: string) {
  const digits = p.replace(/\D/g, '').length;
  return /^[0-9 +().-]+$/.test(p.trim()) && digits >= 10 && digits <= 15;
}

export function CoachFound({ coach, extra }: { coach: FoundCoach; extra?: ReactNode }) {
  return (
    <div className="found">
      <span className="avatar" aria-hidden="true">{coach.initials}</span>
      <div><div className="found__name">Coach {coachName(coach)}</div></div>
      {extra}
    </div>
  );
}

export function OrgFields({ org, number, onOrg, onNumber }: { org: number; number: string; onOrg: (i: number) => void; onNumber: (v: string) => void }) {
  const o = SKATING_ORGS[org]!;
  return (
    <>
      <div className="fieldset ac-org">
        <div className="label">Skating organization</div>
        <Seg label="Skating organization" options={SKATING_ORGS.map((x) => x.name)} selected={org} onSelect={onOrg} />
      </div>
      <Field label={o.numberLabel} value={number} onChange={onNumber} mono placeholder={o.example}
        error={liveNumberError(o.id, number) || undefined}
        hint={`From the skater’s ${o.name} membership for this season${o.shape}. It changes every season.`} />
    </>
  );
}

function CoachPick({ coaches, on, onToggle }: { coaches: Listed[]; on: string[]; onToggle: (code: string) => void }) {
  if (coaches.length < 2) return null;
  return (
    <div className="fieldset">
      <div className="label">Which coaches?</div>
      <div className="ac-coachkids">
        {coaches.map((c) => <Check key={c.code} label={`Coach ${coachName(c.coach)}`} checked={on.includes(c.code)} onChange={() => onToggle(c.code)} />)}
      </div>
      {on.length === 0 && <div className="hint hint--error"><Icon name="alert" size={14} />Pick at least one coach.</div>}
    </div>
  );
}

export function Signup({ token, onToken, onDone, onSignInAgain }: {
  /** Set when the family is signed in but hasn't finished signing up. */
  token: string | null;
  onToken: (token: string) => void;
  onDone: (family: Family) => void;
  onSignInAgain: () => void;
}) {
  const [step, setStep] = useState<0 | 1 | 3 | 4>(0);
  const [typed, setTyped] = useState('');
  const [lookup, setLookup] = useState<Lookup>();
  const [coaches, setCoaches] = useState<Listed[]>([]);
  const [forWho, setForWho] = useState(1);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [tried, setTried] = useState(false);
  const [selfOrg, setSelfOrg] = useState(0);
  const [selfNum, setSelfNum] = useState('');
  const [selfCoaches, setSelfCoaches] = useState<string[] | null>(null);
  const [adult, setAdult] = useState(false);
  const [skaters, setSkaters] = useState<Array<SkaterDraft & { coaches: string[] }>>([]);
  const [draft, setDraft] = useState<SkaterDraft>({ name: '', org: 0, number: '', coaches: null });
  const [done, setDone] = useState<Family | null>(null);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);

  const self = forWho === 0;
  const signedInEmail = token ? emailFromToken(token) : '';
  const listedCodes = coaches.map((c) => c.code);
  const state = codeState(typed, lookup, listedCodes);
  const code = normalizeCode(typed);

  // Step 1: look the code up once it has 8 letters and numbers.
  useEffect(() => {
    if (code.length !== 8 || lookup?.code === code) return;
    let live = true;
    lookupCoach(code)
      .then((coach) => live && setLookup({ code, coach }))
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 404) setLookup({ code, coach: null });
        else setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      });
    return () => { live = false; };
  }, [code, lookup?.code]);

  /** Every coach on the list, plus the one in the box when it's found. */
  const all: Listed[] = useMemo(
    () => (state === 'found' && lookup?.coach ? [...coaches, { code, coach: lookup.coach }] : coaches),
    [state, lookup, coaches, code],
  );
  const multi = all.length > 1;
  const who = multi ? 'your coaches' : all[0] ? `Coach ${all[0].coach.firstName}` : 'your coach';
  const allCodes = all.map((c) => c.code);
  const picked = (sel: string[] | null) => (sel ?? allCodes).filter((c) => allCodes.includes(c));
  const toggle = (sel: string[] | null, c: string) => { const s = picked(sel); return s.includes(c) ? s.filter((x) => x !== c) : [...s, c]; };

  // -------------------------------------------------------------- step 1
  if (step === 0) {
    const bad = coaches.length > 0 && (state === 'wrong' || state === 'share' || state === 'dup' || state === 'checking');
    const err = state === 'wrong' ? (looksLikeShareCode(typed) ? SHARE_IN_COACH_BOX : NO_SUCH_COACH)
      : state === 'share' ? SHARE_IN_COACH_BOX
        : state === 'dup' ? `Coach ${lookup?.coach?.firstName} is already on your list.` : undefined;
    const addCurrent = () => {
      if (state === 'found' && lookup?.coach) setCoaches([...coaches, { code, coach: lookup.coach }]);
      setTyped('');
    };
    return (
      <AuthShell step={0} ctx="Family sign up" right={token ? null : LOGIN_RIGHT} aside={
        <Help title="How signing up works">Each coach gives you a code. You create an account, add the skater (you or your child), and each coach approves them. Booking with a coach opens as soon as they do.</Help>}>
        <Card>
          <h1 className="h1">Join your coach on BladeBook</h1>
          <p className="lede">Enter the code your coach gave you. More than one coach? Add each one’s code.</p>
          {error && <Banner tone="danger">{error}</Banner>}
          {coaches.map((c, i) => (
            <CoachFound key={c.code} coach={c.coach} extra={<Button variant="ghost" sm onClick={() => setCoaches(coaches.filter((_, j) => j !== i))}>Remove</Button>} />
          ))}
          <Field label={coaches.length ? 'Another coach’s code' : 'Coach code'} value={typed} onChange={(v) => { setTyped(v); setError(''); }}
            mono placeholder="e.g. K7QM-4X9T" error={err} hint={state === 'typing' ? 'It links your account to your coach’s lessons.' : undefined} />
          {state === 'found' && lookup?.coach ? (
            <>
              <CoachFound coach={lookup.coach} extra={<Badge tone="success" icon="check">Code found</Badge>} />
              <button type="button" className="addrow" onClick={addCurrent}><Icon name="plus" size={16} />Add another coach</button>
            </>
          ) : !coaches.length && (
            <div className="empty-coach"><Icon name="user" size={20} /><span>Your coach will appear here so you can check it’s the right one.</span></div>
          )}
          <Button block lg iconRight={all.length ? 'arrowR' : undefined} disabled={!all.length || bad}
            onClick={() => { addCurrent(); setStep(1); }}>{continueLabel(all.map((c) => c.coach))}</Button>
          <p className="fine center">{bad
            ? `Fix the code or clear the box to continue with ${coaches.length > 1 ? `${coaches.length} coaches` : `Coach ${coaches[0]!.coach.firstName}`}.`
            : all.length ? 'Wrong coach? Check the code with them.' : 'No code? Ask your coach. Every coach has their own.'}</p>
        </Card>
      </AuthShell>
    );
  }

  const coachChip = (
    <Card>
      <div className="eyebrow">Signing up with</div>
      {coaches.map((c) => (
        <div key={c.code} className="found found--plain">
          <span className="avatar" aria-hidden="true">{c.coach.initials}</span>
          <div><div className="found__name">Coach {coachName(c.coach)}</div><div className="found__sub mono">{c.code.slice(0, 4)}-{c.code.slice(4)}</div></div>
        </div>
      ))}
    </Card>
  );

  // -------------------------------------------------------------- step 2
  if (step === 1) {
    const problems = {
      first: first.trim() ? '' : 'Enter your first name.',
      last: last.trim() ? '' : 'Enter your last name.',
      phone: phoneOk(phone) ? '' : 'Enter a mobile number with its area code, like (205) 555-0142.',
      email: token || /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(email.trim()) ? '' : 'Enter an email address like name@example.com.',
      pw: token || PASSWORD_RULES.every(([, ok]) => ok(pw)) ? '' : 'Use a password that meets every rule below.',
      pw2: token || pw2 === pw ? '' : 'The passwords don’t match.',
    };
    const ok = Object.values(problems).every((p) => !p);
    const next = async () => {
      setTried(true);
      if (!ok) return;
      if (token) { setStep(3); return; }
      setBusy(true);
      setError('');
      try {
        const t = await familySession.signIn(email.trim());
        // Cognito's sign-up refuses an email that already has an account. The stand-in signs any email in,
        // so it checks for a family here instead, rather than after step 4 (owner, 2026-11-09).
        const taken = await familyApi(t).me().then(() => true, (e: unknown) => {
          if (e instanceof ApiError && e.code === 'NO_ACCOUNT') return false;
          throw e;
        });
        if (taken) {
          familySession.signOut();
          setExisting(true);
          return;
        }
        onToken(t);
        setStep(3);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      } finally {
        setBusy(false);
      }
    };
    const show = (p: string) => (tried && p ? p : undefined);
    return (
      <AuthShell step={1} ctx="Family sign up" right={token ? null : LOGIN_RIGHT} aside={
        <div className="stack">{coachChip}
          <Help title={self ? 'Skating yourself' : 'Signing up for your child?'}>{self ? 'Reminders, confirmations and payment reminders all come to you.' : 'Sign up as yourself. You add your child as a skater on step 4, and you can add more than one.'}</Help>
        </div>}>
        <Card>
          <h1 className="h1">About you</h1>
          <p className="lede">The person who books and pays for lessons.</p>
          {existing && (
            <Banner tone="danger" title="You already have an account with this email">
              <a className="link" href="#/login">Log in instead</a>, or use a different email to sign up.
            </Banner>
          )}
          {error && <Banner tone="danger">{error}</Banner>}
          <div className="fieldset">
            <div className="label">Who are the lessons for?</div>
            <Seg label="Who are the lessons for?" options={['Me (18 or older)', 'A child I’m guardian of']} selected={forWho} onSelect={setForWho} />
            <div className="hint">{self ? 'You’re the skater. Under 18? Your guardian signs up and adds you.' : 'Sign up as yourself. You add your child on step 4.'}</div>
          </div>
          <div className="grid2">
            <Field label={self ? 'First name' : 'Your first name'} value={first} onChange={setFirst} autoComplete="given-name" error={show(problems.first)} />
            <Field label={self ? 'Last name' : 'Your last name'} value={last} onChange={setLast} autoComplete="family-name" error={show(problems.last)} />
          </div>
          <div className="grid2">
            <Field label="Mobile phone" type="tel" value={phone} onChange={setPhone} autoComplete="tel" error={show(problems.phone)} />
            {token
              ? <div className="field"><label className="label" htmlFor="su-email">Email</label><input id="su-email" className="ctl" value={signedInEmail} disabled readOnly /><div className="hint">You’re signed in with this email.</div></div>
              : <Field label="Email" type="email" value={email} onChange={(v) => { setEmail(v); setExisting(false); }} autoComplete="email" error={show(problems.email)} hint="For logging in, confirmations and reminders." />}
          </div>
          {!token && (
            <>
              <Field label="Password" type="password" value={pw} onChange={setPw} autoComplete="new-password" placeholder="At least 8 characters" error={show(problems.pw)} />
              <ul className="rules">{PASSWORD_RULES.map(([t, rule]) => (
                <li key={t} className={rule(pw) ? 'is-ok' : ''}><Icon name={rule(pw) ? 'check' : 'x'} size={13} />{t}</li>
              ))}</ul>
              <Field label="Confirm password" type="password" value={pw2} onChange={setPw2} autoComplete="new-password" placeholder="Type it again" noPaste
                error={show(problems.pw2)} hint="Type it again rather than pasting. Pasting is turned off here." />
            </>
          )}
          <div className="fieldset"><div className="label">Text reminders <Badge>Phase 2</Badge></div><div className="hint">Texts come in Phase 2. Until then every reminder and cancellation comes by email.</div></div>
          <div className="actions">
            <div><Button variant="ghost" icon="arrowL" onClick={() => setStep(0)}>Back</Button></div>
            <div className="actions__r"><Button lg disabled={busy} onClick={next}>{token ? 'Continue' : 'Create account'}</Button></div>
          </div>
        </Card>
      </AuthShell>
    );
  }

  // -------------------------------------------------------------- step 4
  if (step === 3) {
    const send = async (body: Parameters<ReturnType<typeof familyApi>['register']>[0]) => {
      if (!token) { onSignInAgain(); return; }
      setBusy(true);
      setError('');
      try {
        setDone(await familyApi(token).register(body));
        setStep(4);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) onSignInAgain();
        else setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      } finally {
        setBusy(false);
      }
    };
    const base = { firstName: first.trim(), lastName: last.trim(), phone: phone.trim(), coachCodes: allCodes };
    const aside = (title: string, body: string) => (
      <div className="stack">
        <Help title={title}>{body}</Help>
        <Help title={self ? 'Your skater number' : 'Skater numbers'}>Every skater needs a current U.S. Figure Skating, USA Hockey or Learn to Skate USA number to sign up. BladeBook can’t check it; your coach may.</Help>
      </div>
    );
    const sendLabel = multi ? 'Send to your coaches' : `Send to ${who}`;

    if (self) {
      const org = SKATING_ORGS[selfOrg]!.id;
      const mine = picked(selfCoaches);
      return (
        <AuthShell step={3} ctx="Family sign up" right={null}
          aside={aside('Skating yourself', `${multi ? 'Each coach' : who} still approves you before you can book with them. Booking opens here as soon as they do.`)}>
          <Card>
            <h1 className="h1">You’re the skater</h1>
            <p className="lede">Check your details. This is who {who} will see.</p>
            {error && <Banner tone="danger">{error}</Banner>}
            <div className="skater">
              <Avatar name={`${first} ${last}`} />
              <div className="skater__text"><b>{first} {last} <Badge tone="primary">You</Badge></b><small>Adult · from your account details</small></div>
            </div>
            <Check label="I’m 18 or older" sub="If you’re under 18, a guardian needs to sign up and add you as their skater." checked={adult} onChange={setAdult} />
            <OrgFields org={selfOrg} number={selfNum} onOrg={setSelfOrg} onNumber={setSelfNum} />
            <CoachPick coaches={all} on={mine} onToggle={(c) => setSelfCoaches(toggle(selfCoaches, c))} />
            <p className="fine">Booking for someone else? <button type="button" className="link" onClick={() => { setForWho(1); setStep(1); }}>Change who the lessons are for</button>.</p>
            <div className="actions">
              <div><Button variant="ghost" icon="arrowL" onClick={() => setStep(1)}>Back</Button></div>
              <div className="actions__r">
                <Button lg iconRight="arrowR" disabled={busy || !adult || !numberOk(org, selfNum) || !mine.length}
                  onClick={() => send({ ...base, relationship: 'SELF', skaters: [{ name: `${first.trim()} ${last.trim()}`, skatingOrg: org, registrationNumber: selfNum, coachCodes: mine }] })}>
                  {sendLabel}
                </Button>
              </div>
            </div>
          </Card>
        </AuthShell>
      );
    }

    const draftOrg = SKATING_ORGS[draft.org]!.id;
    const draftCoaches = picked(draft.coaches);
    const canAdd = !!draft.name.trim() && numberOk(draftOrg, draft.number) && draftCoaches.length > 0;
    return (
      <AuthShell step={3} ctx="Family sign up" right={null}
        aside={aside('What happens next', `${multi ? 'Each coach approves the skaters who chose them' : `${who} approves each skater`} before they can be booked. You can add more skaters and coaches later from your profile.`)}>
        <Card>
          <h1 className="h1">Who’s skating?</h1>
          <p className="lede">Add everyone who will take lessons with {who}.</p>
          {error && <Banner tone="danger">{error}</Banner>}
          {skaters.length ? skaters.map((s, i) => (
            <div key={i} className="skater">
              <Avatar name={s.name} />
              <div className="skater__text"><b>{s.name}</b>
                <small>Under 18 · your child · {orgName(SKATING_ORGS[s.org]!.id)} <span className="mono">#{s.number.replace(/\s+/g, '').toUpperCase()}</span>
                  {multi && ` · ${joinNames(picked(s.coaches).map((c) => `Coach ${all.find((x) => x.code === c)!.coach.firstName}`))}`}</small></div>
              <Button variant="ghost" sm onClick={() => setSkaters(skaters.filter((_, j) => j !== i))}>Remove</Button>
            </div>
          )) : <p className="fine">No skaters yet. Add at least one.</p>}
          <div className="skater skater--edit">
            <Field label="Skater’s full name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} placeholder="e.g. Ava Park"
              hint="Children under 18. A skater 18 or older signs up for their own account." />
            <OrgFields org={draft.org} number={draft.number} onOrg={(org) => setDraft({ ...draft, org })} onNumber={(number) => setDraft({ ...draft, number })} />
            <CoachPick coaches={all} on={draftCoaches} onToggle={(c) => setDraft({ ...draft, coaches: toggle(draft.coaches, c) })} />
            <div className="skater__actions">
              <Button variant="secondary" sm icon="plus" disabled={!canAdd} onClick={() => {
                setSkaters([...skaters, { ...draft, name: draft.name.trim(), coaches: draftCoaches }]);
                setDraft({ name: '', org: draft.org, number: '', coaches: null });
              }}>{skaters.length ? 'Add another skater' : 'Add skater'}</Button>
            </div>
          </div>
          <div className="actions">
            <div><Button variant="ghost" icon="arrowL" onClick={() => setStep(1)}>Back</Button></div>
            <div className="actions__r">
              <Button lg iconRight="arrowR" disabled={busy || !skaters.length}
                onClick={() => send({ ...base, relationship: 'GUARDIAN', skaters: skaters.map((s) => ({ name: s.name, skatingOrg: SKATING_ORGS[s.org]!.id as SkatingOrg, registrationNumber: s.number, coachCodes: picked(s.coaches) })) })}>
                {sendLabel}
              </Button>
            </div>
          </div>
        </Card>
      </AuthShell>
    );
  }

  // -------------------------------------------------------------- step 5
  const fam = done!;
  const doneMulti = fam.coaches.length > 1;
  const doneWho = doneMulti ? 'each coach’s approval' : `Coach ${fam.coaches[0]?.firstName ?? ''}’s approval`;
  return (
    <AuthShell step={4} ctx="Family sign up" right={null} aside={
      <Help title="While you wait">Your account shows your profile and your skaters. You can’t see your coach’s times until a skater is approved.</Help>}>
      <Card>
        <div className="hero hero--success hero--stack">
          <span className="hero__icon"><Icon name="check" size={26} /></span>
          <div><h1 className="h1">You’re in</h1><p className="lede">Signed in as {fam.contact.email}. One thing left: {doneWho}.</p></div>
        </div>
        <div className="listbox">
          {fam.skaters.map((k) => (
            <Row key={k.name} lead={<Avatar name={k.name} size="sm" />} title={k.name}
              sub={`with ${joinNames(k.coaches.map((c) => `Coach ${c.firstName}`))}`}
              side={<span className="ac-kc__list">{k.coaches.map((c) => (
                <Badge key={c.firstName + c.lastName} tone="warning" icon="clock">{doneMulti ? `Waiting for Coach ${c.firstName}` : 'Waiting for approval'}</Badge>
              ))}</span>} />
          ))}
        </div>
        <p className="fine">Booking with {doneMulti ? 'each coach opens as soon as they approve' : `Coach ${fam.coaches[0]?.firstName ?? ''} opens as soon as they approve`}. Check back here.</p>
        <Button block lg onClick={() => onDone(fam)}>Go to my account</Button>
      </Card>
    </AuthShell>
  );
}
