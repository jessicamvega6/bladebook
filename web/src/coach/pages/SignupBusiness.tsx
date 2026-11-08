/** Sign-up step 3, "How families reach you" (design: signup-3-business, signup-3-business-same). */
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../shared/api/client';
import { Badge, Banner, Button, Card, Field, Help, Seg, Select, TextArea } from '../../shared/components/harbor';
import { TIMEZONES } from '../../shared/logic/timezones';
import type { CoachApi, PaymentType, PaymentTypeName, Profile } from '../api';
import { allTypes, PaymentTypeRows } from '../components/PaymentTypeRows';
import { WizardShell } from '../components/Shells';
import { savedNames } from './LocalSignIn';

export function fieldErrors(err: unknown): Record<string, string> {
  return err instanceof ApiError && err.field ? { [err.field]: err.message } : {};
}

export function payErrors(errors: Record<string, string>): Partial<Record<PaymentTypeName, string>> {
  return { VENMO: errors.venmoHandle, CASHAPP: errors.cashappHandle, PAYPAL: errors.paypalHandle };
}

export function SignupBusiness({ api, loginEmail, onDone }: { api: CoachApi; loginEmail: string; onDone: (p: Profile) => void }) {
  const names = savedNames();
  const [firstName, setFirst] = useState(names.firstName);
  const [lastName, setLast] = useState(names.lastName);
  const [useLogin, setUseLogin] = useState(false);
  const [businessEmail, setBusinessEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [currency, setCurrency] = useState<'USD' | 'CAD'>('USD');
  const [instructions, setInstructions] = useState('');
  const [types, setTypes] = useState<PaymentType[]>(allTypes());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError('');
    try {
      onDone(await api.signup({
        firstName, lastName, useLoginEmail: useLogin, businessEmail: useLogin ? null : businessEmail,
        phone, coachTimezone: timezone, currency, paymentInstructions: instructions, paymentTypes: types,
      }));
    } catch (err) {
      const f = fieldErrors(err);
      setErrors(f);
      if (!Object.keys(f).length) setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  // Names are asked for at step 1, which Cognito owns; until it exists they're editable here.
  const needNames = !names.firstName || !names.lastName || errors.firstName || errors.lastName;

  return (
    <WizardShell step={2} aside={
      <Help title="Why a business email?">
        It’s the only address families see. Emails go out as “{firstName || 'You'} {lastName} via BladeBook” and replies
        come to you. Your login email stays private unless you choose it here.
      </Help>}>
      <Card>
        <form onSubmit={submit} noValidate>
          <h1 className="h1">How families reach you</h1>
          <p className="lede">You can change any of this later from your profile.</p>
          {error && <Banner tone="danger">{error}</Banner>}
          {Object.keys(errors).length > 0 && <Banner tone="danger">Check the field marked below.</Banner>}
          {needNames && (
            <div className="grid2">
              <Field label="First name" value={firstName} onChange={setFirst} error={errors.firstName} />
              <Field label="Last name" value={lastName} onChange={setLast} error={errors.lastName} />
            </div>
          )}
          <div className="fieldset">
            <div className="label" id="biz-label">Business email</div>
            <Seg label="Business email" options={['Use my login email', 'Use a different email']} selected={useLogin ? 0 : 1}
              onSelect={(i) => setUseLogin(i === 0)} />
            {useLogin ? (
              <>
                <div className="input input--readonly"><span className="input__val">{loginEmail}</span><Badge tone="success" icon="check">Verified</Badge></div>
                <div className="hint">Same as your login email, so no extra check is needed.</div>
              </>
            ) : (
              <Field label="Business email address" type="email" value={businessEmail} onChange={setBusinessEmail}
                error={errors.businessEmail} hint="We’ll send a confirmation link to this address." autoComplete="email" />
            )}
          </div>
          <div className="grid2">
            <Field label="Phone" type="tel" value={phone} onChange={setPhone} optional error={errors.phone} autoComplete="tel" />
            <Select label="Time zone" value={timezone} onChange={setTimezone} options={TIMEZONES} error={errors.coachTimezone} />
          </div>
          <div className="fieldset">
            <div className="label">Currency</div>
            <Seg label="Currency" options={['USD', 'CAD']} selected={currency === 'USD' ? 0 : 1} onSelect={(i) => setCurrency(i === 0 ? 'USD' : 'CAD')} />
            <div className="hint">Chosen once. Every lesson is priced in it.</div>
          </div>
          <TextArea label="How families pay you" value={instructions} onChange={setInstructions} error={errors.paymentInstructions}
            hint="Included in payment reminders. BladeBook doesn’t take payments itself." />
          <div className="fieldset">
            <div className="label">Payment types <span className="label__opt">Optional</span></div>
            <PaymentTypeRows value={types} onChange={setTypes} kept={new Set()} errors={payErrors(errors)} />
            <div className="hint">Switch on each way families can pay you. You can change these any time from your profile.</div>
          </div>
          <Button type="submit" block lg disabled={busy}>{useLogin ? 'Finish setup' : 'Save and continue'}</Button>
        </form>
      </Card>
    </WizardShell>
  );
}
