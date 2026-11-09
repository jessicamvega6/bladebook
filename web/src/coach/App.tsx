/**
 * The coach website. Batch 1: local sign-in stand-in → sign-up step 3 (and step 4 when a different
 * business email waits for its link) → Today and Profile. Batch 2: Schedule (hub and weekly editor) and
 * Calendar (month, week and day). Batch 3: Students and Waiting for approval, with the waiting count on the
 * Students tab and Today's new-families card.
 *
 * "First sign-in completes sign-up if the profile is missing" (ADR-MASTER section 4): a 404 on the
 * profile shows step 3.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../shared/api/client';
import { getToken, signOut } from '../shared/auth/localAuth';
import { Banner } from '../shared/components/harbor';
import { coachApi, scheduleApi, studentApi, type Profile, type StudentsDto } from './api';
import { CoachShell } from './components/Shells';
import { Calendar, type CalendarRoute } from './pages/Calendar';
import { LocalSignIn } from './pages/LocalSignIn';
import { ProfileDetails, ProfilePayments } from './pages/Profile';
import { ScheduleHub, WeeklyEditor } from './pages/Schedule';
import { SignupBusiness } from './pages/SignupBusiness';
import { SignupConfirm } from './pages/SignupConfirm';
import { SignupDone } from './pages/SignupDone';
import { Students } from './pages/Students';
import { Today } from './pages/Today';
import { todayIn, weekStart } from '../shared/logic/schedule';

type Load =
  | { state: 'loading' }
  | { state: 'no-profile'; loginEmail: string }
  | { state: 'ready'; profile: Profile }
  | { state: 'error'; message: string };

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/today');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/today');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

/** #/calendar, #/calendar/month/2026-11-01, #/calendar/week/2026-11-08, #/calendar/day/2026-11-10. */
function calendarRoute(route: string, timeZone: string): CalendarRoute | null {
  if (route === '#/calendar') return { view: 'week', date: weekStart(todayIn(timeZone)) };
  const m = /^#\/calendar\/(month|week|day)\/(\d{4}-\d{2}-\d{2})$/.exec(route);
  if (!m) return null;
  const view = m[1] as CalendarRoute['view'];
  return { view, date: view === 'month' ? `${m[2].slice(0, 8)}01` : m[2] };
}

function go(route: string) {
  window.location.hash = route;
}

/** The login email from the token (display only; the API reads it from the verified token). */
function emailFromToken(token: string): string {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(payload)) as { email?: string }).email ?? '';
  } catch {
    return '';
  }
}

