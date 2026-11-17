/**
 * Profile → Details, Business email, Visibility & texts, and Payments (design: profile-details,
 * profile-details-code-pending, profile-email, profile-visibility, profile-payments, profile-payments-verify). Account
 * isn't built yet (gap G-4). The texts switch waits on ADR-007 d8 (G-3).
 */
import { useState, type FormEvent } from 'react';
import { Badge, Banner, Button, Card, Dialog, Field, Help, Icon, Select, TextArea, Toggle } from '../../shared/components/harbor';
import { TIMEZONES } from '../../shared/logic/timezones';
import type { CoachApi, EmailRow, PaymentType, PaymentTypeName, Profile } from '../api';
import { CodeCard, CodePendingBanner } from '../components/CodeCard';
import { linkExpired, linkTime } from '../components/linkTime';
import { allTypes, PaymentTypeRows, PAY_TYPES } from '../components/PaymentTypeRows';
import { fieldErrors, payErrors } from './SignupBusiness';

const TABS: Array<[label: string, route: string | null]> = [
  ['Details', '#/profile'], ['Business email', '#/profile/email'], ['Visibility & texts', '#/profile/visibility'], ['Payments', '#/profile/payments'], ['Account', null],
];

function ProfileHead({ tab }: { tab: string }) {
  return (
    <>
      <div className="phead"><div className="phead__text"><h1 className="h1">Profile</h1>
        <p className="lede">How families see and reach you, and how you sign in.</p></div></div>
      <nav className="tabs mp-tabs" aria-label="Profile sections">
        {TABS.map(([label, route]) => route
          ? <a key={label} className={`tabs__t${label === tab ? ' is-on' : ''}`} href={route} aria-current={label === tab ? 'page' : undefined}>{label}</a>
          : <span key={label} className="tabs__t is-disabled" aria-disabled="true" title="Comes in a later batch">{label}</span>)}
      </nav>
    </>
  );
}

function SaveBar({ busy, saved }: { busy: boolean; saved: boolean }) {
  return (
    <div className="actions">
      <div>{saved && <span className="muted-sm" role="status"><Icon name="check" size={14} /> Saved.</span>}</div>
      <div className="actions__r"><Button type="submit" disabled={busy}>Save</Button></div>
    </div>
  );
}

interface PageProps { api: CoachApi; profile: Profile; onChange: (p: Profile) => void }

