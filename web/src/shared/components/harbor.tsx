/**
 * Harbor components in React, matching the markup of design/harbor/library.js and shared.js so the
 * copied stylesheet applies unchanged.
 */
import { Fragment, useEffect, useId, useRef, type ReactNode } from 'react';

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

export function Card({ title, sub, children, flush, className }: { title?: ReactNode; sub?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) {
  return (
    <section className={`card${flush ? ' card--flush' : ''}${className ? ' ' + className : ''}`}>
      {title && (
        <header className="card__head">
          <div><h2 className="h2">{title}</h2>{sub && <p className="card__sub">{sub}</p>}</div>
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
}

export function Field({ label, value, onChange, type = 'text', hint, error, optional, placeholder, autoComplete }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label className="label" htmlFor={id}>{label}{optional && <> <span className="label__opt">Optional</span></>}</label>
      <input id={id} className={`ctl${error ? ' is-error' : ''}`} type={type} value={value} placeholder={placeholder}
        autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined} aria-describedby={hint || error ? hintId : undefined} />
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
