/**
 * Book a lesson, Batch 4 (design: client/screens-booking.js → book, book-times, bkConfirm, book-result;
 * FeatureDecriptions/Bookings:). One date per pick, one skater per lesson: Repeat is Batch 9 and sharing Batch 11.
 *
 *   #/book                pick a day: the three months of the booking window, one coach at a time
 *   #/book/day/<date>     pick your times on a day; #/book/week/<sunday> opens a week at its first open day
 *   #/book/result         what happened to each pick, one section per coach
 *
 * Every date and time is the coach's, from api-client, labelled with the coach's time zone. A family sees only
 * open or taken, never who holds a time; its own lessons show as its own. Switching coach keeps the picks made
 * with other coaches; switching skater clears them. Booking sends one request per coach, each with its own
 * idempotency key, so Try again never books anything twice.
 *
 * Rulings applied: B1 one message for every date that couldn't be booked; B5 the day view stays inside the booking
 * window; B6 every coach's notice is 24 hours (the page shows the coach's stamped value).
 */
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { ApiError } from '../../shared/api/client';
import { Avatar, Badge, Banner, Button, Card, Dialog, Help, Icon, Row, Seg } from '../../shared/components/harbor';
import {
  UNAVAILABLE, blockLabel, blockRuns, byCoach, clamp, duration, inWindow, monthWeeks, newKey, plural, samePick,
  slotState, sortPicks, windowMonths, type Pick,
} from '../../shared/logic/booking';
import { firstName, joinNames } from '../../shared/logic/names';
import {
  DAYS, DAYS_LONG, MONTHS, MONTHS_LONG, addDays, dayOfWeek, formatClock, formatMoney, formatTime, longDate, monthEnd,
  shortDate, weekStart,
} from '../../shared/logic/schedule';
import { timezoneLabel } from '../../shared/logic/timezones';
import type { BookBody, BookResult, BookingPage, Family, FamilyApi, TimeDto } from '../api';

type Skater = Family['skaters'][number];
type CoachLink = Skater['coaches'][number];

/** What one coach's request came back with. A failed one keeps its body, key and all, for Try again. */
interface Section { coachId: string; coachFirstName: string; body: BookBody; result?: BookResult; error?: string; retryable?: boolean }
interface Result { studentId: string; studentName: string; sections: Section[] }

/** Skaters who can be booked: approved with at least one coach. */
export const bookableSkaters = (f: Family) => f.skaters.filter((k) => k.coaches.some((c) => c.status === 'ACTIVE' && c.coachId));
const activeCoaches = (k: Skater | undefined) => (k?.coaches ?? []).filter((c): c is CoachLink & { coachId: string } => c.status === 'ACTIVE' && !!c.coachId);

export function parseBookRoute(route: string): { view: 'month' | 'day' | 'week' | 'result'; date?: string } {
  const m = /^#\/book\/(day|week)\/(\d{4}-\d{2}-\d{2})$/.exec(route);
  if (m) return { view: m[1] as 'day' | 'week', date: m[2] };
  if (route === '#/book/result') return { view: 'result' };
  return { view: 'month' };
}

const go = (route: string) => { window.location.hash = route; };
const openOn = (page: BookingPage, date: string) => page.times.filter((t) => t.date === date && t.free && !t.started);
const timesOn = (page: BookingPage, date: string) => page.times.filter((t) => t.date === date);
const dayLabel = (date: string) => `${DAYS[dayOfWeek(date)]} ${Number(date.slice(8))}`;
const dDow = (date: string) => `${DAYS[dayOfWeek(date)]}, ${shortDate(date)}`;