export function ProfileDetails({ api, profile, onChange }: PageProps) {
  const [firstName, setFirst] = useState(profile.firstName);
  const [lastName, setLast] = useState(profile.lastName);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [timezone, setTimezone] = useState(profile.coachTimezone);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotated, setRotated] = useState('');
  const [resent, setResent] = useState('');

  const act = async (call: () => Promise<Profile>, after?: (p: Profile) => void) => {
    setBusy(true);
    setError('');
    setErrors({});
    setSaved(false);
    try {
      const p = await call();
      onChange(p);
      after?.(p);
    } catch (e) {
      const f = fieldErrors(e);
      setErrors(f);
      if (!Object.keys(f).length) setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    act(() => api.saveDetails({ firstName, lastName, phone, coachTimezone: timezone }), () => setSaved(true));
  };

  const initials = ((firstName.trim()[0] ?? '') + (lastName.trim()[0] ?? '')).toUpperCase();

  return (
    <>
      <ProfileHead tab="Details" />
      {error && <Banner tone="danger">{error}</Banner>}
      {rotated && <Banner tone="success">Your new code is {rotated}. The old one stopped working.</Banner>}
      {resent && <Banner tone="success">We sent a new link to {resent}. The one sent before no longer works.</Banner>}
      <form onSubmit={save} noValidate>
        <Card title="About you">
          <div className="grid2">
            <Field label="First name" value={firstName} onChange={setFirst} error={errors.firstName} />
            <Field label="Last name" value={lastName} onChange={setLast} error={errors.lastName} />
          </div>
          <div className="hint">Shown on your booking page and in every email families get.</div>
          <div className="grid2">
            <Field label="Phone" type="tel" value={phone} onChange={setPhone} error={errors.phone}
              hint="Families see it only if you switch it on under Visibility." />
            <Select label="Time zone" value={timezone} onChange={setTimezone} options={TIMEZONES} error={errors.coachTimezone}
              hint="Lesson times and your emails use it." />
          </div>
          <div className="fieldset">
            <div className="label">Profile photo <Badge>Phase 2</Badge></div>
            <div className="mp-photo">
              <span className="avatar avatar--lg" aria-hidden="true">{initials}</span>
              <div className="mp-photo__text"><b>Your initials</b><span className="hint">Families see your initials. Adding a photo comes in Phase 2.</span></div>
            </div>
          </div>
          <div className="fieldset">
            <div className="label">Currency</div>
            <div className="input input--readonly"><span className="input__val">{profile.currency === 'USD' ? 'USD — US dollar' : 'CAD — Canadian dollar'}</span><Icon name="lock" size={14} /></div>
            <div className="hint">Every lesson is priced in this. Changing currency comes in Phase 2.</div>
          </div>
        </Card>
        <Card title="Coach code">
          <CodePendingBanner profile={profile} busy={busy} onUseLogin={() => act(api.useLoginEmail)}
            onResend={() => { const a = profile.pendingBusinessEmail ?? ''; act(() => api.resendLink(a), () => setResent(a)); }} />
          <CodeCard profile={profile} extra={<Button variant="ghost" icon="refresh" onClick={() => setRotating(true)}>Rotate code</Button>} />
          <p className="fine">Shared your code somewhere you didn’t mean to? Rotate it. The old code stops working for new sign-ups. Families already signed up aren’t affected.</p>
        </Card>
        <SaveBar busy={busy} saved={saved} />
      </form>
      {rotating && (
        <Dialog onClose={() => setRotating(false)} labelledBy="rotate-title">
          <div className="dialog__icon dialog__icon--danger"><Icon name="refresh" size={22} /></div>
          <h2 className="h2" id="rotate-title">Rotate your coach code?</h2>
          <div className="dialog__what"><b>{profile.coachCode}</b><span>stops working for new sign-ups</span></div>
          <p className="fine">You’ll get a new code to share. Families already signed up keep booking as before.</p>
          <div className="dialog__actions">
            <Button variant="secondary" onClick={() => setRotating(false)}>Keep this code</Button>
            <Button variant="danger" disabled={busy} onClick={() => act(api.rotateCode, (p) => { setRotating(false); setRotated(p.coachCode); })}>Rotate code</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

/**
 * Profile → Business email (design: profile-email; ADR-016, amended 2026-11-12). The list: the login email, the other
 * confirmed addresses (pick one and Save), and the addresses waiting for their link, each with Resend link and Remove.
 * "Use a new address" emails a confirmation link at once. In the design a waiting row has "I’ve clicked the link", the
 * demo's stand-in for the email; here it's Resend link, and the link itself confirms (the confirm page, #/confirm-email/…).
 */
export function ProfileBusinessEmail({ api, profile, onChange }: PageProps) {
  const [chosen, setChosen] = useState(profile.businessEmail);
  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const act = async (call: () => Promise<Profile>, done: (p: Profile) => void, onField?: (message: string) => void) => {
    setBusy(true);
    setError('');
    setFlash('');
    setSaved(false);
    try {
      const p = await call();
      onChange(p);
      done(p);
    } catch (e) {
      const f = fieldErrors(e);
      if (onField && f.address) onField(f.address);
      else setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const a = newEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) { setEmailErr('Enter an email address like you@example.com.'); return; }
    setEmailErr('');
    act(() => api.addBusinessEmail(a), () => { setAdding(false); setNewEmail(''); setFlash(`Confirmation link sent to ${a}.`); }, setEmailErr);
  };
  const resend = (a: string) => act(() => api.resendLink(a), () => setFlash(`Sent a new link to ${a}. The one sent before no longer works.`));
  const remove = (a: string) => act(() => api.removeBusinessEmail(a), () => setFlash(`${a} is off your list.`));
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!chosen || chosen === profile.businessEmail) { setSaved(true); return; }
    act(() => api.chooseBusinessEmail(chosen), (p) => { setChosen(p.businessEmail); setSaved(true); });
  };

  const row = (r: EmailRow) => {
    if (r.waiting) {
      const expired = linkExpired(r.linkExpiresAt);
      return (
        <div key={r.address} className="rcard mp-rcard--pending">
          <span className="rcard__icon"><Icon name="mail" size={20} /></span>
          <div className="rcard__text"><div className="rcard__title">{r.address}</div>
            <div className="rcard__sub">{expired
              ? 'The link has expired. Resend it to get a new one.'
              : <>Confirmation link sent. You can choose it once it’s confirmed. The link works until {linkTime(r.linkExpiresAt!, profile.coachTimezone)}.</>}</div></div>
          <span className="cellbtns">
            <Button variant="ghost" sm disabled={busy} onClick={() => resend(r.address)}>Resend link</Button>
            <button type="button" className="link link--danger" disabled={busy} onClick={() => remove(r.address)}>Remove</button>
          </span>
        </div>
      );
    }
    const on = r.address === chosen;
    return (
      <div key={r.address} className="mp-rrow">
        <button type="button" className={`rcard${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => { setChosen(r.address); setSaved(false); }}>
          <span className="rcard__icon"><Icon name="mail" size={20} /></span>
          <span className="rcard__text"><span className="rcard__title">{r.address}</span>
            <span className="rcard__sub">{on ? 'Current · confirmed' : r.login ? 'Your login email · verified' : 'Confirmed'}</span></span>
          <span className={`radio${on ? ' is-on' : ''}`} />
        </button>
        {!on && !r.login && !r.current
          && <button type="button" className="link link--danger mp-remove" disabled={busy} onClick={() => remove(r.address)}>Remove</button>}
      </div>
    );
  };

  return (
    <>
      <ProfileHead tab="Business email" />
      {error && <Banner tone="danger">{error}</Banner>}
      {flash && <Banner tone="success">{flash}</Banner>}
      <form onSubmit={save} noValidate>
        <Card title="Business email" sub="The reply address on lesson reminders and every other automatic email. Replies from families come here.">
          <div className="mp-radios">{profile.emails.map(row)}</div>
          {adding ? (
            <div className="mp-add">
              <Field label="New business email" type="email" value={newEmail} onChange={setNewEmail} placeholder="you@example.com" error={emailErr || undefined} />
              <div className="cellbtns">
                <Button variant="secondary" sm onClick={() => { setAdding(false); setEmailErr(''); }}>Cancel</Button>
                <Button sm disabled={busy} onClick={add}>Send confirmation link</Button>
              </div>
            </div>
          ) : (
            <button type="button" className="addrow" onClick={() => { setAdding(true); setNewEmail(''); setEmailErr(''); }}>
              <Icon name="plus" size={16} />Use a new address
            </button>
          )}
        </Card>
        <Help title="Why a new address needs a link first">
          A typo would send every family’s replies to a stranger. Families keep seeing your current address until the new one is confirmed.
        </Help>
        <SaveBar busy={busy} saved={saved} />
      </form>
    </>
  );
}

export function ProfilePayments({ api, profile, onChange }: PageProps) {
  const [instructions, setInstructions] = useState(profile.paymentInstructions ?? '');
  const [types, setTypes] = useState<PaymentType[]>(allTypes(profile.paymentTypes));
  // A handle saved while its type is off is "kept": switching it back on asks the coach to check it.
  const kept = new Set<PaymentTypeName>(allTypes(profile.paymentTypes).filter((t) => !t.on && t.handle).map((t) => t.type));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError('');
    setSaved(false);
    try {
      const p = await api.savePayments({ paymentInstructions: instructions, paymentTypes: types });
      onChange(p);
      setTypes(allTypes(p.paymentTypes));
      setSaved(true);
    } catch (err) {
      const f = fieldErrors(err);
      setErrors(f);
      if (!Object.keys(f).length) setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const chips = [...PAY_TYPES.filter((p) => types.find((t) => t.type === p.type)?.on).map((p) => p.label), 'Other'];

  return (
    <>
      <ProfileHead tab="Payments" />
      {error && <Banner tone="danger">{error}</Banner>}
      <form onSubmit={save} noValidate>
        <Card title="Getting paid">
          <TextArea label="How families pay you" value={instructions} onChange={setInstructions} error={errors.paymentInstructions}
            hint="Always included in payment reminders. BladeBook doesn’t take payments itself." />
          <div className="fieldset">
            <div className="label">Payment types</div>
            <PaymentTypeRows value={types} onChange={setTypes} kept={kept} errors={payErrors(errors)} />
            <div className="hint">Each type you switch on is shown to approved families and in payment reminders. Switch one off any time; lessons you’ve already marked keep how they were paid.</div>
          </div>
        </Card>
        <Card title="How families paid" sub="Only you see this.">
          <div className="mp-chips">{chips.map((c) => <span key={c} className="badge badge--neutral">{c}</span>)}</div>
          <div className="hint">When you mark a lesson paid you can note how the family paid. The choices are the payment types you’ve switched on, plus Other. Lessons you’ve already marked keep what you chose.</div>
        </Card>
        <SaveBar busy={busy} saved={saved} />
      </form>
    </>
  );
}

/**
 * Profile → Visibility & texts (design: profile-visibility; ADR-MASTER section 4, "What families see"; A3). Families see
 * the phone or email only once the coach has approved one of their skaters; the server enforces that, not this page.
 */
export function ProfileVisibility({ api, profile, onChange }: PageProps) {
  const [showPhone, setShowPhone] = useState(profile.showPhone);
  const [showEmail, setShowEmail] = useState(profile.showEmail);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const shown = PAY_TYPES.flatMap((t) => {
    const p = profile.paymentTypes.find((x) => x.type === t.type);
    return p?.on ? [p.handle ? `${t.label} ${t.prefix}${p.handle}` : t.label] : [];
  });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setErrors({});
    setSaved(false);
    try {
      onChange(await api.saveVisibility({ showPhone, showEmail }));
      setSaved(true);
    } catch (err) {
      const f = fieldErrors(err);
      setErrors(f);
      if (!Object.keys(f).length) setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ProfileHead tab="Visibility & texts" />
      {error && <Banner tone="danger">{error}</Banner>}
      <form onSubmit={save} noValidate>
        <Card title="What families can see" sub="Only families you’ve approved. Never someone who has only entered your coach code." flush>
          <Toggle label="Phone number" on={showPhone} sub={profile.phone ?? 'No phone number yet. Add one under Details.'} onToggle={() => { setShowPhone(!showPhone); setSaved(false); }} />
          {errors.showPhone && <div className="hint hint--error mp-toggle-err"><Icon name="alert" size={14} />{errors.showPhone}</div>}
          <Toggle label="Email address" on={showEmail} sub={profile.businessEmail ?? `${profile.pendingBusinessEmail ?? 'Your business email'} isn’t confirmed yet.`}
            onToggle={() => { setShowEmail(!showEmail); setSaved(false); }} />
          {errors.showEmail && <div className="hint hint--error mp-toggle-err"><Icon name="alert" size={14} />{errors.showEmail}</div>}
          <div className="toggle-row"><div className="toggle-row__text"><div className="toggle-row__label">Payment types</div>
            <div className="toggle-row__sub">{shown.join(' · ') || 'None switched on.'} Each has its own switch under <a className="link" href="#/profile/payments">Payments</a>.</div></div></div>
          <div className="card__note"><Icon name="info" size={14} /> Your payment instructions always appear in payment-reminder emails. Replies always reach your business email, whichever of these are on.</div>
        </Card>
        <Card title="Texts to you" flush
          sub={`You get an email when a family cancels inside your ${profile.requiredNoticeHours}-hour notice period. Other cancellations just free the time. Texts are extra.`}>
          {/* Not in the design: the switch is off until texts are set up (ADR-007 d8, gap G-3). */}
          <div className="toggle-row">
            <div className="toggle-row__text"><div className="toggle-row__label">Text me when a family cancels late <Badge>Not yet</Badge></div>
              <div className="toggle-row__sub">Texts aren’t set up yet. Until they are, you get the email.</div></div>
            <button type="button" className="switch" role="switch" aria-checked={false} aria-label="Text me when a family cancels late" disabled><span className="switch__knob" /></button>
          </div>
          <div className="smsprev"><div className="smsprev__label">Example</div><div className="smsprev__bubble">BladeBook: Mia C. cancelled Fri 16 Oct 8:30am, inside your notice period. See email.</div></div>
        </Card>
        <SaveBar busy={busy} saved={saved} />
      </form>
    </>
  );
}