export function App() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [notice, setNotice] = useState('');
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const route = useHashRoute();
  const api = useMemo(() => (token ? coachApi(token) : null), [token]);
  const schedules = useMemo(() => (token ? scheduleApi(token) : null), [token]);
  const studentsApi = useMemo(() => (token ? studentApi(token) : null), [token]);
  const [students, setStudents] = useState<StudentsDto | null>(null);
  const [studentsError, setStudentsError] = useState('');
  useEffect(() => { if (route !== '#/schedule') setFlash(''); }, [route]);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      signOut();
      setToken(null);
      setNotice(e.code === 'SIGN_IN_AGAIN' ? 'You’ve been signed in for a while. Please sign in again.' : 'Please sign in.');
      return;
    }
    setLoad({ state: 'error', message: e instanceof Error ? e.message : 'Something went wrong. Try again.' });
  }, []);

  useEffect(() => {
    if (!api || !token) return;
    let live = true;
    // A fresh token (the sign-in again before a schedule save) mustn't unmount the page and lose its edits.
    setLoad((l) => (l.state === 'ready' ? l : { state: 'loading' }));
    api.profile()
      .then((profile) => live && setLoad({ state: 'ready', profile }))
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.code === 'NO_PROFILE') setLoad({ state: 'no-profile', loginEmail: emailFromToken(token) });
        else handleError(e);
      });
    return () => { live = false; };
  }, [api, token, handleError]);

  // The waiting count on the Students tab and Today's sign-ups card; reloaded on each page change.
  const ready = load.state === 'ready';
  useEffect(() => {
    if (!studentsApi || !ready) return;
    let live = true;
    // A count that fails to load mustn't take over Today; only the Students page says so.
    studentsApi.list()
      .then((d) => { if (live) { setStudents(d); setStudentsError(''); } })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 401) handleError(e);
        else setStudentsError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      });
    return () => { live = false; };
  }, [studentsApi, ready, route, handleError]);

  const setProfile = (profile: Profile) => setLoad({ state: 'ready', profile });

  let page;
  if (!token || !api || !schedules || !studentsApi) {
    page = <LocalSignIn notice={notice} onSignedIn={(t) => { setNotice(''); setToken(t); go('#/today'); }} />;
  } else if (load.state === 'loading') {
    page = <div className="app"><main className="main" aria-busy="true"><p className="muted">Loading…</p></main></div>;
  } else if (load.state === 'error') {
    page = <div className="app"><main className="main"><Banner tone="danger" title="Couldn’t load your account">{load.message}</Banner></main></div>;
  } else if (load.state === 'no-profile') {
    page = (
      <SignupBusiness api={api} loginEmail={load.loginEmail} onDone={(p) => {
        setProfile(p);
        go(p.codeWorks ? '#/signup/done' : '#/signup/confirm');
      }} />
    );
  } else {
    const profile = load.profile;
    const useLogin = async () => {
      setBusy(true);
      try {
        setProfile(await api.useLoginEmail());
      } catch (e) {
        handleError(e);
      } finally {
        setBusy(false);
      }
    };
    if (route === '#/signup/confirm' && !profile.codeWorks) {
      page = <SignupConfirm api={api} profile={profile} onChange={(p) => { setProfile(p); if (p.codeWorks) go('#/signup/done'); }} onFinish={() => go('#/today')} />;
    } else if (route === '#/signup/done' || route === '#/signup/confirm') {
      page = <SignupDone profile={profile} />;
    } else if (route === '#/schedule') {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Schedule" wide><ScheduleHub api={schedules} profile={profile} flash={flash} onError={handleError} /></CoachShell>;
    } else if (route === '#/schedule/weekly') {
      page = (
        <CoachShell profile={profile} waiting={students?.pending.length} section="Schedule" full>
          <WeeklyEditor api={schedules} profile={profile} onError={handleError} onToken={setToken}
            onSaved={() => { go('#/schedule'); setFlash('Saved. Your schedule is live.'); window.scrollTo(0, 0); }} />
        </CoachShell>
      );
    } else if (calendarRoute(route, profile.coachTimezone)) {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Calendar" wide><Calendar api={schedules} route={calendarRoute(route, profile.coachTimezone)!} onError={handleError} /></CoachShell>;
    } else if (route === '#/students' || route === '#/students/pending') {
      page = (
        <CoachShell profile={profile} section="Students" wide waiting={students?.pending.length}>
          {students
            ? <Students api={studentsApi} profile={profile} data={students} tab={route === '#/students' ? 'students' : 'pending'} onChange={setStudents} onError={handleError} />
            : studentsError ? <Banner tone="danger" title="Couldn’t load your students">{studentsError}</Banner>
              : <p className="muted" aria-busy="true">Loading…</p>}
        </CoachShell>
      );
    } else if (route === '#/profile') {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Profile"><ProfileDetails key={profile.coachCode} api={api} profile={profile} onChange={setProfile} /></CoachShell>;
    } else if (route === '#/profile/payments') {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Profile"><ProfilePayments api={api} profile={profile} onChange={setProfile} /></CoachShell>;
    } else {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Today" wide><Today profile={profile} onUseLogin={useLogin} busy={busy} pending={students?.pending} /></CoachShell>;
    }
  }

  return (
    <div className="bb" data-layout="top">
      {page}
    </div>
  );
}