export function Book({ family, api, route, onError }: {
  family: Family; api: FamilyApi; route: string; onError: (e: unknown) => void;
}) {
  const kids = bookableSkaters(family);
  const [sid, setSid] = useState(kids[0]?.studentId ?? '');
  const kid = kids.find((k) => k.studentId === sid) ?? kids[0];
  const [chosenCoach, setChosenCoach] = useState<string | null>(null);
  const coachId = activeCoaches(kid).some((c) => c.coachId === chosenCoach) ? chosenCoach! : activeCoaches(kid)[0]?.coachId ?? '';
  const [picks, setPicks] = useState<Pick[]>([]);
  const [pages, setPages] = useState<Record<string, BookingPage>>({});
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [month, setMonth] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const r = parseBookRoute(route);
  const pageKey = `${coachId}|${kid?.studentId ?? ''}`;
  const page = pages[pageKey];

  useEffect(() => {
    if (!kid || !coachId) return;
    let live = true;
    setLoadError('');
    api.bookingPage(coachId, kid.studentId)
      .then((p) => { if (live) setPages((all) => ({ ...all, [`${coachId}|${kid.studentId}`]: p })); })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 401) onError(e);
        else setLoadError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      });
    return () => { live = false; };
  }, [api, coachId, kid, reload, onError]);

  const toggle = useCallback((t: TimeDto) => {
    if (!page) return;
    setPicks((ps) => ps.some((p) => samePick(p, coachId, t.date, t.startTime))
      ? ps.filter((p) => !samePick(p, coachId, t.date, t.startTime))
      : sortPicks([...ps, { coachId, coachFirstName: page.coachFirstName, date: t.date, startTime: t.startTime, endTime: t.endTime,
        durationMinutes: t.durationMinutes, priceMinor: t.priceMinor }]));
  }, [page, coachId]);

  const remove = (p: Pick) => setPicks((ps) => ps.filter((x) => !samePick(x, p.coachId, p.date, p.startTime)));

  const send = async (body: BookBody, coachFirstName: string): Promise<Section> => {
    try {
      return { coachId: body.coachId, coachFirstName, body, result: await api.book(body) };
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw e;
      // A refusal (the skater can't be booked now, a date outside the window) won't change on a retry.
      const refused = e instanceof ApiError && e.status >= 400 && e.status < 500;
      return { coachId: body.coachId, coachFirstName, body, error: e instanceof Error ? e.message : 'Something went wrong. Try again.', retryable: !refused };
    }
  };

  const book = async () => {
    if (!kid || !picks.length) return;
    setSending(true);
    try {
      const sections: Section[] = [];
      for (const g of byCoach(picks)) {
        sections.push(await send({ coachId: g.coachId, studentId: kid.studentId, idempotencyKey: newKey(),
          picks: g.picks.map((p) => ({ date: p.date, startTime: p.startTime })) }, g.coachFirstName));
      }
      setResult({ studentId: kid.studentId, studentName: kid.name, sections });
      setPicks([]);
      setConfirming(false);
      setPages({});
      setReload((n) => n + 1);
      go('#/book/result');
    } catch (e) {
      onError(e);
    } finally {
      setSending(false);
    }
  };

  /** Resends one coach's request with the same key: what was booked is recognised, never booked twice. */
  const retry = async (s: Section) => {
    setSending(true);
    try {
      const again = await send(s.body, s.coachFirstName);
      setResult((res) => res && { ...res, sections: res.sections.map((x) => (x.coachId === s.coachId ? again : x)) });
      setPages({});
      setReload((n) => n + 1);
    } catch (e) {
      onError(e);
    } finally {
      setSending(false);
    }
  };

  if (family.waiting || !kid) return <PendingGate family={family} />;

  if (r.view === 'result') {
    return result
      ? <ResultPage result={result} sending={sending} onRetry={retry}
          onPickAnother={(cid, date) => { setChosenCoach(cid); setSid(result.studentId); go(`#/book/day/${date}`); }} />
      : <Card><div className="pempty"><b>Nothing booked yet</b><a className="btn btn--primary" href="#/book"><span>Book a lesson</span></a></div></Card>;
  }

  const pickers = (
    <Pickers kids={kids} kid={kid} coachId={coachId} picks={picks}
      onKid={(id) => { if (id !== kid.studentId) { setSid(id); setChosenCoach(null); setPicks([]); } }}
      onCoach={setChosenCoach} />
  );
  const otherPicks = byCoach(picks).filter((g) => g.coachId !== coachId);
  const kept = otherPicks.length > 0 && (
    <Banner tone="info" title={`Your picks with ${otherPicks.map((g) => `Coach ${g.coachFirstName} (${g.picks.length})`).join(' and ')} are kept`}>
      They’re in Your picks and are booked together with these when you continue.
    </Banner>
  );

  if (loadError && !page) {
    return (
      <>
        <Head title="Book a lesson" actions={pickers} />
        <Banner tone="danger" title="Couldn’t load the lesson times">{loadError}</Banner>
        <div><Button variant="secondary" icon="refresh" onClick={() => setReload((n) => n + 1)}>Try again</Button></div>
      </>
    );
  }
  if (!page) return <><Head title="Book a lesson" actions={pickers} /><p className="muted" aria-busy="true">Loading…</p></>;

  const panel = (
    <PicksPanel picks={picks} onRemove={remove} onContinue={() => setConfirming(true)} />
  );
  const body = r.view === 'month'
    ? <MonthPage page={page} kid={kid} month={month && windowMonths(page.windowFirst, page.windowLast).includes(month) ? month : null}
        onMonth={setMonth} pickers={pickers} kept={kept} multiCoach={activeCoaches(kid).length > 1} />
    : <DayPage page={page} kid={kid} coachId={coachId} picks={picks} date={r.date!} week={r.view === 'week'}
        pickers={pickers} kept={kept} panel={panel} onToggle={toggle} />;
  return (
    <>
      {body}
      {confirming && <ConfirmDialog kid={kid} picks={picks} sending={sending} onBack={() => setConfirming(false)} onBook={book} />}
    </>
  );
}

