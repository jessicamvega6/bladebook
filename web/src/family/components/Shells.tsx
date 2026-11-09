/** The signed-in family shell and the signed-out frame, as in design/harbor/client/app.js. */
import type { ReactNode } from 'react';
import { Brand, Icon, Stepper } from '../../shared/components/harbor';
import { initials } from '../../shared/logic/names';
import type { Family } from '../api';

const FAMILY_STEPS = ['Coach code', 'Your details', 'Verify email', 'Skaters', 'Done'];

/**
 * A waiting family sees only Home and Profile (ADR-022 d6). Once a coach approves, the booking pages are
 * named; they arrive with Batch 4.
 */
function nav(family: Family): Array<[string, string | null]> {
  return family.waiting
    ? [['Home', '#/home'], ['Profile', '#/profile']]
    : [['Home', '#/home'], ['Book a lesson', null], ['My bookings', null], ['Profile', '#/profile']];
}

export function FamilyShell({ family, section, children, wide, flash }: {
  family: Family; section: string; children: ReactNode; wide?: boolean; flash?: ReactNode;
}) {
  const name = `${family.contact.firstName} ${family.contact.lastName}`;
  const coaches = family.coaches;
  return (
    <div className="app app--family">
      <header className="nav">
        <a className="brand" href="#/home"><span className="brand__mark"><Icon name="logo" size={18} /></span><span className="brand__name">BladeBook</span></a>
        <nav className="nav__items" aria-label="Main">
          {nav(family).map(([label, route]) => route
            ? <a key={label} className={`nav__item${label === section ? ' is-active' : ''}`} href={route} aria-current={label === section ? 'page' : undefined}><span>{label}</span></a>
            : <span key={label} className="nav__item is-disabled" aria-disabled="true" title="Comes in a later batch"><span>{label}</span></span>)}
        </nav>
        <a className="nav__user" href="#/profile">
          <span className="avatar avatar--sm" aria-hidden="true">{initials(name)}</span>
          <span className="nav__user-text"><b>{name}</b>
            <small>{family.contact.relationship === 'SELF' ? 'Skater' : 'Guardian'} · {coaches.length === 1 ? `Coach ${coaches[0]!.firstName}` : `${coaches.length} coaches`}</small></span>
        </a>
      </header>
      <main className="main">
        <div className={`page page--${wide ? 'wide' : 'narrow'}`}>
          {flash}
          {children}
        </div>
      </main>
    </div>
  );
}

/** Signed out: brand bar, the sign-up stepper when there's a step, a centred card and an optional aside. */
export function AuthShell({ step, ctx = 'For families', right, aside, children }: {
  step?: number; ctx?: string; right?: ReactNode; aside?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="app app--wizard">
      <header className="wbar">
        <Brand />
        <span className="wbar__ctx">{ctx}</span>
        <span className="wbar__right">{right === undefined ? <>New here? <a className="link" href="#/signup">Sign up with a coach code</a></> : right}</span>
      </header>
      <main className="wmain">
        {step != null && <Stepper steps={FAMILY_STEPS} current={step} />}
        <div className={`wgrid${aside ? '' : ' wgrid--solo'}`}>
          <div className="wcol">{children}</div>
          {aside}
        </div>
      </main>
    </div>
  );
}
