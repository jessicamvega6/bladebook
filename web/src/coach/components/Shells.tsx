/** The signed-in shell (pill navigation) and the signed-out wizard frame, as in design/harbor/coach/app.js. */
import type { ReactNode } from 'react';
import { Brand, Icon, Stepper } from '../../shared/components/harbor';
import type { Profile } from '../api';

export const COACH_STEPS = ['Account', 'Verify login email', 'Business details', 'Business email'];

/** Pages that exist in this build; the rest are named so the coach sees where they will be. */
const NAV: Array<[label: string, route: string | null]> = [
  ['Today', '#/today'], ['Calendar', '#/calendar'], ['Schedule', '#/schedule'], ['Students', '#/students'],
  ['Lessons', null], ['Payments', null], ['Profile', '#/profile'],
];

/** {@code waiting}: skaters waiting for approval, counted on the Students tab (FeatureDecriptions/Client Sign Up). */
export function CoachShell({ profile, section, flash, children, wide, full, waiting = 0 }: {
  profile: Profile; section: string; flash?: ReactNode; children: ReactNode; wide?: boolean; full?: boolean; waiting?: number;
}) {
  return (
    <div className="app app--coach">
      <header className="nav">
        <a className="brand" href="#/today"><span className="brand__mark"><Icon name="logo" size={18} /></span><span className="brand__name">BladeBook</span></a>
        <nav className="nav__items" aria-label="Main">
          {NAV.map(([label, route]) => route
            ? <a key={label} className={`nav__item${label === section ? ' is-active' : ''}`} href={route} aria-current={label === section ? 'page' : undefined}>
                <span>{label}</span>{label === 'Students' && waiting > 0 && <span className="navcount" aria-label={`${waiting} waiting`}>{waiting}</span>}
              </a>
            : <span key={label} className="nav__item is-disabled" aria-disabled="true" title="Comes in a later batch"><span>{label}</span></span>)}
        </nav>
        <a className="nav__user" href="#/profile">
          <span className="avatar avatar--sm" aria-hidden="true">{profile.initials}</span>
          <span className="nav__user-text"><b>{profile.firstName} {profile.lastName}</b><small>Coach</small></span>
        </a>
      </header>
      <main className="main">
        <div className={`page page--${full ? 'full' : wide ? 'wide' : 'narrow'}`}>
          {flash}
          {children}
        </div>
      </main>
    </div>
  );
}

export function WizardShell({ step, children, aside, right }: { step?: number; children: ReactNode; aside?: ReactNode; right?: ReactNode }) {
  return (
    <div className="app app--wizard">
      <header className="wbar">
        <Brand />
        <span className="wbar__ctx">Coach sign up</span>
        <span className="wbar__right">{right}</span>
      </header>
      <main className="wmain">
        {step != null && <Stepper steps={COACH_STEPS} current={step} />}
        <div className={`wgrid${aside ? '' : ' wgrid--solo'}`}>
          <div className="wcol">{children}</div>
          {aside}
        </div>
      </main>
    </div>
  );
}
