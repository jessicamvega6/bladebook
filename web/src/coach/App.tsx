/**
 * The coach website. Batch 18: real sign-in, BladeBook's own forms calling Cognito (ADR-023 d11): Log in, Forgot
 * password, sign-up steps 1–2, Profile → Account, signing in again before a schedule save. Batch 1: sign-up step 3 (and step 4 when a different
 * business email waits for its link) → Today and Profile. Batch 2: Schedule (hub and weekly editor) and
 * Calendar (month, week and day). Batch 3: Students and Waiting for approval, with the waiting count on the
 * Students tab and Today's new-families card. Batch 14: Profile → Business email (#/profile/email) and the confirm page
 * the confirmation email's link opens (#/confirm-email/<token>).
 *
 * "First sign-in completes sign-up if the profile is missing" (ADR-MASTER section 4): a 404 on the
 * profile shows step 3.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../shared/api/client';
import { coachAuth, emailFromToken } from '../shared/auth';
import { Banner } from '../shared/components/harbor';
import { coachApi, financesApi, lessonsApi, paymentsApi, scheduleApi, studentApi, todayApi, type Profile, type StudentsDto } from './api';
import { CoachShell } from './components/Shells';
import { Calendar, type CalendarRoute } from './pages/Calendar';
import { Forgot, Login, SignupAccount, SignupVerify, signupEmail } from './pages/SignIn';
import { ProfileAccount, ProfileBusinessEmail, ProfileDetails, ProfilePayments, ProfileVisibility } from './pages/Profile';
import { ConfirmEmail } from './pages/ConfirmEmail';
import { ChooseDates, DeleteDates, ScheduleEditor, ScheduleHub, SIGNED_OUT_WRONG_PASSWORDS, TimeOffForm, type Saved } from './pages/Schedule';
import { SaveStatus } from './pages/ScheduleReview';
import { Lessons } from './pages/Lessons';
import { Payments } from './pages/Payments';
import { Finances } from './pages/Finances';
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

/** The business-email confirm page: #/confirm-email/<token>. The token stays in the hash, so it never reaches a server log. */
const CONFIRM = '#/confirm-email/';

function go(route: string) {
  window.location.hash = route;
}

const auth = coachAuth();

