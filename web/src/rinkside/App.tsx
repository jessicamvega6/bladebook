/**
 * The rinkside page, online (Batch 7; design: rinkside/app.js and screens-rink.js; ADR-MASTER section 11;
 * FeatureDecriptions/Coach App). The coach's phone at the rink: today's lessons, Present / No-show per skater, the
 * family's contact details on a tap, and cancelling one lesson.
 *
 * Rulings applied: R1 (no Undo here; a recorded lesson is corrected on the website's Lessons page), R6 (the cancel
 * sheet names the skater, date and time). Signed in through the coach website's sign-in (locally the token stub, SC-1).
 *
 * Batch 10, offline (R2–R5; C_Rinkside Offline.md): today's lessons are kept on the phone (names and times, no contact
 * details); with no signal Present / No-show is saved on the phone and sent when signal returns; an entry the server
 * turns down (a wrong clock) goes to Not sent; a lesson the family cancelled meanwhile shows as cancelled. Logging out
 * keeps the queue, which sends after the same coach logs in again (R2). The service worker (public/coach/rinkside/sw.js)
 * keeps the page itself.
 *
 * Not yet: the Week tab's cancel-several (G-28).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../shared/api/client';
import { coachSession, emailFromToken } from '../shared/auth/localAuth';
import { Avatar, Banner, Button, Icon } from '../shared/components/harbor';
import { plural } from '../shared/logic/booking';
import { DAYS, MONTHS, dayOfWeek, formatShort, formatTime, shortDate, toMinutes, todayIn } from '../shared/logic/schedule';
import { rinkApi, type Contact, type RinkApi, type RinkDay, type RinkLesson, type RinkSkater } from './api';
import {
  addUnsent, dequeue, enqueue, goesTomorrow, queue, queuedFor, removeUnsent, saveDay, savedDay, unsent, type Queued, type Unsent,
} from './offline';

const RINK = 'Pelham Civic Center';
type Tab = 'today' | 'account' | 'unsent';
type Sheet =
  | { kind: 'signout' }
  | { kind: 'more'; l: RinkLesson }
  | { kind: 'contact'; l: RinkLesson; s: RinkSkater; contact: Contact | null; error: string }
  | { kind: 'cancel'; l: RinkLesson; hold: boolean; error: string; busy: boolean };

const recorded = (s: RinkSkater) => s.status === 'CHECKED_IN' || s.status === 'NO_SHOW';
const names = (l: RinkLesson) => (l.skaters.length ? l.skaters.map((s) => s.shortName).join(' and ') : 'Held');
const tapTime = (iso: string | null, tz: string) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }) : '');
const dDow = (date: string) => `${DAYS[dayOfWeek(date)]}, ${shortDate(date)}`;
const nowClockOf = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const nowClock = () => nowClockOf(new Date().toISOString());
const isNetwork = (e: unknown) => e instanceof ApiError && e.status === 0;
const lessonKey = (date: string, startTime: string) => `${date}#${startTime}`;
const seatKey = (q: { date: string; startTime: string; studentId: string }) => `${q.date}#${q.startTime}#${q.studentId}`;

/** Signal, as the browser knows it; a request that can't reach BladeBook also counts as none. */
function useOnline(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return [on, setOn];
}

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/today');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/today');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function App() {
  const [token, setToken] = useState<string | null>(() => coachSession.getToken());
  const [notice, setNotice] = useState('');
  const api = useMemo(() => (token ? rinkApi(token) : null), [token]);
  const signOut = useCallback((message = '') => { coachSession.signOut(); setToken(null); setNotice(message); }, []);
  return (
    <div className="bb rk-app">
      {!token || !api
        ? <SignIn notice={notice} onSignedIn={(t) => { setNotice(''); setToken(t); }} />
        : <Signed api={api} email={emailFromToken(token)} onSignOut={signOut} />}
    </div>
  );
}

