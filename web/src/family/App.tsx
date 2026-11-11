/**
 * The family website. Batch 3: sign-up with coach codes (steps 1, 2, 4 and 5), the local log-in stand-in, and
 * the waiting family's Home and Profile. Batch 4: once a coach approves, Book a lesson (#/book…) and Home's
 * Today and Coming up.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../shared/api/client';
import { familySession } from '../shared/auth/localAuth';
import { Banner } from '../shared/components/harbor';
import { familyApi, type Family, type FamilyLesson } from './api';
import { FamilyShell } from './components/Shells';
import { Book } from './pages/Book';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Profile } from './pages/Profile';
import { Signup } from './pages/Signup';

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

export function App() {
  // Opening the plain address (no page named) always starts at Log in, signed out, so the last family in
  // this tab isn't resumed. A link to a page inside the site, or a refresh, keeps the sign-in (owner, 2026-11-09).
  const [token, setToken] = useState<string | null>(() => {
    const hash = window.location.hash;
    if (hash === '' || hash === '#' || hash === '#/') {
      familySession.signOut();
      return null;
    }
    return familySession.getToken();
  });
  const [notice, setNotice] = useState('');
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  // Sign-up stays on screen while its new token arrives, so nothing typed is lost.
  const [signingUp, setSigningUp] = useState(false);
  const route = useHashRoute();
  const api = useMemo(() => (token ? familyApi(token) : null), [token]);
  const [lessons, setLessons] = useState<FamilyLesson[] | null>(null);

  const signOut = useCallback((message = '') => {
    familySession.signOut();
    setToken(null);
    setSigningUp(false);
    setNotice(message);
    go('#/login');
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
        } else handleError(e);
      });
    return () => { live = false; };
  }, [api, handleError]);

  // Home's Today and Coming up, read again each time Home opens so a new booking shows. A waiting family has none.
  const approved = load.state === 'ready' && !load.family.waiting;
  const onHome = route !== '#/profile' && !route.startsWith('#/book');
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
    return () => { live = false; };
  }, [api, approved, onHome, handleError]);

  let page;
  if (signingUp || (!token && route === '#/signup')) {
    page = (
      <Signup token={token} onToken={(t) => { setSigningUp(true); setToken(t); }}
        onSignInAgain={() => signOut('Please log in again to finish signing up.')}
        onDone={(family) => { setSigningUp(false); setLoad({ state: 'ready', family }); go('#/home'); }} />
    );
  } else if (!token || !api) {
    page = <Login notice={notice} onSignedIn={(t) => { setNotice(''); setToken(t); go('#/home'); }} />;
  } else if (load.state === 'loading' || load.state === 'no-account') {
    page = <div className="app"><main className="main" aria-busy="true"><p className="muted">Loading…</p></main></div>;
  } else if (load.state === 'error') {
    page = <div className="app"><main className="main"><Banner tone="danger" title="Couldn’t load your account">{load.message}</Banner></main></div>;
  } else if (route === '#/profile') {
    page = (
      <FamilyShell family={load.family} section="Profile">
        <Profile family={load.family} api={api} onChange={(family) => setLoad({ state: 'ready', family })}
          onSignOut={() => signOut()} onError={handleError} />
      </FamilyShell>
    );
  } else if (route.startsWith('#/book')) {
    page = (
      <FamilyShell family={load.family} section="Book a lesson" wide>
        <Book family={load.family} api={api} route={route} onError={handleError} />
      </FamilyShell>
    );
  } else {
    page = <FamilyShell family={load.family} section="Home" wide={!load.family.waiting}><Home family={load.family} lessons={lessons} /></FamilyShell>;
  }

  return <div className="bb" data-layout="top">{page}</div>;
}