export function App() {
  // The sign-in's current ID token: undefined while this tab's sign-in is looked up, null when signed out. Requests
  // get theirs from the sign-in itself (auth.idToken), refreshed when it expires; this one marks who is signed in.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    // Opening the plain address (no page named) always starts at the sign-in page, signed out, so the last coach
    // in this tab isn't resumed. A link to a page inside the site, or a refresh, keeps the sign-in (owner, 2026-11-09).
    const hash = window.location.hash;
    const plain = hash === '' || hash === '#' || hash === '#/';
    let live = true;
    (plain ? auth.signOut().then(() => null) : auth.idToken())
      .then((t) => { if (live) setToken(t); })
      .catch(() => { if (live) setToken(null); });
    return () => { live = false; };
  }, []);
  // Log in shows once the tab's sign-in is gone, so a page opened next can't find it.
  const signOut = useCallback(async () => {
    await auth.signOut();
    setToken(null);
  }, []);
  const signedIn = useCallback(async () => {
    setNotice('');
    setToken(await auth.idToken());
  }, []);
  const [notice, setNotice] = useState('');
  const [noticeOk, setNoticeOk] = useState(false);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [note, setNote] = useState(''); // Today: what Resend link did
  // What the last accepted review said, for the save status page that follows it.
  const [saved, setSaved] = useState<Saved | null>(null);
  const afterSave = useCallback((s: Saved) => { setSaved(s); go('#/schedule/status'); window.scrollTo(0, 0); }, []);
  const route = useHashRoute();
  const api = useMemo(() => (token ? coachApi(auth.idToken) : null), [token]);
  const schedules = useMemo(() => (token ? scheduleApi(auth.idToken) : null), [token]);
  const lessons = useMemo(() => (token ? lessonsApi(auth.idToken) : null), [token]);
  const payments = useMemo(() => (token ? paymentsApi(auth.idToken) : null), [token]);
  const finances = useMemo(() => (token ? financesApi(auth.idToken) : null), [token]);
  const todays = useMemo(() => (token ? todayApi(auth.idToken) : null), [token]);
  const studentsApi = useMemo(() => (token ? studentApi(auth.idToken) : null), [token]);
  const [students, setStudents] = useState<StudentsDto | null>(null);
  const [studentsError, setStudentsError] = useState('');
  useEffect(() => { if (route !== '#/schedule') setFlash(''); setNote(''); }, [route]);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      void signOut();
      setNoticeOk(false);
      setNotice(e.code === 'SIGN_IN_AGAIN' ? 'You’ve been signed in for a while. Please sign in again.'
        : e.code === SIGNED_OUT_WRONG_PASSWORDS ? e.message : 'Please sign in.');
      return;
    }
    setLoad({ state: 'error', message: e instanceof Error ? e.message : 'Something went wrong. Try again.' });
  }, [signOut]);

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
        // A family's account (one user pool, ADR-023 d7, d9): signed out again, with the API's reason on Log in.
        else if (e instanceof ApiError && e.status === 403) void signOut().then(() => { setNotice(e.message); setNoticeOk(false); });
        else handleError(e);
      });
    return () => { live = false; };
  }, [api, token, handleError, signOut]);

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
  if (token === undefined) {
    page = <div className="app"><main className="main" aria-busy="true"><p className="muted">Loading…</p></main></div>;
  } else if (!token || !api || !schedules || !studentsApi || !lessons || !payments || !finances || !todays) {
    // Signed out: BladeBook's own forms, talking to Cognito (ADR-023 d11). A business-email link opened while signed
    // out comes back to its confirm page after sign-in (ADR-016, 2026-11-12).
    const inside = () => { if (!route.startsWith(CONFIRM)) go('#/today'); };
    const toLogin = (n: string) => { setNotice(n); setNoticeOk(true); go('#/login'); };
    if (route === '#/signup') {
      page = <SignupAccount onCreated={() => go('#/signup/verify')} />;
    } else if (route === '#/signup/verify' && signupEmail()) {
      page = <SignupVerify email={signupEmail()} onVerified={() => { void signedIn(); go('#/today'); }} onLogIn={toLogin} />;
    } else if (route === '#/forgot') {
      page = <Forgot onDone={toLogin} />;
    } else {
      page = <Login notice={notice} noticeTone={noticeOk ? 'success' : 'info'} onSignedIn={() => { void signedIn().then(inside); }} onVerify={() => go('#/signup/verify')} />;
    }
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
    const resend = async () => {
      setBusy(true);
      try {
        setProfile(await api.resendLink(profile.pendingBusinessEmail ?? ''));
        setNote(`Sent a new link to ${profile.pendingBusinessEmail}. The one sent before no longer works.`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) setNote(e.message);
        else handleError(e);
      } finally {
        setBusy(false);
      }
    };
    if (route.startsWith(CONFIRM)) {
      const linkToken = route.slice(CONFIRM.length);
      page = (
        <CoachShell profile={profile} waiting={students?.pending.length} section="Profile">
          <ConfirmEmail key={linkToken} api={api} token={linkToken} profile={profile} onChange={setProfile} onError={handleError} />
        </CoachShell>
      );
    } else if (route === '#/signup/confirm' && !profile.codeWorks) {
      page = <SignupConfirm api={api} profile={profile} onChange={(p) => { setProfile(p); if (p.codeWorks) go('#/signup/done'); }} onFinish={() => go('#/today')} />;
    } else if (route === '#/signup/done' || route === '#/signup/confirm') {
      page = <SignupDone profile={profile} />;
    } else if (route === '#/schedule') {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Schedule" wide><ScheduleHub api={schedules} profile={profile} flash={flash} onError={handleError} /></CoachShell>;
    } else if (route === '#/schedule/weekly' || route.startsWith('#/schedule/special/')) {
      const id = route.startsWith('#/schedule/special/') ? route.slice('#/schedule/special/'.length) : undefined;
      page = (
        <CoachShell profile={profile} waiting={students?.pending.length} section="Schedule" full>
          <ScheduleEditor key={route} api={schedules} profile={profile} special={id === undefined ? undefined : id === 'new' ? null : id}
            onError={handleError} onToken={setToken} onSaved={afterSave} />
        </CoachShell>
      );
    } else if (route.startsWith('#/schedule/delete/')) {
      page = (
        <CoachShell profile={profile} waiting={students?.pending.length} section="Schedule">
          <DeleteDates key={route} api={schedules} profile={profile} tempId={route.slice('#/schedule/delete/'.length)}
            onError={handleError} onToken={setToken} onSaved={afterSave} />
        </CoachShell>
      );
    } else if (route === '#/schedule/dates') {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Schedule"><ChooseDates /></CoachShell>;
    } else if (route === '#/schedule/time-off') {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Schedule"><TimeOffForm api={schedules} profile={profile} onError={handleError} onToken={setToken} onSaved={afterSave} /></CoachShell>;
    } else if (route === '#/schedule/status') {
      page = (
        <CoachShell profile={profile} waiting={students?.pending.length} section="Schedule">
          <SaveStatus api={schedules} lessons={saved?.lessons ?? 0} families={saved?.families ?? 0} since={saved?.since ?? 0} onError={handleError} />
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
    } else if (route === '#/payments') {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Payments" wide><Payments api={payments} onError={handleError} /></CoachShell>;
    } else if (route === '#/finances') {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Payments" wide><Finances api={finances} year={Number(todayIn(profile.coachTimezone).slice(0, 4))} onError={handleError} /></CoachShell>;
    } else if (route === '#/lessons') {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Lessons" wide><Lessons api={lessons} onError={handleError} /></CoachShell>;
    } else if (route === '#/profile') {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Profile"><ProfileDetails key={profile.coachCode} api={api} profile={profile} onChange={setProfile} /></CoachShell>;
    } else if (route === '#/profile/email') {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Profile"><ProfileBusinessEmail api={api} profile={profile} onChange={setProfile} /></CoachShell>;
    } else if (route === '#/profile/visibility') {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Profile"><ProfileVisibility api={api} profile={profile} onChange={setProfile} /></CoachShell>;
    } else if (route === '#/profile/account') {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Profile"><ProfileAccount profile={profile} onLogOut={() => { void signOut().then(() => go('#/login')); }} /></CoachShell>;
    } else if (route === '#/profile/payments') {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Profile"><ProfilePayments api={api} profile={profile} onChange={setProfile} /></CoachShell>;
    } else {
      page = <CoachShell profile={profile} waiting={students?.pending.length} section="Today" wide><Today profile={profile} api={todays} onUseLogin={useLogin} onResend={resend} onError={handleError} note={note} busy={busy} pending={students?.pending} /></CoachShell>;
    }
  }

  return (
    <div className="bb" data-layout="top">
      {page}
    </div>
  );
}