// ------------------------------------------------------------------ parts

function Head({ title, lede, actions, crumb }: { title: string; lede?: string; actions?: ReactNode; crumb?: ReactNode }) {
  return (
    <div className="phead">
      <div className="phead__text">{crumb && <div className="crumb">{crumb}</div>}<h1 className="h1">{title}</h1>{lede && <p className="lede">{lede}</p>}</div>
      {actions && <div className="phead__actions">{actions}</div>}
    </div>
  );
}

/** A waiting family never sees the booking pages (ADR-022 d6). */
function PendingGate({ family }: { family: Family }) {
  const names = family.coaches.filter((c) => c.status === 'PENDING').map((c) => `Coach ${c.firstName}`);
  return (
    <Card>
      <div className="pempty">
        <span className="pempty__icon"><Icon name="lock" size={22} /></span>
        <b>Booking opens once {joinNames(names.length ? names : ['your coach'], 'or')} approves</b>
        <span className="muted">Until then you can see your own account and skaters. You can book here as soon as you’re approved.</span>
        <a className="btn btn--secondary" href="#/home"><span>Back to home</span></a>
      </div>
    </Card>
  );
}

/** Booking for, and the Coach dropdown when the skater has more than one coach (ADR-025 d3). */
function Pickers({ kids, kid, coachId, picks, onKid, onCoach }: {
  kids: Skater[]; kid: Skater; coachId: string; picks: Pick[]; onKid: (id: string) => void; onCoach: (id: string) => void;
}) {
  const id = useId();
  return (
    <div className="bk-pickers">
      {kids.length < 2
        ? <div className="picker"><span className="picker__label">Booking for</span><span className="picker__val"><Avatar name={kid.name} size="sm" />{kid.name}</span></div>
        : <div className="picker"><span className="picker__label">Booking for</span>
            <Seg label="Booking for" options={kids.map((k) => firstName(k.name))} selected={kids.indexOf(kid)} onSelect={(i) => onKid(kids[i]!.studentId)} /></div>}
      {kid.coaches.length > 1 && (
        <div className="picker">
          <label className="picker__label" htmlFor={id}>Coach</label>
          <select id={id} className="ctl bk-coachsel" value={coachId} onChange={(e) => onCoach(e.target.value)}>
            {kid.coaches.map((c) => {
              const ok = c.status === 'ACTIVE' && !!c.coachId, n = picks.filter((p) => p.coachId === c.coachId).length;
              return (
                <option key={c.coachId ?? `${c.firstName}${c.lastName}`} value={c.coachId ?? ''} disabled={!ok}>
                  Coach {c.firstName} {c.lastName}{ok ? (n ? ` · ${plural(n, 'pick')}` : '') : ' · waiting to approve'}
                </option>
              );
            })}
          </select>
        </div>
      )}
    </div>
  );
}

function NoticeHelp({ page }: { page: BookingPage }) {
  return (
    <Help title={`Cancelling with Coach ${page.coachFirstName}`}>
      Coach {page.coachFirstName} asks for {page.requiredNoticeHours} hours’ notice. Cancelling later than that may be charged.
    </Help>
  );
}

// ------------------------------------------------------------ 1 · Pick a day

