/**
 * Harbor components in React, matching the markup of design/harbor/library.js and shared.js so the
 * copied stylesheet applies unchanged.
 */
import { Fragment, useEffect, useId, useRef, type ReactNode } from 'react';
import { initials } from '../logic/names';

const ICONS: Record<string, ReactNode> = {
  logo: <><path d="M8.5 3v9.2c0 1.6 1 2.7 2.7 3.2l5.6 1.7" /><path d="M4 20h16" /><path d="M6.5 20v-2" /><path d="M17.5 20v-2.3" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  alert: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  refresh: <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  arrowR: <path d="M5 12h14M12 5l7 7-7 7" />,
  arrowL: <path d="M19 12H5M12 19l-7-7 7-7" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  chevL: <path d="m15 18-6-6 6-6" />,
  chevR: <path d="m9 18 6-6-6-6" />,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  calOff: <path d="M4.18 4.18A2 2 0 0 0 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 1.82-1.18M21 15.5V6a2 2 0 0 0-2-2H9.5M3 10h7M21 10h-5.5M16 2v4M8 2v4M2 2l20 20" />,
  repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />,
  undo: <><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></>,
  ban: <><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />,
};

export function Icon({ name, size = 16 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export function Brand() {
  return (
    <span className="brand">
      <span className="brand__mark"><Icon name="logo" size={18} /></span>
      <span className="brand__name">BladeBook</span>
    </span>
  );
}

type Tone = 'success' | 'warning' | 'danger' | 'info';
const TONE_ICON: Record<Tone, string> = { success: 'check', warning: 'alert', danger: 'alert', info: 'info' };

export function Banner({ tone, title, children, icon }: { tone: Tone; title?: ReactNode; children?: ReactNode; icon?: string }) {
  return (
    <div className={`banner banner--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="banner__icon"><Icon name={icon ?? TONE_ICON[tone]} size={18} /></span>
      <div className="banner__text">
        {title && <div className="banner__title">{title}</div>}
        {children && <div className="banner__body">{children}</div>}
      </div>
    </div>
  );
}

export function Badge({ tone = 'neutral', icon, children }: { tone?: string; icon?: string; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{icon && <Icon name={icon} size={12} />}{children}</span>;
}

export function Card({ title, sub, children, flush, className, action }: {
  title?: ReactNode; sub?: ReactNode; children: ReactNode; flush?: boolean; className?: string; action?: ReactNode;
}) {
  return (
    <section className={`card${flush ? ' card--flush' : ''}${className ? ' ' + className : ''}`}>
      {title && (
        <header className="card__head">
          <div><h2 className="h2">{title}</h2>{sub && <p className="card__sub">{sub}</p>}</div>
          {action}
        </header>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}

export function Help({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <aside className="help">
      <div className="help__title"><Icon name="info" />{title}</div>
      <div className="help__body">{children}</div>
    </aside>
  );
}

interface ButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  onClick?: () => void;
  type?: 'button' | 'submit';
  block?: boolean;
  lg?: boolean;
  sm?: boolean;
  icon?: string;
  iconRight?: string;
  disabled?: boolean;
}

export function Button({ children, variant = 'primary', onClick, type = 'button', block, lg, sm, icon, iconRight, disabled }: ButtonProps) {
  const cls = `btn btn--${variant}${block ? ' btn--block' : ''}${lg ? ' btn--lg' : ''}${sm ? ' btn--sm' : ''}`;
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled}>
      {icon && <Icon name={icon} size={sm ? 14 : 16} />}<span>{children}</span>{iconRight && <Icon name={iconRight} />}
    </button>
  );
}

interface FieldProps {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  placeholder?: string;
  autoComplete?: string;
  /** Fixed text shown before the box, such as "$". Not part of {@code value}. */
  prefix?: string;
  /** Monospaced, for codes and numbers. */
  mono?: boolean;
  /** Turns pasting off (the confirm-password box). */
  noPaste?: boolean;
}

export function Field({ label, value, onChange, type = 'text', hint, error, optional, placeholder, autoComplete, prefix, mono, noPaste }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label className="label" htmlFor={id}>{label}{optional && <> <span className="label__opt">Optional</span></>}</label>
      {(() => {
        const input = (
          <input id={id} className={`ctl${error ? ' is-error' : ''}${mono ? ' mono' : ''}`} type={type} value={value} placeholder={placeholder}
            autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} onPaste={noPaste ? (e) => e.preventDefault() : undefined}
            aria-invalid={error ? true : undefined} aria-describedby={hint || error ? hintId : undefined} />
        );
        return prefix
          ? <div className="ctl-prefix"><span className="ctl-prefix__text" aria-hidden="true">{prefix}</span>{input}</div>
          : input;
      })()}
      {(hint || error) && (
        <div id={hintId} className={`hint${error ? ' hint--error' : ''}`}>{error ? <><Icon name="alert" size={14} />{error}</> : hint}</div>
      )}
    </div>
  );
}

export function TextArea({ label, value, onChange, hint, error, rows = 3 }: Omit<FieldProps, 'type'> & { rows?: number }) {
  const id = useId();
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label className="label" htmlFor={id}>{label}</label>
      <textarea id={id} className="ctl ctl--area" rows={rows} value={value} onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined} aria-describedby={`${id}-hint`} />
      {(hint || error) && <div id={`${id}-hint`} className={`hint${error ? ' hint--error' : ''}`}>{error ? <><Icon name="alert" size={14} />{error}</> : hint}</div>}
    </div>
  );
}

export function Select({ label, value, onChange, options, hint, error }: {
  label: ReactNode; value: string; onChange: (v: string) => void; options: ReadonlyArray<{ id: string; label: string }>; hint?: ReactNode; error?: string;
}) {
  const id = useId();
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="ctl" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {(hint || error) && <div className={`hint${error ? ' hint--error' : ''}`}>{error ? <><Icon name="alert" size={14} />{error}</> : hint}</div>}
    </div>
  );
}

/** Segmented control (design's SEG). */
export function Seg({ options, selected, onSelect, label }: { options: string[]; selected: number; onSelect: (i: number) => void; label: string }) {
  return (
    <div className="seg seg--block" role="group" aria-label={label}>
      {options.map((o, i) => (
        <button key={o} type="button" className={`seg__opt${i === selected ? ' is-on' : ''}`} aria-pressed={i === selected} onClick={() => onSelect(i)}>{o}</button>
      ))}
    </div>
  );
}

/** Switch row (design's TOG). */
export function Toggle({ label, on, sub, onToggle }: { label: string; on: boolean; sub?: ReactNode; onToggle: () => void }) {
  return (
    <div className="toggle-row">
      <div className="toggle-row__text">
        <div className="toggle-row__label">{label}</div>
        {sub && <div className="toggle-row__sub">{sub}</div>}
      </div>
      <button type="button" className={`switch${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onToggle}>
        <span className="switch__knob" />
      </button>
    </div>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper" aria-label="Sign-up steps">
      {steps.map((s, i) => {
        const st = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <Fragment key={s}>
            {i > 0 && <li className="step__line" aria-hidden="true" />}
            <li className={`step step--${st}`} aria-current={st === 'current' ? 'step' : undefined}>
              <span className="step__dot">{st === 'done' ? <Icon name="check" size={13} /> : i + 1}</span>
              <span className="step__label">{s}</span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

/** Modal dialog over a scrim. Escape or the scrim closes it; focus moves into it. */
export function Dialog({ children, onClose, labelledBy }: { children: ReactNode; onClose: () => void; labelledBy: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('input, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref}>{children}</div>
    </>
  );
}

/** Initials in a circle. Photos are Phase 2 (A1). */
export function Avatar({ name, size }: { name: string; size?: 'sm' | 'lg' }) {
  return <span className={`avatar${size ? ` avatar--${size}` : ''}`} aria-hidden="true">{initials(name)}</span>;
}

/** A list row (design's row and rowTitle). */
export function Row({ title, sub, lead, side, muted }: { title: ReactNode; sub?: ReactNode; lead?: ReactNode; side?: ReactNode; muted?: boolean }) {
  return (
    <div className={`row${muted ? ' row--muted' : ''}`}>
      <div className="row__main">{lead}<div><div className="row__title">{title}</div>{sub && <div className="row__sub">{sub}</div>}</div></div>
      {side && <div className="row__side">{side}</div>}
    </div>
  );
}

/** Checkbox (design's CHK). */
export function Check({ label, sub, checked, onChange, disabled }: { label: ReactNode; sub?: ReactNode; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" className="check__input" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="check__text"><span className="check__label">{label}</span>{sub && <span className="check__sub">{sub}</span>}</span>
    </label>
  );
}
