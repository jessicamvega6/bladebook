/**
 * One switch per payment type, with its handle (ADR-016 d7, amended 2026-10-12; design's payTypeRows
 * and payVerify). Used at sign-up and on Profile → Payments.
 *
 * - The handle box shows only while its switch is on (owner, 2026-11-08). A type switched on with no
 *   handle can't be saved: the API refuses it and names the field.
 * - Each handle has its prefix: $ for Cash App, @ for Venmo, paypal.me/ for PayPal (owner,
 *   2026-11-08). The prefix is shown in front of the box and stored with the handle.
 * - Switching off hides the box but keeps the handle.
 * - Switching Cash App, Venmo or PayPal back on with a kept handle asks the coach to check it first.
 */
import { useState } from 'react';
import { Button, Dialog, Field, Icon, Toggle } from '../../shared/components/harbor';
import type { PaymentType, PaymentTypeName } from '../api';

export const PAY_TYPES: Array<{ type: PaymentTypeName; label: string; prefix: string; placeholder: string }> = [
  { type: 'CASH', label: 'Cash', prefix: '', placeholder: '' },
  { type: 'VENMO', label: 'Venmo', prefix: '@', placeholder: 'your-name' },
  { type: 'CASHAPP', label: 'Cash App', prefix: '$', placeholder: 'yourcashtag' },
  { type: 'PAYPAL', label: 'PayPal', prefix: 'paypal.me/', placeholder: 'yourname' },
];

/** Every type, in a fixed order, from whatever the API sent (missing ones off). */
export function allTypes(from: PaymentType[] = []): PaymentType[] {
  return PAY_TYPES.map(({ type }) => from.find((t) => t.type === type) ?? { type, on: false, handle: null });
}

/** The handle without its prefix, for the box. */
export function withoutPrefix(handle: string | null, prefix: string): string {
  let h = (handle ?? '').trim();
  if (prefix === 'paypal.me/') h = h.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/^paypal\.me\//i, '');
  else while (prefix && h.startsWith(prefix)) h = h.slice(prefix.length);
  return h;
}

/** What the coach typed, stored with its prefix; empty stays empty. */
export function withPrefix(typed: string, prefix: string): string {
  const rest = withoutPrefix(typed, prefix);
  return rest ? prefix + rest : '';
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
  const get = (type: PaymentTypeName) => value.find((t) => t.type === type)!;
  const set = (type: PaymentTypeName, patch: Partial<PaymentType>) =>
    onChange(value.map((t) => (t.type === type ? { ...t, ...patch } : t)));

  const toggle = (type: PaymentTypeName, hasHandle: boolean) => {
    const t = get(type);
    if (t.on) return set(type, { on: false });
    if (hasHandle && t.handle?.trim() && kept.has(type)) return setVerify(type);
    set(type, { on: true });
  };

  const verifying = verify ? PAY_TYPES.find((p) => p.type === verify)! : null;

  return (
    <>
      {PAY_TYPES.map(({ type, label, prefix, placeholder }) => {
        const t = get(type);
        const hasHandle = !!prefix;
        const filled = !!t.handle?.trim();
        const sub = !hasHandle ? 'Families can pay you in cash at the rink.'
          : t.on && filled ? 'Shown to approved families, and a choice when you mark a lesson paid.'
            : t.on ? 'Add your handle below to finish switching it on.'
              : filled && kept.has(type) ? 'Off. Your handle is kept; switching it back on asks you to check it’s still right.'
                : 'Switch it on, then add your handle.';
        return (
          <div className="paytype" key={type}>
            <Toggle label={label} on={t.on} sub={sub} onToggle={() => toggle(type, hasHandle)} />
            {hasHandle && t.on && (
              <Field label={`${label} handle`} prefix={prefix} placeholder={placeholder} error={errors[type]}
                value={withoutPrefix(t.handle, prefix)} onChange={(v) => set(type, { handle: withPrefix(v, prefix) })} />
            )}
          </div>
        );
      })}
      {verifying && (
        <Dialog onClose={() => setVerify(null)} labelledBy="pay-verify-title">
          <div className="dialog__icon"><Icon name="card" size={22} /></div>
          <h2 className="h2" id="pay-verify-title">Is this still your {verifying.label}?</h2>
          <p className="fine">Approved families will see it and send money to it. Check it, or change it, before switching {verifying.label} back on.</p>
          <Field label={`${verifying.label} handle`} prefix={verifying.prefix} placeholder={verifying.placeholder}
            value={withoutPrefix(get(verifying.type).handle, verifying.prefix)}
            onChange={(v) => set(verifying.type, { handle: withPrefix(v, verifying.prefix) })} />
          <div className="dialog__actions">
            <Button variant="secondary" onClick={() => setVerify(null)}>Cancel</Button>
            <Button disabled={!get(verifying.type).handle?.trim()} onClick={() => {
              set(verifying.type, { on: true });
              setVerify(null);
            }}>Yes, switch it on</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