function MonthPage({ page, kid, month, onMonth, pickers, kept, multiCoach }: {
  page: BookingPage; kid: Skater; month: string | null; onMonth: (ym: string) => void; pickers: ReactNode;
  kept: ReactNode; multiCoach: boolean;
}) {
  const months = windowMonths(page.windowFirst, page.windowLast);
  const ym = month ?? months[0]!;
  const mi = months.indexOf(ym);
  const first = `${ym}-01`, last = monthEnd(first), m = Number(ym.slice(5, 7)) - 1, year = ym.slice(0, 4);
  const openIn = (a: string, b: string) => page.times.filter((t) => t.date >= a && t.date <= b && t.free && !t.started).length;
  const totalOpen = openIn(first, last);
  const calbar = (
    <div className="calbar">
      <button type="button" className="iconbtn" aria-label="Previous month" disabled={mi <= 0} onClick={() => onMonth(months[mi - 1]!)}><Icon name="chevL" size={18} /></button>
      <div className="calbar__title">{MONTHS_LONG[m]} {year}</div>
      <button type="button" className="iconbtn" aria-label="Next month" disabled={mi >= months.length - 1} onClick={() => onMonth(months[mi + 1]!)}><Icon name="chevR" size={18} /></button>
    </div>
  );
  const pad = Array.from({ length: dayOfWeek(first) }, (_, i) => <div key={`p${i}`} className="cal__cell cal__cell--pad" />);
  const days = Array.from({ length: Number(last.slice(8)) }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
  const grid = (cell: (date: string) => ReactNode) => (
    <div className="cal">
      <div className="cal__dow">{DAYS.map((d) => <span key={d}>{d}</span>)}</div>
      <div className="cal__grid">{pad}{days.map(cell)}</div>
    </div>
  );

  if (!page.hasSchedule) {
    return (
      <>
        <Head title="Book a lesson" lede={`Coach ${page.coachFirstName} ${page.coachLastName}`} actions={pickers} />
        <Card>
          {calbar}
          <div className="cal-wrap">
            {grid((d) => <div key={d} className="cal__cell cal__cell--off"><span className="cal__num">{Number(d.slice(8))}</span></div>)}
            <div className="cal-empty"><span className="cal-empty__icon"><Icon name="calendar" size={24} /></span>
              <h2 className="h2">No lesson times yet</h2><p>{page.coachFirstName} hasn’t posted any times. Check back soon.</p></div>
          </div>
        </Card>
      </>
    );
  }

  const kf = firstName(kid.name);
  const cell = (date: string) => {
    const n = inWindow(date, page.windowFirst, page.windowLast) ? openOn(page, date).length : 0;
    const mine = page.familyLessons.some((l) => l.date === date && l.studentId === kid.studentId);
    const today = date === page.today ? ' bk-today' : '';
    // Only a tick in the square: the legend says what it means (owner, 2026-11-11).
    const head = (
      <span className="bk-cellhead"><span className="cal__num">{Number(date.slice(8))}</span>
        {mine && <span className="bk-calmine" title={`${kf} has a lesson`}><Icon name="check" size={12} /></span>}</span>
    );
    const has = mine ? `, ${kf} has a lesson` : '';
    if (!n) return <div key={date} className={`cal__cell cal__cell--off${today}`} aria-label={mine ? `${longDate(date)}${has}` : undefined}>{head}</div>;
    return (
      <button key={date} type="button" className={`cal__cell cal__cell--open${today}`} aria-label={`${longDate(date)}, ${plural(n, 'open time')}${has}`}
        onClick={() => go(`#/book/day/${date}`)}>
        {head}
        <span className="cal__meta">{n} open</span>
      </button>
    );
  };
  const weeks = monthWeeks(ym).map((sun, i) => openIn(sun, addDays(sun, 6))
    ? <button key={sun} type="button" className="bk-week" onClick={() => go(`#/book/week/${sun}`)}><b>Week {i + 1}</b><span>{shortDate(sun)} – {shortDate(addDays(sun, 6))}</span></button>
    : <div key={sun} className="bk-week bk-week--off"><b>Week {i + 1}</b><span>Nothing open</span></div>);

  return (
    <>
      <Head title="Book a lesson" lede={`Pick a day to see Coach ${page.coachFirstName}’s open times for ${kf}.`} actions={pickers} />
      {kept}
      <div className="split split--cal bk-split">
        <Card>
          {calbar}
          <div className="bk-scroll"><div className="bk-calgrid"><div className="bk-weeks"><div className="bk-weeks__h">Jump to</div>{weeks}</div>{grid(cell)}</div></div>
          <div className="legend">
            <span className="legend__item"><i className="sw sw--open" />Open times</span>
            <span className="legend__item"><i className="sw sw--off" />Nothing open</span>
            <span className="legend__item"><Icon name="check" size={12} />{kf} has a lesson</span>
            <span className="legend__note">{plural(totalOpen, 'open time')} in {MONTHS_LONG[m]}</span>
          </div>
        </Card>
        <div className="stack">
          <Card title="Months">
            <div className="bk-months">{months.map((x) => (
              <button key={x} type="button" className={`bk-month${x === ym ? ' is-on' : ''}`} aria-pressed={x === ym} onClick={() => onMonth(x)}>
                <b>{MONTHS_LONG[Number(x.slice(5, 7)) - 1]}</b><span>{plural(openIn(`${x}-01`, monthEnd(`${x}-01`)), 'open time')}</span>
              </button>
            ))}</div>
          </Card>
          <NoticeHelp page={page} />
          <Help title="Booking window">You can see three months ahead. Times are in Coach {page.coachFirstName}’s time zone, {timezoneLabel(page.coachTimezone)}.</Help>
          {multiCoach && <Help title="More than one coach">Pick a coach above to see their times. Times you’ve picked with one coach stay picked when you switch.</Help>}
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------- 2 · Pick your times

function DayPage({ page, kid, coachId, picks, date, week, pickers, kept, panel, onToggle }: {
  page: BookingPage; kid: Skater; coachId: string; picks: Pick[]; date: string; week: boolean; pickers: ReactNode;
  kept: ReactNode; panel: ReactNode; onToggle: (t: TimeDto) => void;
}) {
  const { windowFirst: first, windowLast: last } = page;
  // A week link opens that week at its first day with an open time (design: bkWeek).
  const start = week ? (Array.from({ length: 7 }, (_, i) => addDays(date, i)).find((d) => inWindow(d, first, last) && openOn(page, d).length) ?? date) : date;
  const iso = clamp(start, first, last);
  const sun = weekStart(iso);
  const prevOk = sun > first, nextOk = addDays(sun, 7) <= last;
  const times = timesOn(page, iso);
  const open = openOn(page, iso).length;
  const picked = (t: TimeDto) => picks.some((p) => samePick(p, coachId, t.date, t.startTime));
  const own = (t: TimeDto) => page.familyLessons.find((l) => l.date === t.date && l.startTime === t.startTime);

  const strip = (
    <div className="daystrip bk-strip">
      <button type="button" className="iconbtn" aria-label="Previous week" disabled={!prevOk} onClick={() => go(`#/book/day/${clamp(addDays(iso, -7), first, last)}`)}><Icon name="chevL" size={18} /></button>
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(sun, i);
        if (!inWindow(d, first, last)) {
          return <button key={d} type="button" className="dchip dchip--off" disabled aria-label={`${longDate(d)}: outside the booking window`}>
            <span className="dchip__dow">{DAYS[dayOfWeek(d)]}</span><span className="dchip__n">{Number(d.slice(8))}</span><span className="dchip__s">—</span></button>;
        }
        const n = openOn(page, d).length, c = picks.filter((p) => p.coachId === coachId && p.date === d).length;
        const s = !timesOn(page, d).length ? 'No ice' : n ? `${n} open` : 'Full';
        return (
          <button key={d} type="button" className={`dchip${d === iso ? ' dchip--sel' : !n ? ' dchip--off' : c ? ' dchip--has' : ''}`}
            aria-current={d === iso ? 'date' : undefined} aria-label={`${longDate(d)}: ${s}`} onClick={() => go(`#/book/day/${d}`)}>
            <span className="dchip__dow">{DAYS[dayOfWeek(d)]}</span><span className="dchip__n">{Number(d.slice(8))}</span><span className="dchip__s">{s}</span>
            {c > 0 && <span className="dchip__count">{c}</span>}
          </button>
        );
      })}
      <button type="button" className="iconbtn" aria-label="Next week" disabled={!nextOk} onClick={() => go(`#/book/day/${clamp(addDays(iso, 7), first, last)}`)}><Icon name="chevR" size={18} /></button>
    </div>
  );

  const runs = blockRuns(times);
  const body = !times.length
    ? <div className="pempty"><span className="pempty__icon"><Icon name="calOff" size={22} /></span>
        <b>No lessons with {page.coachFirstName} on {DAYS_LONG[dayOfWeek(iso)]}s</b><span className="muted">Pick another day above.</span></div>
    : <>
        <div className="tl">{runs.map((run, ri) => {
          const prev = runs[ri - 1];
          return (
            <div key={`${run[0]!.blockSeq}-${run[0]!.startTime}`} className="tl__sec">
              <div className="tl__label">{blockLabel(run[0]!.blockName, run[0]!.blockSeq)} <span>{run[0]!.durationMinutes} min · {formatMoney(run[0]!.priceMinor)}</span></div>
              {prev && <div className="tl__gap"><Icon name="ban" size={14} />Not on the ice {formatTime(prev[prev.length - 1]!.endTime)} – {formatTime(run[0]!.startTime)}</div>}
              <div className="tl__col">{run.map((t) => {
                const mine = own(t), st = slotState(t, picked(t), !!mine);
                const label = st === 'yours' ? `${firstName(mine!.studentName)}’s lesson` : st === 'taken' ? 'Taken' : st === 'past' ? 'Past' : formatMoney(t.priceMinor);
                const cls = `slot slot--${t.durationMinutes} ${st === 'picked' ? 'slot--mine' : st === 'taken' || st === 'past' ? 'slot--taken' : st === 'yours' ? 'slot--taken bk-yours' : 'slot--open'}`;
                const inner = <>
                  <span className="slot__time">{formatTime(t.startTime)}<small> – {formatClock(t.endTime)}</small></span>
                  <span className="slot__len">{t.durationMinutes} min</span>
                  <span className="slot__price">{label}</span>
                  <span className="slot__mark">{st === 'picked' ? <Icon name="check" size={14} /> : st === 'yours' ? <Icon name="check" size={12} /> : null}</span>
                </>;
                return st === 'open' || st === 'picked'
                  ? <button key={t.startTime} type="button" className={cls} aria-pressed={st === 'picked'} onClick={() => onToggle(t)}>{inner}</button>
                  : <div key={t.startTime} className={cls}>{inner}</div>;
              })}</div>
            </div>
          );
        })}</div>
        <div className="legend">
          <span className="legend__item"><i className="sw sw--open" />Open</span>
          <span className="legend__item"><i className="sw sw--sel" />Your pick</span>
          <span className="legend__item"><i className="sw sw--taken" />Taken</span>
          <span className="legend__item"><i className="sw bk-sw-yours" />Your family’s lesson</span>
          <span className="legend__note">Taller = longer lesson</span>
        </div>
      </>;

  return (
    <>
      <Head title={week ? `Week of ${shortDate(sun)}` : longDate(iso)}
        lede={week ? `${longDate(iso)} · ${plural(open, 'open time')} · pick times on any day this week`
          : times.length ? `${open} of ${times.length} times still open · picks are kept as you move between days` : 'No lesson times on this day'}
        actions={pickers}
        crumb={<a className="link" href="#/book"><Icon name="arrowL" size={14} /> {MONTHS_LONG[Number(iso.slice(5, 7)) - 1]}</a>} />
      {strip}
      {kept}
      <div className="split split--tl">
        <Card title={`Coach ${page.coachFirstName}’s open times`}
          sub={`Tap an open time to add it. Tap it again to remove it. Times are in Coach ${page.coachFirstName}’s time zone, ${timezoneLabel(page.coachTimezone)}.`}>{body}</Card>
        <div className="stack sticky">
          <Card title="Your picks" sub={`For ${kid.name}`}>{panel}</Card>
          <NoticeHelp page={page} />
        </div>
      </div>
    </>
  );
}

