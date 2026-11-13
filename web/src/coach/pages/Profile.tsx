/**
 * Profile → Details and Profile → Payments (design: profile-details, profile-details-code-pending,
 * profile-payments, profile-payments-verify). Business email, Visibility & texts and Account aren't
 * built yet (gaps G-2, G-3, G-4).
 */
import { useState, type FormEvent } from 'react';
import { Badge, Banner, Button, Card, Dialog, Field, Icon, Select, TextArea } from '../../shared/components/harbor';
import { TIMEZONES } from '../../shared/logic/timezones';
import type { CoachApi, PaymentType, PaymentTypeName, Profile } from '../api';
import { CodeCard, CodePendingBanner } from '../components/CodeCard';
import { allTypes, PaymentTypeRows, PAY_TYPES } from '../components/PaymentTypeRows';
import { fieldErrors, payErrors } from './SignupBusiness';

const TABS: Array<[label: string, route: string | null]> = [
  ['Details', '#/profile'], ['Business email', null], ['Visibility & texts', null], ['Payments', '#/profile/payments'], ['Account', null],
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
          <CodePendingBanner profile={profile} busy={busy} onUseLogin={() => act(api.useLoginEmail)} />
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