/** Log in: the coach website's sign-in. LOCAL STAND-IN (SC-1): the email alone signs in; no password is checked. */
function SignIn({ notice, onSignedIn }: { notice: string; onSignedIn: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const waiting = queue().length;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!email.includes('@')) { setError('Enter your login email.'); return; }
    setBusy(true);
    try {
      onSignedIn(await coachSession.signIn(email.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="phone">
      <div className="phone__body rk-body">
        <div className="rk-signin">
          <span className="brand__mark rk-mark"><Icon name="logo" size={26} /></span>
          <h1 className="h1">BladeBook at the rink</h1>
          <p className="lede">Log in with the same email and password you use on the website.</p>
          {notice && <Banner tone="warning">{notice}</Banner>}
          {waiting > 0 && <div className="pbanner pbanner--warn"><Icon name="clock" size={18} /><div><b>{plural(waiting, 'check-in')} waiting on this phone</b>
            <span>Saved before you logged out. They send after you log in.</span></div></div>}
          <div className="field"><label className="label" htmlFor="rk-email">Login email</label>
            <input id="rk-email" type="email" className="ctl" value={email} autoComplete="username" onChange={(e) => { setEmail(e.target.value); setError(''); }} />
            {error && <div className="hint hint--error"><Icon name="alert" size={14} />{error}</div>}</div>
          <div className="field"><label className="label" htmlFor="rk-pw">Password</label>
            <input id="rk-pw" type="password" className="ctl" placeholder="••••••••" autoComplete="current-password" />
            <div className="hint">Local stand-in: any password works.</div></div>
          <Button block lg onClick={() => void submit()} disabled={busy}>Log in</Button>
          <p className="fine">This app shows today’s lessons, records attendance and cancels lessons. Your schedule, students and payments stay on the website.</p>
        </div>
      </div>
    </div>
  );
}

function Signed({ api, email, onSignOut }: { api: RinkApi; email: string; onSignOut: (message?: string) => void }) {
  const hash = useHash();
  const tab: Tab = hash === '#/account' ? 'account' : hash === '#/unsent' ? 'unsent' : 'today';
  const [day, setDay] = useState<RinkDay | null>(null);
  const [notLoaded, setNotLoaded] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [online, setOnline] = useOnline();
  const [since, setSince] = useState('');
  const [syncedAt, setSyncedAt] = useState('');
  const [saved, setSaved] = useState<Set<string>>(() => new Set(queuedFor(email).map(seatKey)));
  const [notSent, setNotSent] = useState<Unsent[]>(() => unsent());
  /** Lessons the family cancelled while this phone had no signal: the message to show in their place. */
  const [familyCancelled, setFamilyCancelled] = useState<Record<string, string>>({});

  useEffect(() => { if (!online) setSince((x) => x || nowClock()); else setSince(''); }, [online]);

  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { onSignOut('You’ve been logged in for a while. Please log in again.'); return; }
    setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
  }, [onSignOut]);
  /** Without signal: what's on screen stays; otherwise the phone's copy, if it's today's. */
  const fromPhone = useCallback(() => {
    const copy = savedDay(email);
    setDay((d) => d ?? (copy && copy.today === todayIn(copy.coachTimezone) ? copy : null));
    setNotLoaded(!(copy && copy.today === todayIn(copy.coachTimezone)));
  }, [email]);
  // The phone's copy follows every tap, so a reload with no signal shows what was recorded.
  useEffect(() => { if (day) saveDay(email, day); }, [day, email]);
  /** With signal: today from BladeBook, kept on the phone. */
  const load = useCallback(async () => {
    if (!online) { fromPhone(); return; }
    try {
      const d = await api.today();
      setDay(d); setError(''); setNotLoaded(false); setSyncedAt(nowClock());
    } catch (e) {
      if (isNetwork(e)) { setOnline(false); fromPhone(); } else fail(e);
    }
  }, [api, email, online, fail, setOnline, fromPhone]);
  useEffect(() => { void load(); }, [load]);

  const mark = (l: RinkLesson, studentId: string, change: Partial<RinkSkater>) =>
    setDay((d) => d && { ...d, lessons: d.lessons.map((x) => (x.date === l.date && x.startTime === l.startTime
      ? { ...x, skaters: x.skaters.map((k) => (k.studentId === studentId ? { ...k, ...change } : k)) } : x)) });
  const keep = (q: Queued) => { enqueue(q); setSaved(new Set(queuedFor(email).map(seatKey))); };

  /** Sends one check-in and says how it went; 'offline' leaves it queued. */
  const send = useCallback(async (q: Queued): Promise<RinkSkater | 'cancelled' | 'refused' | 'offline'> => {
    const l = { date: q.date, startTime: q.startTime } as RinkLesson;
    try {
      return await api.record(l, q.studentId, q.outcome, q.outcomeAt);
    } catch (e) {
      if (isNetwork(e)) return 'offline';
      if (e instanceof ApiError && e.status === 409) {
        // A family's cancellation is its own reason, not a failure: reported, then cleared (R4).
        setFamilyCancelled((m) => ({ ...m, [lessonKey(q.date, q.startTime)]: e.message }));
        return 'cancelled';
      }
      if (e instanceof ApiError && e.status === 400) {
        addUnsent({ ...q, reason: e.message, refusedAt: Date.now() });
        return 'refused';
      }
      throw e;
    }
  }, [api]);

  /** Signal again: send this coach's queue, then say so. Another coach's entries wait for that coach (R2). */
  const syncing = useRef(false);
  const sync = useCallback(async () => {
    const mine = queuedFor(email);
    if (!mine.length || syncing.current) return;
    syncing.current = true;
    let sent = 0, cancelled = 0;
    for (const q of mine) {
      const r = await send(q).catch((e: unknown) => { fail(e); return 'offline' as const; });
      if (r === 'offline') { setOnline(false); break; }
      dequeue(q);
      if (r === 'cancelled') cancelled++;
      else if (typeof r === 'object') { sent++; mark({ date: q.date, startTime: q.startTime } as RinkLesson, q.studentId, r); }
    }
    syncing.current = false;
    setSaved(new Set(queuedFor(email).map(seatKey)));
    setNotSent(unsent());
    if (queuedFor(email).length === 0) {
      setToast(`Back online. ${sent ? `${plural(sent, 'check-in')} sent.` : 'Everything is up to date.'}${cancelled ? ' A family had cancelled; see Today.' : ''}`);
      setSyncedAt(nowClock());
    }
  }, [email, send, fail, setOnline]);
  useEffect(() => { if (online) void sync(); }, [online, sync]);

  const record = async (l: RinkLesson, s: RinkSkater, outcome: 'CHECKED_IN' | 'NO_SHOW') => {
    setToast('');
    const q: Queued = { coach: email, date: l.date, startTime: l.startTime, studentId: s.studentId, shortName: s.shortName, outcome,
      outcomeAt: new Date().toISOString() };
    mark(l, s.studentId, { status: outcome, outcomeAt: q.outcomeAt });
    if (!online) { keep(q); return; }
    const r = await send(q).catch((e: unknown) => { fail(e); return 'offline' as const; });
    if (r === 'offline') { setOnline(false); keep(q); return; }
    if (r === 'refused') { mark(l, s.studentId, { status: s.status, outcomeAt: s.outcomeAt }); setNotSent(unsent()); setToast('That couldn’t be recorded. See Not sent.'); }
    if (r === 'cancelled') setToast('The family had cancelled that lesson.');
    if (typeof r === 'object') mark(l, s.studentId, r);
  };
  const openContact = async (l: RinkLesson, s: RinkSkater) => {
    setSheet({ kind: 'contact', l, s, contact: null, error: '' });
    if (!online) return;
    try {
      const contact = await api.contact(s.studentId);
      setSheet((x) => (x?.kind === 'contact' && x.s === s ? { ...x, contact } : x));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) fail(e);
      else setSheet((x) => (x?.kind === 'contact' && x.s === s ? { ...x, error: e instanceof Error ? e.message : 'Couldn’t load the contact details.' } : x));
    }
  };
  const cancel = async () => {
    if (sheet?.kind !== 'cancel') return;
    const { l, hold } = sheet;
    setSheet({ ...sheet, busy: true, error: '' });
    try {
      await api.cancel(l, hold ? 'HOLD' : 'RELEASE');
      setSheet(null);
      setToast(`${l.skaters.length > 1 ? `The shared ${formatTime(l.startTime)} lesson is cancelled. Both families` : `${names(l)}’s ${formatTime(l.startTime)} lesson cancelled. The family`} will be emailed.${hold ? ' The time stays closed.' : ''}`);
      void load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setSheet({ ...sheet, busy: false, error: e.message });
      else { setSheet(null); fail(e); }
    }
  };

  const now = day ? toMinutes(day.now) : 0;
  const isStarted = (l: RinkLesson) => toMinutes(l.startTime) <= now;
  const all = day ? day.lessons.flatMap((l) => l.skaters) : [];
  const done = all.filter(recorded).length;
  const next = day?.lessons.find((l) => l.skaters.length && !l.skaters.every(recorded) && toMinutes(l.startTime) + l.durationMinutes > now);
  const sub = day ? `${DAYS[dayOfWeek(day.today)]}, ${MONTHS[Number(day.today.slice(5, 7)) - 1]} ${Number(day.today.slice(8))} · ${RINK}` : RINK;

  return (
    <div className="phone">
      <header className="phone__head">
        <div>
          <a className="rk-home" href="/coach/"><Icon name="arrowL" size={16} /><span>Your dashboard</span></a>
          <div className="phone__title">{tab === 'account' ? 'Account' : tab === 'unsent' ? 'Not sent' : 'Today'}</div>
          <div className="phone__sub">{tab === 'account' ? 'Rinkside page' : tab === 'unsent' ? 'Check-ins the server turned down' : sub}</div>
        </div>
        {!online ? <span className="rk-pill rk-pill--warn"><Icon name="wifiOff" size={13} />{saved.size ? `${saved.size} saved on phone` : 'No signal'}</span>
          : notSent.length ? <span className="rk-pill rk-pill--danger"><Icon name="alert" size={13} />{notSent.length} not sent</span>
            : <span className="rk-pill rk-pill--ok"><Icon name="check" size={13} />All saved</span>}
      </header>
      {tab === 'today' && day && (
        <div className="phone__progress">
          <div className="phone__progress-row"><span>{done} of {all.length} recorded</span><span>{next ? `Next: ${names(next)} ${formatShort(next.startTime)}` : 'All done for today'}</span></div>
          <div className="meter"><span style={{ width: `${all.length ? (done / all.length) * 100 : 0}%` }} /></div>
        </div>
      )}
      <div className="phone__body rk-body">
        {toast && <div className="rk-toast" role="status"><Icon name="check" size={16} /><span>{toast}</span></div>}
        {error && <Banner tone="danger">{error}</Banner>}
        {tab === 'account' ? (
          <>
            <section className="rk-card"><div className="rk-who"><Avatar name={day?.coachFirstName ?? email} /><div><b>{day?.coachFirstName ? `Coach ${day.coachFirstName}` : 'Signed in'}</b><span className="muted-sm">{email}</span></div></div>
              <dl className="rk-kv"><div><dt>Rink</dt><dd>{RINK}</dd></div>
                <div><dt>Last synced</dt><dd>{syncedAt ? (online ? syncedAt : `${syncedAt} · no signal now`) : online ? '—' : 'No signal now'}</dd></div>
                <div><dt>Waiting to send</dt><dd>{saved.size ? plural(saved.size, 'check-in') : 'Nothing'}</dd></div></dl></section>
            <section className="rk-card"><b>Everything else is on the website</b><p className="fine">Your schedule, students, approvals, payments and profile are on the website. This page is for today’s lessons, attendance and cancelling.</p></section>
            <Button variant="secondary" block lg icon="arrowL" onClick={() => (queuedFor(email).length ? setSheet({ kind: 'signout' }) : onSignOut())}>Log out</Button>
          </>
        ) : tab === 'unsent' ? (
          <NotSentList list={notSent} onDone={(u) => { removeUnsent(u); setNotSent(unsent()); }} />
        ) : notLoaded && !day ? (
          <div className="pempty"><span className="pempty__icon"><Icon name="wifiOff" size={28} /></span><h2 className="h2">Today’s lessons haven’t loaded</h2>
            <p>This phone hasn’t had signal since you opened the app. Open it once with signal before you leave for the rink, and today’s lessons are saved for when there’s none.</p>
            <Button block lg icon="refresh" onClick={() => { const on = navigator.onLine !== false; setOnline(on); if (on) void load(); else setToast('Still no signal. Try again near the entrance.'); }}>Try again</Button></div>
        ) : !day ? <p className="muted" aria-busy="true">Loading today’s lessons…</p> : (
          <>
            {!online && <div className="pbanner pbanner--warn"><Icon name="wifiOff" size={18} /><div><b>No signal since {since}</b>
              <span>{saved.size ? `${plural(saved.size, 'check-in')} saved on this phone. They’ll send when signal comes back.` : 'Keep recording. Check-ins are saved on this phone and send when signal comes back.'}</span></div></div>}
            {notSent.length > 0 && <a className="pbanner pbanner--danger rk-bannerlink" href="#/unsent"><Icon name="alert" size={18} /><div><b>{plural(notSent.length, 'check-in')} couldn’t be sent</b><span>See why <Icon name="arrowR" size={13} /></span></div></a>}
            {!day.lessons.length && <div className="pempty"><span className="pempty__icon"><Icon name="calendar" size={28} /></span><h2 className="h2">No lessons today</h2></div>}
            <div className="rk-cards">
              {day.lessons.map((l) => (
                familyCancelled[lessonKey(l.date, l.startTime)]
                  ? <article key={l.startTime} className="rl rl--cancelled"><div className="rl__head"><span className="rl__time num">{formatShort(l.startTime)}</span>
                      <span className="rl__name"><s>{names(l)}</s></span><span className="badge badge--neutral">Cancelled</span></div>
                      <div className="rl__meta">{familyCancelled[lessonKey(l.date, l.startTime)]} Nothing more to do.</div></article>
                  : <LessonCard key={l.startTime} l={l} now={now} tz={day.coachTimezone} saved={saved} onRecord={(s, o) => void record(l, s, o)}
                      onName={(s) => void openContact(l, s)} onMore={() => setSheet({ kind: 'more', l })} />
              ))}
            </div>
            <p className="phone__hint">{online ? 'Tap a name for the family’s contact details.' : <><Icon name="lock" size={13} /> Contact details and cancelling need a connection.</>}</p>
          </>
        )}
      </div>
      <nav className="tabbar" aria-label="Rinkside">
        <a className={`tabbar__item${tab === 'today' ? ' is-active' : ''}`} href="#/today" aria-current={tab === 'today' ? 'page' : undefined}><span className="rk-tabicon"><Icon name="list" size={20} /></span><span>Today</span></a>
        <span className="tabbar__item is-disabled" aria-disabled="true" title="Comes in a later batch"><span className="rk-tabicon"><Icon name="calendar" size={20} /></span><span>Week</span></span>
        <a className={`tabbar__item${tab === 'account' ? ' is-active' : ''}`} href="#/account" aria-current={tab === 'account' ? 'page' : undefined}><span className="rk-tabicon"><Icon name="user" size={20} /></span><span>Account</span></a>
      </nav>
      {sheet && day && (
        <>
          <div className="scrim" onClick={() => setSheet(null)} />
          {sheet.kind === 'signout' && (
            <div className="sheet" role="dialog" aria-modal="true" aria-label="Log out"><span className="sheet__grab" />
              <div className="rk-sheeticon rk-sheeticon--warn"><Icon name="alert" size={24} /></div>
              <h2 className="h2">{plural(queuedFor(email).length, 'check-in')} {queuedFor(email).length === 1 ? 'hasn’t' : 'haven’t'} been sent</h2>
              <p className="fine">They’re saved on this phone. If you log out, they’ll send the next time you log in here. Only your login can send them.</p>
              <Button block lg onClick={() => setSheet(null)}>Stay logged in</Button>
              <Button variant="secondary" block lg onClick={() => onSignOut()}>Log out</Button>
            </div>
          )}
          {sheet.kind === 'more' && (
            <div className="sheet" role="dialog" aria-modal="true" aria-label="More"><span className="sheet__grab" />
              <h2 className="h2">{sheet.l.skaters.length > 1 ? names(sheet.l) : sheet.l.skaters[0]?.fullName} · {formatTime(sheet.l.startTime)}</h2>
              <div className="rk-menu">
                {sheet.l.skaters.map((s) => (
                  <button key={s.studentId} type="button" className="rk-menu__item" disabled={!online} onClick={() => void openContact(sheet.l, s)}>
                    <Icon name="phone" size={18} /><span>{sheet.l.skaters.length > 1 ? `${s.shortName}’s family` : 'Contact details'}<small>{online ? s.familyName ?? s.fullName : 'Needs a connection'}</small></span><Icon name="chevR" size={16} />
                  </button>
                ))}
                <button type="button" className="rk-menu__item rk-menu__item--danger" disabled={!online || isStarted(sheet.l)}
                  onClick={() => setSheet({ kind: 'cancel', l: sheet.l, hold: false, error: '', busy: false })}>
                  <Icon name="calOff" size={18} /><span>Cancel this lesson<small>{!online ? 'Needs a connection' : isStarted(sheet.l) ? 'It has already started' : sheet.l.skaters.length > 1 ? 'Cancels both skaters. You’ll confirm next.' : 'You’ll confirm on the next step'}</small></span><Icon name="chevR" size={16} />
                </button>
              </div>
              <Button variant="secondary" block lg onClick={() => setSheet(null)}>Close</Button>
            </div>
          )}
          {sheet.kind === 'contact' && <ContactSheet sheet={sheet} online={online} onClose={() => setSheet(null)} onCopied={(what) => setToast(`Copied ${what}.`)} />}
          {sheet.kind === 'cancel' && (
            <div className="sheet" role="dialog" aria-modal="true" aria-label="Cancel lesson"><span className="sheet__grab" />
              <h2 className="h2">Cancel {names(sheet.l)} · {sheet.l.date === day.today ? 'Today, ' : ''}{dDow(sheet.l.date)} · {formatTime(sheet.l.startTime)}?</h2>
              <p className="fine">{sheet.l.skaters.length > 1 ? 'It’s a shared lesson, so both skaters are cancelled. ' : ''}{[...new Set(sheet.l.skaters.map((s) => s.familyName ?? s.fullName))].join(' and ')} will be emailed. This can’t be undone.</p>
              <div className="fieldset"><div className="label" id="rk-after">After cancelling</div>
                <div className="seg seg--block" role="group" aria-labelledby="rk-after">
                  {['Release for rebooking', 'Hold it closed'].map((o, i) => (
                    <button key={o} type="button" className={`seg__opt${sheet.hold === (i === 1) ? ' is-on' : ''}`} aria-pressed={sheet.hold === (i === 1)}
                      onClick={() => setSheet({ ...sheet, hold: i === 1 })}>{o}</button>
                  ))}
                </div>
                <div className="hint">{sheet.hold ? 'A held time stays closed for good. Nobody can book it.' : 'Another family can book this time.'}</div></div>
              {sheet.error && <Banner tone="danger">{sheet.error}</Banner>}
              <Button variant="danger" block lg onClick={() => void cancel()} disabled={sheet.busy}>{sheet.busy ? 'Cancelling…' : 'Cancel lesson'}</Button>
              <Button variant="secondary" block lg onClick={() => setSheet(null)}>Keep lesson</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One lesson (design: lessonCard): held, or each skater with Present / No-show, or what was recorded. */
function LessonCard({ l, now, tz, saved, onRecord, onName, onMore }: {
  l: RinkLesson; now: number; tz: string; saved: Set<string>; onRecord: (s: RinkSkater, o: 'CHECKED_IN' | 'NO_SHOW') => void;
  onName: (s: RinkSkater) => void; onMore: () => void;
}) {
  const time = <span className="rl__time num">{formatShort(l.startTime)}</span>;
  const len = <span className="rl__len">{l.durationMinutes} min</span>;
  if (l.lessonStatus === 'HELD' || !l.skaters.length) {
    return <article className="rl rl--held"><div className="rl__head">{time}<span className="rl__name">Held slot</span>{len}</div>
      <div className="rl__meta"><Icon name="lock" size={13} /> You kept this time closed. Nobody can book it.</div></article>;
  }
  const start = toMinutes(l.startTime);
  const later = start > now + 10;
  const allDone = l.skaters.every(recorded);
  const inProgress = start <= now && now < start + l.durationMinutes && !allDone;
  const shared = l.skaters.length > 1;
  const more = (sm = false) => <button type="button" className={`rbtn rbtn--more${sm ? ' rbtn--sm' : ''}`} aria-label={`More for ${names(l)}`} onClick={onMore}><Icon name="more" size={18} /></button>;
  const laterRow = <div className="rk-later"><Icon name="clock" size={16} />Starts at {formatTime(l.startTime)}</div>;
  const foot = (s: RinkSkater, withMore: boolean) => {
    if (recorded(s)) {
      const ok = s.status === 'CHECKED_IN';
      return <div className={`rl__done ${ok ? 'rl__done--ok' : 'rl__done--no'}`}><Icon name={ok ? 'check' : 'x'} size={16} />{ok ? 'Present' : 'No-show'}{s.outcomeAt ? ` · ${tapTime(s.outcomeAt, tz)}` : ''}
        {saved.has(seatKey({ date: l.date, startTime: l.startTime, studentId: s.studentId })) && <span className="rl__saved"><Icon name="clock" size={13} />Saved on phone</span>}</div>;
    }
    const label = (what: string) => (shared ? `${s.shortName}: ${what}` : undefined);
    return (
      <div className="rl__btns">
        <button type="button" className="rbtn rbtn--present" aria-label={label('Present')} onClick={() => onRecord(s, 'CHECKED_IN')}><Icon name="check" size={18} />Present</button>
        <button type="button" className="rbtn rbtn--noshow" aria-label={label('No-show')} onClick={() => onRecord(s, 'NO_SHOW')}>No-show</button>
        {withMore && more()}
      </div>
    );
  };
  const nameBtn = (s: RinkSkater) => <button type="button" className="rl__name rk-namebtn" onClick={() => onName(s)}>{s.shortName}</button>;
  if (shared) {
    return (
      <article className={`rl rk-shared${inProgress ? ' rl--now' : ''}`}>
        <div className="rl__head">{time}<span className="rk-shared__tag"><Icon name="users" size={14} />Shared · {plural(l.skaters.length, 'skater')}</span>{len}{!allDone && more(true)}</div>
        {l.skaters.map((s) => <div key={s.studentId} className="rk-seat">{nameBtn(s)}{!later && foot(s, false)}</div>)}
        {later && <div className="rl__btns">{laterRow}</div>}
      </article>
    );
  }
  const s = l.skaters[0]!;
  return (
    <article className={`rl${inProgress ? ' rl--now' : ''}`}>
      <div className="rl__head">{time}{nameBtn(s)}{len}</div>
      {recorded(s) ? foot(s, false) : later ? <div className="rl__btns">{laterRow}{more()}</div> : foot(s, true)}
    </article>
  );
}

function ContactSheet({ sheet, online, onClose, onCopied }: { sheet: Extract<Sheet, { kind: 'contact' }>; online: boolean; onClose: () => void; onCopied: (what: string) => void }) {
  const c = sheet.contact;
  if (!online) {
    return (
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Contact details"><span className="sheet__grab" />
        <div className="rk-sheeticon"><Icon name="wifiOff" size={24} /></div>
        <h2 className="h2">Contact details need a connection.</h2>
        <p className="fine">They aren’t stored on this phone. Try again when you have signal.</p>
        <Button variant="secondary" block lg onClick={onClose}>Close</Button>
      </div>
    );
  }
  const copy = (value: string, what: string) => { void navigator.clipboard?.writeText(value).catch(() => undefined); onCopied(what); };
  const line = (icon: string, label: string, value: string, what: string) => (
    <div className="rk-contact__row"><Icon name={icon} size={18} /><div><small>{label}</small><b className="rk-select">{value}</b></div>
      <Button variant="ghost" sm icon="copy" onClick={() => copy(value, what)}>Copy</Button></div>
  );
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Contact details"><span className="sheet__grab" />
      {sheet.error ? <><h2 className="h2">{sheet.s.fullName}</h2><Banner tone="danger">{sheet.error}</Banner></>
        : !c ? <p className="muted" aria-busy="true">Loading…</p> : (
          <>
            <h2 className="h2">{c.studentName}</h2>
            <p className="fine">{c.relationship === 'SELF' ? 'Books for themselves' : `${c.clientName} · guardian`}{c.isMinor ? ' · minor' : ''}</p>
            <div className="rk-contact">
              {line('user', c.relationship === 'SELF' ? 'Name' : 'Guardian', c.clientName, 'the name')}
              {line('phone', 'Phone', c.phone, 'the phone number')}
              {line('mail', 'Email', c.email, 'the email address')}
            </div>
            <p className="fine"><Icon name="lock" size={13} /> Shown for this tap only. Not saved on this phone.</p>
          </>
        )}
      <Button block lg onClick={onClose}>Done</Button>
    </div>
  );
}

/** Not sent (R3; design/harbor/rinkside screens-rink.js "unsent"): what BladeBook turned down, with Record on the website
 * and Done; each leaves the phone after 7 days. */
function NotSentList({ list, onDone }: { list: Unsent[]; onDone: (u: Unsent) => void }) {
  if (!list.length) {
    return <div className="pempty"><span className="pempty__icon"><Icon name="check" size={28} /></span><h2 className="h2">Everything was sent</h2>
      <p>Check-ins that can’t be sent show up here, with the reason.</p>
      <a className="btn btn--primary btn--block btn--lg" href="#/today"><span>Back to today</span></a></div>;
  }
  return (
    <>
      <div className="pbanner pbanner--danger"><Icon name="alert" size={18} /><div><b>{plural(list.length, 'check-in')} couldn’t be sent</b>
        <span>Record each one on the website, then tap Done. Each is removed from this phone after 7 days.</span></div></div>
      {list.map((u) => (
        <article key={seatKey(u)} className="rl rl--issue">
          <div className="rl__head"><span className="rl__name">{u.shortName}</span><span className="badge badge--warning">Not sent</span></div>
          <div className="rl__meta">{dDow(u.date)} · {formatTime(u.startTime)}<br />Recorded <b>{u.outcome === 'NO_SHOW' ? 'No-show' : 'Present'}</b> at {nowClockOf(u.outcomeAt)}, by the phone’s clock</div>
          <p className="rk-reason">{u.reason}</p>
          {goesTomorrow(u) && <p className="fine">Will be removed tomorrow.</p>}
          <div className="rl__btns">
            <a className="btn btn--secondary btn--sm" href="/coach/#/lessons" target="_blank" rel="noreferrer"><span>Record on the website</span></a>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => onDone(u)}><span>Done</span></button>
          </div>
        </article>
      ))}
      <p className="phone__hint"><a className="link" href="#/today"><Icon name="arrowL" size={13} /> Back to today</a></p>
    </>
  );
}