/** Your picks: grouped by coach when there's more than one, each with its own total; never one total across coaches. */
function PicksPanel({ picks, onRemove, onContinue }: { picks: Pick[]; onRemove: (p: Pick) => void; onContinue: () => void }) {
  if (!picks.length) {
    return <><p className="fine">No times picked yet.</p><Button block lg iconRight="arrowR" disabled>Continue</Button></>;
  }
  const groups = byCoach(picks), multi = groups.length > 1;
  const mins = picks.reduce((s, p) => s + p.durationMinutes, 0);
  return (
    <>
      {groups.map((g) => (
        <div key={g.coachId}>
          {multi && <div className="bk-pickcoach"><b>Coach {g.coachFirstName}</b><span>{formatMoney(g.picks.reduce((s, p) => s + p.priceMinor, 0))}</span></div>}
          <div className="picks">{g.picks.map((p) => (
            <div key={p.coachId + p.date + p.startTime} className="pick">
              <div className="pick__when"><b>{dayLabel(p.date)} · {formatTime(p.startTime)}</b><small>{p.durationMinutes} min</small></div>
              <span className="pick__price">{formatMoney(p.priceMinor)}</span>
              <button type="button" className="iconbtn iconbtn--sm" aria-label={`Remove ${dayLabel(p.date)} ${formatTime(p.startTime)}`} onClick={() => onRemove(p)}><Icon name="x" size={14} /></button>
            </div>
          ))}</div>
        </div>
      ))}
      <div className="total">
        <span>{plural(picks.length, 'lesson')} · {duration(mins)}</span>
        {multi ? <span className="bk-total-note">Paid to each coach separately</span> : <span className="total__v">{formatMoney(picks.reduce((s, p) => s + p.priceMinor, 0))}</span>}
      </div>
      <Button block lg iconRight="arrowR" onClick={onContinue}>Continue</Button>
    </>
  );
}

