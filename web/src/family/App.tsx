/**
 * The family website. Batch 3: sign-up with coach codes (steps 1, 2, 4 and 5), log-in, and
 * the waiting family's Home and Profile. Batch 4: once a coach approves, Book a lesson (#/book…) and Home's
 * Today and Coming up. Batch 5: My bookings (#/bookings), with Cancel on each lesson. Batch 11: the invitation page
 * (#/invite/<inviteId>), and Home's invitations and staying-family cards. Batch 18: real sign-in, BladeBook's own forms
 * calling Cognito (ADR-023 d11): Log in, "Forgot/change password" (I32) and sign-up's account and email code.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../shared/api/client';
import { familyAuth } from '../shared/auth';
import { Banner } from '../shared/components/harbor';
import { familyApi, type Family, type Invitation, type MyLesson } from './api';
import { FamilyShell } from './components/Shells';
import { Book } from './pages/Book';
import { Bookings, SeriesChange } from './pages/Bookings';
import { Home } from './pages/Home';
import { Forgot, Login } from './pages/Login';
import { Profile } from './pages/Profile';
import { InvitePage } from './pages/Sharing';
import { Signup } from './pages/Signup';
import { Loading } from '../shared/components/Loading';

type Load =
  | { state: 'loading' }
  | { state: 'no-account' }
  | { state: 'ready'; family: Family }
  | { state: 'error'; message: string };

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/home');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/home');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

function go(route: string) {
  window.location.hash = route;
}

const auth = familyAuth();

export function App() {
  // The sign-in's current ID token: undefined while this tab's sign-in is looked up, null when signed out. Requests
  // get theirs from the sign-in (auth.idToken), refreshed when it expires; this one marks who is signed in.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  // A log-in whose email was never verified goes to sign-up's code step for this email.
  const [verifyEmail, setVerifyEmail] = useState('');
  useEffect(() => {
    // Opening the plain address (no page named) always starts at Log in, signed out, so the last family in
    // this tab isn't resumed. A link to a page inside the site, or a refresh, keeps the sign-in (owner, 2026-11-09).
    const hash = window.location.hash;
    const plain = hash === '' || hash === '#' || hash === '#/';
    let live = true;
    (plain ? auth.signOut().then(() => null) : auth.idToken())
      .then((t) => { if (live) setToken(t); })
      .catch(() => { if (live) setToken(null); });
    return () => { live = false; };
  }, []);
  const [notice, setNotice] = useState('');
  const [noticeOk, setNoticeOk] = useState(false);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  // Sign-up stays on screen while its new token arrives, so nothing typed is lost.
  const [signingUp, setSigningUp] = useState(false);
  const route = useHashRoute();
  const api = useMemo(() => (token ? familyApi(auth.idToken) : null), [token]);
  const [lessons, setLessons] = useState<MyLesson[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [homeReload, setHomeReload] = useState(0);

  const signOut = useCallback((message = '') => {
    // Log in shows once the tab's sign-in is gone (see shared/auth's signOut).
    void auth.signOut().then(() => {
      setToken(null);
      setVerifyEmail('');
      setSigningUp(false);
      setNotice(message);
      setNoticeOk(false);
      go('#/login');
    });
  }, []);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      signOut(e.code === 'SIGN_IN_AGAIN' ? 'You’ve been logged in for a while. Please log in again.' : 'Please log in.');
      return;
    }
    setLoad({ state: 'error', message: e instanceof Error ? e.message : 'Something went wrong. Try again.' });
  }, [signOut]);

  useEffect(() => {
    if (!api) return;
    let live = true;
    setLoad((l) => (l.state === 'ready' ? l : { state: 'loading' }));
    api.me()
      .then((family) => live && setLoad({ state: 'ready', family }))
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.code === 'NO_ACCOUNT') {
          setLoad({ state: 'no-account' });
          setSigningUp(true);
        } else if (e instanceof ApiError && e.status === 403) {
          // A coach's account (one user pool, ADR-023 d7, d9): signed out again, with the API's reason on Log in.
          signOut(e.message);
        } else handleError(e);
      });
    return () => { live = false; };
  }, [api, handleError, signOut]);

  // Home's Today and Coming up, read again each time Home opens so a new booking shows. A waiting family has none.
  const approved = load.state === 'ready' && !load.family.waiting;
  const onHome = route !== '#/profile' && !route.startsWith('#/book') && !route.startsWith('#/invite');  // #/bookings too
  useEffect(() => {
    if (!api || !approved || !onHome) return;
    let live = true;
    api.lessons()
      .then((l) => live && setLessons(l))
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 401) handleError(e);
        else setLessons([]);
      });
    // Invitations to the family's skaters (Batch 11); a failure leaves Home without the card.
    api.invitations().then((i) => live && setInvitations(Array.isArray(i) ? i : [])).catch(() => live && setInvitations([]));
    return () => { live = false; };
  }, [api, approved, onHome, handleError, homeReload]);

  let page;
  if (token === undefined) {
    page = <div className="app"><main className="main"><Loading page /></main></div>;
  } else if (signingUp || (!token && (route === '#/signup' || verifyEmail))) {
    page = (
      <Signup key={verifyEmail} token={token} verifyEmail={verifyEmail || undefined} onToken={(t) => { setSigningUp(true); setToken(t); }}
        onSignInAgain={() => signOut('Please log in again to finish signing up.')}
        onDone={(family) => { setSigningUp(false); setVerifyEmail(''); setLoad({ state: 'ready', family }); go('#/home'); }} />
    );
  } else if (!token && route === '#/forgot') {
    page = <Forgot onDone={(n) => { setNotice(n); setNoticeOk(true); go('#/login'); }} />;
  } else if (!token || !api) {
    page = (
      <Login notice={notice} noticeTone={noticeOk ? 'success' : 'info'} onVerify={(email) => { setNotice(''); setVerifyEmail(email); }}
        onSignedIn={() => { setNotice(''); void auth.idToken().then((t) => { setToken(t); go('#/home'); }); }} />
    );
  } else if (load.state === 'loading' || load.state === 'no-account') {
    page = <div className="app"><main className="main"><Loading page /></main></div>;
  } else if (load.state === 'error') {
    page = <div className="app"><main className="main"><Banner tone="danger" title="Couldn’t load your account">{load.message}</Banner></main></div>;
  } else if (route === '#/profile') {
    page = (
      <FamilyShell family={load.family} section="Profile">
        <Profile family={load.family} api={api} onChange={(family) => setLoad({ state: 'ready', family })}
          onSignOut={() => signOut()} onError={handleError} />
      </FamilyShell>
    );
  } else if (route.startsWith('#/invite/') && !load.family.waiting) {
    // The invitation page (Batch 11), opened from the invitation email; signing in proves it's the invited family.
    const id = route.slice('#/invite/'.length);
    page = <FamilyShell family={load.family} section="Home" wide><InvitePage key={id} api={api} inviteId={id} onError={handleError} /></FamilyShell>;
  } else if (route.startsWith('#/bookings/series/') && !load.family.waiting) {
    const [coachId = '', rid = ''] = route.slice('#/bookings/series/'.length).split('/');
    page = <FamilyShell family={load.family} section="My bookings" wide><SeriesChange key={route} api={api} coachId={coachId} recurrenceId={rid} onError={handleError} /></FamilyShell>;
  } else if (route === '#/bookings') {
    // A waiting family has no bookings page (ADR-022 d6): Home says who they're waiting for.
    page = load.family.waiting
      ? <FamilyShell family={load.family} section="Home"><Home family={load.family} /></FamilyShell>
      : <FamilyShell family={load.family} section="My bookings"><Bookings family={load.family} api={api} onError={handleError} /></FamilyShell>;
  } else if (route.startsWith('#/book')) {
    page = (
      <FamilyShell family={load.family} section="Book a lesson" wide>
        <Book family={load.family} api={api} route={route} onError={handleError} />
      </FamilyShell>
    );
  } else {
    page = (
      <FamilyShell family={load.family} section="Home" wide={!load.family.waiting}>
        <Home family={load.family} lessons={lessons} invitations={invitations}
          sharing={{ api, onChanged: () => setHomeReload((n) => n + 1), onError: handleError }} />
      </FamilyShell>
    );
  }

  return <div className="bb" data-layout="top">{page}</div>;
}
