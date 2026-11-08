/**
 * One switch per payment type, with its handle (ADR-016 d7, amended 2026-10-12; design's payTypeRows
 * and payVerify). Used at sign-up and on Profile → Payments.
 *
 * - A type with a handle can't switch on until the handle is filled in.
 * - Switching off keeps the handle.
 * - Switching Cash App, Venmo or PayPal back on with a kept handle asks the coach to check it first.
 */
import { useState } from 'react';
import { Button, Dialog, Field, Icon, Toggle } from '../../shared/components/harbor';
import type { PaymentType, PaymentTypeName } from '../api';

export const PAY_TYPES: Array<{ type: PaymentTypeName; label: string; placeholder: string; hasHandle: boolean }> = [
  { type: 'CASH', label: 'Cash', placeholder: '', hasHandle: false },
  { type: 'VENMO', label: 'Venmo', placeholder: '@handle', hasHandle: true },
  { type: 'CASHAPP', label: 'Cash App', placeholder: '$cashtag', hasHandle: true },
  { type: 'PAYPAL', label: 'PayPal', placeholder: 'paypal.me/you', hasHandle: true },
];

/** Every type, in a fixed order, from whatever the API sent (missing ones off). */
export function allTypes(from: PaymentType[] = []): PaymentType[] {
  return PAY_TYPES.map(({ type }) => from.find((t) => t.type === type) ?? { type, on: false, handle: null });
}

interface Props {
  value: PaymentType[];
  onChange: (next: PaymentType[]) => void;
  /** Types whose handle was kept when switched off; switching them back on asks first. */
  kept: Set<PaymentTypeName>;
  errors?: Partial<Record<PaymentTypeName, string>>;
}

export function PaymentTypeRows({ value, onChange, kept, errors = {} }: Props) {
  const [verify, setVerify] = useState<PaymentTypeName | null>(null);
  const [notice, setNotice] = useState('');
  const get = (type: PaymentTypeName) => value.find((t) => t.type === type)!;
  const set = (type: PaymentTypeName, patch: Partial<PaymentType>) =>
    onChange(value.map((t) => (t.type === type ? { ...t, ...patch } : t)));

  const toggle = (type: PaymentTypeName, label: string, hasHandle: boolean) => {
    const t = get(type);
    setNotice('');
    if (t.on) return set(type, { on: false });
    if (hasHandle && !t.handle?.trim()) return setNotice(`Add your ${label} handle first.`);
    if (hasHandle && kept.has(type)) return setVerify(type);
    set(type, { on: true });
  };

  const verifying = verify ? PAY_TYPES.find((p) => p.type === verify)! : null;

  return (
    <>
      {PAY_TYPES.map(({ type, label, placeholder, hasHandle }) => {
        const t = get(type);
        const sub = !hasHandle ? 'Families can pay you in cash at the rink.'
          : t.on ? 'Shown to approved families, and a choice when you mark a lesson paid.'
            : t.handle?.trim() && kept.has(type) ? 'Off. Your handle is kept; switching it back on asks you to check it’s still right.'
              : 'Add your handle, then switch it on.';
        return (
          <div className="paytype" key={type}>
            <Toggle label={label} on={t.on} sub={sub} onToggle={() => toggle(type, label, hasHandle)} />
            {hasHandle && (
              <Field label={`${label} handle`} value={t.handle ?? ''} placeholder={placeholder} optional={!t.on}
                error={errors[type]} onChange={(v) => set(type, { handle: v })} />
            )}
          </div>
        );
      })}
      {notice && <div className="hint hint--error" role="alert"><Icon name="alert" size={14} />{notice}</div>}
      {verifying && (
        <Dialog onClose={() => setVerify(null)} labelledBy="pay-verify-title">
          <div className="dialog__icon"><Icon name="card" size={22} /></div>
          <h2 className="h2" id="pay-verify-title">Is this still your {verifying.label}?</h2>
          <p className="fine">Approved families will see it and send money to it. Check it, or change it, before switching {verifying.label} back on.</p>
          <Field label={`${verifying.label} handle`} value={get(verifying.type).handle ?? ''} placeholder={verifying.placeholder}
            onChange={(v) => set(verifying.type, { handle: v })} />
          <div className="dialog__actions">
            <Button variant="secondary" onClick={() => setVerify(null)}>Cancel</Button>
            <Button onClick={() => {
              if (!get(verifying.type).handle?.trim()) return setNotice(`Add your ${verifying.label} handle first.`);
              set(verifying.type, { on: true });
              setVerify(null);
            }}>Yes, switch it on</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