// ------------------------------------------------------------ 3 · Confirm

function ConfirmDialog({ kid, picks, sending, onBack, onBook }: {
  kid: Skater; picks: Pick[]; sending: boolean; onBack: () => void; onBook: () => void;
}) {
  const titleId = useId();
  const groups = byCoach(picks), multi = groups.length > 1, kf = firstName(kid.name);
  const fullName = (cid: string) => { const c = kid.coaches.find((x) => x.coachId === cid); return c ? `${c.firstName} ${c.lastName}` : ''; };
  const total = (ps: Pick[]) => formatMoney(ps.reduce((s, p) => s + p.priceMinor, 0));
  return (
    <Dialog onClose={onBack} labelledBy={titleId}>
      <div className="dialog__icon"><Icon name="calendar" size={22} /></div>
      <h2 className="h2" id={titleId}>Book for {kf}</h2>
      <p className="fine">{multi ? `With ${plural(groups.length, 'coach', 'coaches')}. Each coach gets their own booking and confirmation email.` : `With Coach ${fullName(groups[0]!.coachId)}.`}</p>
      {groups.map((g) => (
        <div key={g.coachId}>
          {multi && <div className="bk-dlist__h">Coach {fullName(g.coachId)}</div>}
          <div className="bk-dlist">{g.picks.map((p) => (
            <Row key={p.date + p.startTime}
              lead={<span className="dateblock"><b>{Number(p.date.slice(8))}</b><small>{MONTHS[Number(p.date.slice(5, 7)) - 1]}</small></span>}
              title={`${DAYS_LONG[dayOfWeek(p.date)]} · ${formatTime(p.startTime)}`} sub={`${p.durationMinutes} minutes`}
              side={<span className="money">{formatMoney(p.priceMinor)}</span>} />
          ))}</div>
        </div>
      ))}
      <div className="summary">
        <div>
          <div className="kv"><span className="kv__k">Lessons</span><span className="kv__v">{plural(picks.length, 'lesson')}</span></div>
          {multi
            ? groups.map((g) => <div key={g.coachId} className="kv"><span className="kv__k">Coach {g.coachFirstName}</span><span className="kv__v">{plural(g.picks.length, 'lesson')} · <b>{total(g.picks)}</b></span></div>)
            : <div className="kv"><span className="kv__k">Total</span><span className="kv__v"><b>{total(picks)}</b></span></div>}
        </div>
        <div className="summary__note"><Icon name="info" size={14} />{multi ? 'You pay each coach directly' : `You pay ${groups[0]!.coachFirstName} directly`}. BladeBook only sends reminders.</div>
      </div>
      <div className="dialog__actions">
        <Button variant="secondary" onClick={onBack} disabled={sending}>Back</Button>
        <Button onClick={onBook} disabled={sending}>{sending ? 'Booking…' : `Book ${plural(picks.length, 'lesson')}`}</Button>
      </div>
    </Dialog>
  );
}

