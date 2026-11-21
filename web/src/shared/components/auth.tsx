/**
 * Parts the sign-in forms share on both websites (ADR-023 d11): the password rules, ticked off as they're met (the
 * design's pwRules), and the 6-digit code boxes (the design's codeBoxes).
 */
import { useId, useRef, useState } from 'react';
import { Icon } from './harbor';
import './auth.css';

/** The user pool's policy (infra/lib/identity-stack.ts): at least 8 characters with upper, lower, a number and a symbol. */
export const PASSWORD_RULES: Array<[string, (p: string) => boolean]> = [
  ['At least 8 characters', (p) => p.length >= 8],
  ['An uppercase letter', (p) => /[A-Z]/.test(p)],
  ['A lowercase letter', (p) => /[a-z]/.test(p)],
  ['A number', (p) => /[0-9]/.test(p)],
  ['A symbol (!@#$…)', (p) => /[^A-Za-z0-9]/.test(p)],
];

export function passwordOk(p: string): boolean {
  return PASSWORD_RULES.every(([, ok]) => ok(p));
}

export function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="rules">{PASSWORD_RULES.map(([t, rule]) => (
      <li key={t} className={rule(password) ? 'is-ok' : ''}><Icon name={rule(password) ? 'check' : 'x'} size={13} />{t}</li>
    ))}</ul>
  );
}

/**
 * Six boxes, one digit each. One real input underneath takes the typing and a pasted code (and the phone's offer to
 * fill in the code from the email), so it reads as a single "Code" field to a screen reader.
 */
export function CodeInput({ value, onChange, label = 'Code', error }: {
  value: string; onChange: (v: string) => void; label?: string; error?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');
  const at = Math.min(value.length, 5);
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="otp otp--input" onClick={() => input.current?.focus()}>
        <input id={id} ref={input} className="otp__real" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          value={value} aria-invalid={error ? true : undefined}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        {digits.map((d, i) => (
          <span key={i} aria-hidden="true" className={`otp__box${d.trim() ? ' is-filled' : ''}${focused && i === at ? ' is-focus' : ''}`}>{d.trim()}</span>
        ))}
      </div>
      {error && <div className="hint hint--error"><Icon name="alert" size={14} />{error}</div>}
    </div>
  );
}