// -------------------------------------------------------------- 4 · Result

function ResultPage({ result, sending, onRetry, onPickAnother }: {
  result: Result; sending: boolean; onRetry: (s: Section) => void; onPickAnother: (coachId: string, date: string) => void;
}) {
  const kf = firstName(result.studentName);
  const items = result.sections.flatMap((s) => (s.result?.picks ?? []).map((p) => ({ ...p, coachId: s.coachId, coachFirstName: s.coachFirstName })));
  const booked = items.filter((x) => x.outcome === 'BOOKED'), mine = items.filter((x) => x.outcome === 'ALREADY_BOOKED');
  const skipped = items.filter((x) => x.outcome === 'UNAVAILABLE');
  const failed = result.sections.filter((s) => s.error);
  const perCoach = result.sections.length > 1;
  const n = booked.length;
  const title = failed.length
    ? (n ? `${plural(n, 'lesson')} booked for ${kf}, but not with ${joinNames(failed.map((s) => `Coach ${s.coachFirstName}`), 'or')}` : `Nothing was booked for ${kf}`)
    : mine.length ? `${kf}’s lessons, as they stand now` : n ? `${plural(n, 'lesson')} booked for ${kf}` : `Nothing new was booked for ${kf}`;
  const sub = failed.length ? `Each coach’s booking goes through on its own. Try again below for the ${failed.length === 1 ? 'one' : 'ones'} that didn’t.`
    : mine.length ? `Some of these times were already booked for ${kf}, so nothing was booked twice.${n ? ' A confirmation email is on its way for the new ones.' : ''}`
    : `${n ? `A confirmation email is on its way${perCoach ? ' from each coach' : ''}. ` : ''}${skipped.length ? `${plural(skipped.length, 'date')} couldn’t be booked${n ? '. Everything else is confirmed.' : '.'}` : ''}`;
  const ok = (n > 0 || mine.length > 0) && !failed.length;

  const pickCards = (ps: typeof items) => (
    <div className="grid2 bk-series">{ps.map((p) => {
      const done = p.outcome !== 'UNAVAILABLE';
      return (
        <section key={p.coachId + p.date + p.startTime} className="card"><div className="card__body"><div className="series">
          <div className="series__title"><Icon name="calendar" size={16} />{dDow(p.date)} · {formatTime(p.startTime)}</div>
          <div className="series__sub">{p.durationMinutes != null && p.priceMinor != null ? `${p.durationMinutes} min · ${formatMoney(p.priceMinor)}` : 'No longer on the schedule'}</div>
          <div className="meter meter--ok"><span style={{ width: done ? '100%' : '0%' }} /></div>
          <div className="series__foot"><b>{p.outcome === 'BOOKED' ? '1 booked' : p.outcome === 'ALREADY_BOOKED' ? 'Already yours' : 'None new'}</b><span>{done ? 'All dates' : '1 unavailable'}</span></div>
        </div></div></section>
      );
    })}</div>
  );
  const skippedCard = (ps: typeof items) => ps.length > 0 && (
    <Card flush title={`${plural(ps.length, 'date')} need${ps.length === 1 ? 's' : ''} another time`} sub="Or leave them. The rest of your bookings are confirmed.">
      {ps.map((p) => (
        <Row key={p.coachId + p.date + p.startTime} lead={<span className="roundicon roundicon--warn"><Icon name="x" size={16} /></span>}
          title={`${dDow(p.date)} · ${formatTime(p.startTime)}`} sub={p.message ?? UNAVAILABLE}
          side={<Button variant="secondary" sm onClick={() => onPickAnother(p.coachId, p.date)}>Pick another time</Button>} />
      ))}
    </Card>
  );
  const section = (s: Section) => {
    const its = items.filter((x) => x.coachId === s.coachId), nb = its.filter((x) => x.outcome === 'BOOKED').length;
    const sk = its.filter((x) => x.outcome === 'UNAVAILABLE');
    const others = result.sections.filter((x) => x.coachId !== s.coachId && !x.error).map((x) => `Coach ${x.coachFirstName}`);
    return (
      <div key={s.coachId} className="stack">
        <div className="bk-rescoach"><Avatar name={s.coachFirstName} size="sm" />
          <div><b>Coach {s.coachFirstName}</b>
            <span>{s.error ? 'Not booked' : `${nb ? `${plural(nb, 'lesson')} booked · confirmation email sent` : 'Nothing new booked'}${sk.length ? ` · ${plural(sk.length, 'date')} unavailable` : ''}`}</span></div>
          {s.error ? <Badge tone="danger" icon="alert">Didn’t go through</Badge> : (nb || its.some((x) => x.outcome === 'ALREADY_BOOKED')) ? <Badge tone="success" icon="check">Booked</Badge> : null}
        </div>
        {s.error
          ? <section className="card card--attn"><div className="card__body"><div className="decide">
              <div><div className="row__title">Nothing was booked with Coach {s.coachFirstName}</div>
                <div className="row__sub">{s.error} {others.length ? `Lessons with ${joinNames(others)} are booked and aren’t affected. ` : ''}{s.retryable ? 'Trying again books only these, and nothing is booked twice.' : ''}</div></div>
              {s.retryable && <div className="decide__btns"><Button icon="refresh" disabled={sending} onClick={() => onRetry(s)}>Try again</Button></div>}
            </div></div></section>
          : <>{pickCards(its)}{skippedCard(sk)}</>}
      </div>
    );
  };

  return (
    <>
      <div className={`hero ${ok ? 'hero--success' : 'bk-hero--warn'}`}>
        <span className="hero__icon"><Icon name={ok ? 'check' : 'alert'} size={26} /></span>
        <div><h1 className="h1">{title}</h1>{sub && <p className="lede">{sub}</p>}</div>
      </div>
      {perCoach || failed.length ? result.sections.map(section) : <>{pickCards(items)}{skippedCard(skipped)}</>}
      {mine.length > 0 && (
        <Card flush title={`Already booked for ${kf}`} sub="From an earlier booking. They weren’t booked again.">
          {mine.map((p) => (
            <Row key={p.coachId + p.date + p.startTime} lead={<span className="roundicon roundicon--ok"><Icon name="check" size={16} /></span>}
              title={`${dDow(p.date)} · ${formatTime(p.startTime)}${perCoach ? ` · Coach ${p.coachFirstName}` : ''}`} sub={`Already booked for ${kf}`}
              side={p.durationMinutes != null ? <span className="muted">{p.durationMinutes} min</span> : undefined} />
          ))}
        </Card>
      )}
      <div className="actions">
        <div><a className="btn btn--secondary" href="#/book"><span>Book more</span></a></div>
        <div className="actions__r"><a className="btn btn--primary" href="#/home"><span>Back to home</span></a></div>
      </div>
    </>
  );
}
