/**
 * The coach's calendar, Batch 2 (design: coach/screens-calendar.js → calendar-month, calendar-week,
 * calendar-day). Dates, "today" and "now" are the coach's, from api-coach, never the browser's.
 *
 * Rulings applied: S7 clicking a month date opens that day; S12 the day view as drawn (ruled 2026-11-08).
 * Batch 4: a booked time names its skater, "Ava P." in the week and in full with the family in the day.
 * Batch 5 (closes G-11): a booked lesson that hasn't started can be cancelled from the week (tap it) and the day
 * (Cancel), a whole day with Cancel day, and the rest of the week with Cancel rest of week. Each goes through the
 * cancel preview (CancelPreview.tsx) and needs the coach to accept.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Avatar, Banner, Icon } from '../../shared/components/harbor';
import { plural } from '../../shared/logic/booking';
import {
  DAYS, DAYS_LONG, MONTHS_LONG, addDays, addMonths, dayOfWeek, formatClock, formatMoney, formatTime, longDate,
  monthEnd, shortDate, toMinutes, weekStart,
} from '../../shared/logic/schedule';
import type { CalendarDto, LessonDto, ScheduleApi } from '../api';
import { CancelPreview, calRange, doneMessage, type CancelPlan } from './CancelPreview';

export type CalendarRoute = { view: 'month' | 'week' | 'day'; date: string };

const href = (view: CalendarRoute['view'], date: string) => `#/calendar/${view}/${date}`;
const isPast = (cal: CalendarDto, date: string, l: LessonDto) =>
  date < cal.today || (date === cal.today && toMinutes(l.startTime) + l.durationMinutes <= toMinutes(cal.now));
const isBooked = (l: LessonDto) => l.lessonStatus === 'BOOKED';
const isOpen = (cal: CalendarDto, date: string, l: LessonDto) => l.lessonStatus === 'OPEN' && !isPast(cal, date, l);
/** Started: past its start time. Nothing that has started can be cancelled (ADR-MASTER section 10). */
const isStarted = (cal: CalendarDto, date: string, l: LessonDto) =>
  date < cal.today || (date === cal.today && toMinutes(l.startTime) <= toMinutes(cal.now));
const cancellable = (cal: CalendarDto, date: string, l: LessonDto) => isBooked(l) && !isStarted(cal, date, l);
/** A shared lesson names both skaters: "Sam R. & Leo M." (design: whoIn). */
const whoIn = (l: LessonDto, full = false) => l.skaters.map((s) => (full ? s.fullName : s.shortName)).join(' & ') || 'Booked';

/** The dates a view needs: a month grid (whole weeks), a week, or one day. */
function span({ view, date }: CalendarRoute): [string, string] {
  if (view === 'day') return [date, date];
  if (view === 'week') return [weekStart(date), addDays(weekStart(date), 6)];
  return [weekStart(date), addDays(weekStart(monthEnd(date)), 6)];
}

export function Calendar({ api, route, onError }: { api: ScheduleApi; route: CalendarRoute; onError: (e: unknown) => void }) {
  const [cal, setCal] = useState<{ key: string; data: CalendarDto } | null>(null);
  const [from, to] = span(route);
  const key = `${from}/${to}`;
  const routeKey = `${route.view}/${route.date}`;
  // The preview and the message after it belong to the view they came from.
  const [cancel, setCancel] = useState<{ on: string; plan: CancelPlan } | null>(null);
  const [flash, setFlash] = useState<{ on: string; text: string } | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    api.calendar(from, to).then((data) => live && setCal({ key, data })).catch((e: unknown) => live && onError(e));
    return () => { live = false; };
  }, [api, from, to, key, onError, reload]);

  const views = (
    <div className="seg" role="group" aria-label="Calendar view">
      {(['month', 'week', 'day'] as const).map((v) => (
        <a key={v} className={`seg__opt${route.view === v ? ' is-on' : ''}`} aria-current={route.view === v ? 'page' : undefined}
          href={href(v, v === 'month' ? `${route.date.slice(0, 8)}01` : route.date)}>{v[0].toUpperCase() + v.slice(1)}</a>
      ))}
    </div>
  );

  if (!cal || cal.key !== key) {
    return <><div className="phead"><div className="phead__text"><h1 className="h1">Calendar</h1></div><div className="phead__actions">{views}</div></div>
      <p className="muted" aria-busy="true">Loading…</p></>;
  }
  const data = cal.data;
  const plan = cancel?.on === routeKey ? cancel.plan : null;
  if (plan) {
    return <CancelPreview plan={plan} api={api} onBack={() => setCancel(null)} onError={onError}
      onDone={(r) => { setCancel(null); setFlash({ on: routeKey, text: doneMessage(r) }); setReload((n) => n + 1); }} />;
  }
  const start = (p: CancelPlan) => { setFlash(null); setCancel({ on: routeKey, plan: p }); };
  const done = flash?.on === routeKey && <Banner tone="success">{flash.text}</Banner>;
  const prompt = !data.hasSchedule && (
    <Banner tone="info" title="You haven’t built your repeating weekly schedule yet">
      Families can book once it’s saved. <a className="link" href="#/schedule/weekly">Build your repeating weekly schedule</a>
    </Banner>
  );
  if (route.view === 'month') return <Month data={data} first={route.date} views={views} prompt={prompt} />;
  if (route.view === 'week') return <>{done}<Week data={data} start={from} views={views} prompt={prompt} onCancel={start} /></>;
  return <>{done}<Day data={data} date={route.date} views={views} prompt={prompt} onCancel={start} /></>;
}

interface ViewProps { data: CalendarDto; views: ReactNode; prompt: ReactNode }

/** Booked lessons on a date that haven't started: what Cancel day takes. */
const futureOn = (data: CalendarDto, date: string, lessons: LessonDto[]) =>
  lessons.filter((l) => cancellable(data, date, l)).map((l) => ({ date, l }));
const dayPlan = (scope: 'LESSON' | 'DAY', backLabel: string, lessons: CancelPlan['lessons']): CancelPlan => ({ scope, backLabel, lessons, open: [] });

/** Cancel rest of week: from now to Saturday (all of a future week), every booked lesson and open time (S8). */
function restOfWeek(data: CalendarDto, start: string): CancelPlan {
  const lessons = data.days.flatMap(({ date, lessons: ls }) => futureOn(data, date, ls));
  const open = data.days.flatMap(({ date, lessons: ls }) => ls.filter((l) => l.lessonStatus === 'OPEN' && !isStarted(data, date, l)).map((l) => ({ date, l })));
  return { scope: 'WEEK', backLabel: `Week of ${shortDate(start)}`, lessons, open, weekStart: start };
}

function Head({ title, lede, actions, crumb }: { title: string; lede: string; actions: ReactNode; crumb?: ReactNode }) {
  return (
    <div className="phead">
      <div className="phead__text">{crumb && <div className="crumb">{crumb}</div>}<h1 className="h1">{title}</h1>{lede && <p className="lede">{lede}</p>}</div>
      <div className="phead__actions">{actions}</div>
    </div>
  );
}

function Steps({ label, prev, next, today }: { label: string; prev: string; next: string; today: string }) {
  return (
    <div className="btngroup">
      <a className="iconbtn" aria-label={`Previous ${label}`} href={prev}><Icon name="chevL" size={18} /></a>
      <a className="btn btn--secondary btn--sm" href={today}><span>Today</span></a>
      <a className="iconbtn" aria-label={`Next ${label}`} href={next}><Icon name="chevR" size={18} /></a>
    </div>
  );
}

// ------------------------------------------------------------------ month

function Month({ data, first, views, prompt }: ViewProps & { first: string }) {
  const last = monthEnd(first);
  const month = Number(first.slice(5, 7)) - 1, year = first.slice(0, 4);
  let booked = 0, open = 0;
  const weeks = data.days.reduce<CalendarDto['days'][]>((w, d, i) => { if (i % 7 === 0) w.push([]); w[w.length - 1].push(d); return w; }, []);
  const rows = weeks.map((week, i) => {
    const ws = week[0].date, from = ws < first ? first : ws, to = addDays(ws, 6) > last ? last : addDays(ws, 6);
    const now = ws <= data.today && data.today <= addDays(ws, 6);
    return [
      <a key={`w${ws}`} className={`cal-wk${now ? ' is-now' : ''}`} href={href('week', from)}><b>Week {i + 1}</b><small>{shortDate(from)} – {shortDate(to)}</small></a>,
      ...week.map(({ date, lessons, special }) => {
        const inMonth = date >= first && date <= last;
        const b = lessons.filter(isBooked).length, o = lessons.filter((l) => isOpen(data, date, l)).length;
        if (inMonth) { booked += b; open += o; }
        const cls = `cal-day${lessons.length ? '' : ' cal-day--off'}${inMonth ? '' : ' cal-day--out'}${date === data.today ? ' is-today' : ''}${date < data.today ? ' cal-day--past' : ''}`;
        return (
          <a key={date} className={cls} href={href('day', date)} aria-label={`${longDate(date)}: ${b} booked, ${o} open`}>
            <span className="cal-day__num">{Number(date.slice(8))}{date === data.today && <em>Today</em>}</span>
            <span className="cal-day__meta">
              {special && <span className={`cal-chip cal-chip--${special.kind === 'TIME_OFF' ? 'off' : 'special'}`}>{special.kind === 'TIME_OFF' ? 'Time off' : special.name}</span>}
              {lessons.length
                ? <>{b > 0 && <span className="cal-chip">{b} booked</span>}{o > 0 && <span className="cal-chip cal-chip--open">{o} open</span>}</>
                : !special && <span className="cal-day__none">No lessons</span>}
            </span>
          </a>
        );
      }),
    ];
  });
  return (
    <>
      <Head title="Calendar" lede={`${MONTHS_LONG[month]}: ${plural(booked, 'lesson')} booked, ${plural(open, 'open time')} left.`} actions={views} />
      {prompt}
      <section className="card"><div className="card__body">
        <div className="calbar">
          <a className="iconbtn" aria-label="Previous month" href={href('month', addMonths(first, -1))}><Icon name="chevL" size={18} /></a>
          <div className="calbar__title">{MONTHS_LONG[month]} {year}</div>
          <a className="iconbtn" aria-label="Next month" href={href('month', addMonths(first, 1))}><Icon name="chevR" size={18} /></a>
          <a className="btn btn--secondary btn--sm" href={href('month', `${data.today.slice(0, 8)}01`)}><span>Today</span></a>
        </div>
        <div className="cal-scroll"><div className="cal-month">
          <span className="cal-month__h" />{DAYS.map((d) => <span key={d} className="cal-month__h">{d}</span>)}
          {rows}
        </div></div>
        <div className="legend">
          <span className="legend__item"><i className="sw sw--booked" />Booked lessons</span>
          <span className="legend__item"><i className="sw sw--open" />Open times left</span>
          <span className="legend__item"><i className="sw sw--off" />No lessons scheduled</span>
          <span className="legend__note">Pick a day for its lessons, or a week on the left.</span>
        </div>
      </div></section>
    </>
  );
}

// ------------------------------------------------------------------- week

function Week({ data, start, views, prompt, onCancel }: ViewProps & { start: string; onCancel: (p: CancelPlan) => void }) {
  const end = addDays(start, 6);
  const thisWeek = start === weekStart(data.today);
  const back = `Week of ${shortDate(start)}`;
  const cols = data.days.map(({ date, lessons, special }) => {
    const colCls = date < data.today ? ' week__col--past' : date === data.today ? ' week__col--today' : '';
    const fut = futureOn(data, date, lessons);
    return (
      <div key={date} className={`week__col${colCls}`}>
        <a className="week__head cal-head" href={href('day', date)}>
          <span>{DAYS[dayOfWeek(date)]}</span><b>{Number(date.slice(8))}</b>{date === data.today && <em>Today</em>}
        </a>
        {special?.kind === 'SPECIAL' && <div className="cal-colnote">{special.name}</div>}
        <div className="week__body">
          {lessons.length ? lessons.map((l) => {
            const kind = l.lessonStatus === 'OPEN' ? 'open' : l.lessonStatus === 'HELD' ? 'held' : '';
            const cls = `wl${kind ? ` wl--${kind}` : ''}${isPast(data, date, l) ? ' wl--past' : ''}`;
            const inner = <>
              <span className="wl__t">{formatClock(l.startTime)}{l.durationMinutes !== 30 ? ` · ${l.durationMinutes}m` : ''}</span>
              <span className="wl__n">{l.lessonStatus === 'OPEN' ? 'Open' : l.lessonStatus === 'HELD' ? 'Held' : whoIn(l)}</span>
            </>;
            return cancellable(data, date, l)
              ? <button key={l.startTime} type="button" className={`${cls} cal-wl`} title={`Cancel ${whoIn(l, true)}’s lesson`}
                  onClick={() => onCancel(dayPlan('LESSON', back, [{ date, l }]))}>{inner}</button>
              : <div key={l.startTime} className={cls}>{inner}</div>;
          }) : <div className="week__empty">{special?.kind === 'TIME_OFF' ? <>Time off<br /><small>{special.name}</small></> : 'No lessons'}</div>}
        </div>
        {fut.length > 0 && <button type="button" className="week__cancel" onClick={() => onCancel(dayPlan('DAY', back, fut))}>Cancel day</button>}
      </div>
    );
  });
  const now = data.now;
  const rest = restOfWeek(data, start);
  const dates = [...rest.lessons, ...rest.open].map((x) => x.date).sort();
  const restBtn = dates.length > 0 && (
    <button type="button" className="btn btn--danger-outline" onClick={() => onCancel(rest)}>
      <Icon name="calOff" /><span>Cancel rest of week: {calRange(dates[0]!, dates[dates.length - 1]!)} ({plural(rest.lessons.length, 'lesson')}, {plural(rest.open.length, 'open time')})</span>
    </button>
  );
  return (
    <>
      <Head title={`Week of ${shortDate(start)}`}
        lede={thisWeek ? `It’s ${DAYS_LONG[dayOfWeek(data.today)]} ${formatTime(now)}. Past lessons are greyed and can’t be cancelled.`
          : `${shortDate(start)} – ${shortDate(end)}. Tap a booked lesson to cancel just that one.`}
        actions={<>{views}<Steps label="week" prev={href('week', addDays(start, -7))} next={href('week', addDays(start, 7))} today={href('week', data.today)} />{restBtn}</>} />
      {prompt}
      <section className="card"><div className="card__body" style={{ padding: 0 }}>
        <div className="cal-scroll"><div className="week">{cols}</div></div>
      </div></section>
      <div className="legend">
        <span className="legend__item"><i className="sw sw--booked" />Booked</span>
        <span className="legend__item"><i className="sw sw--open" />Open</span>
        <span className="legend__item"><i className="sw sw--held" />Held (you kept it closed)</span>
        <span className="legend__item"><i className="sw sw--off" />Past</span>
        <span className="legend__note">Sick today? Use Cancel day. Your schedule doesn’t change.</span>
      </div>
    </>
  );
}

// -------------------------------------------------------------------- day

function Day({ data, date, views, prompt, onCancel }: ViewProps & { date: string; onCancel: (p: CancelPlan) => void }) {
  const lessons = data.days[0]?.lessons ?? [];
  const special = data.days[0]?.special ?? null;
  const fut = futureOn(data, date, lessons);
  const back = longDate(date);
  const booked = lessons.filter(isBooked).length, open = lessons.filter((l) => isOpen(data, date, l)).length;
  const lede = lessons.length
    ? `${plural(booked, 'lesson')} booked · ${plural(open, 'open time')}${date === data.today ? ` · it’s ${formatTime(data.now)}` : ''}`
    : date === data.today ? 'Today' : '';
  return (
    <>
      <Head title={longDate(date)} lede={lede}
        crumb={<a className="link" href={href('week', date)}><Icon name="arrowL" size={14} /> Week of {shortDate(weekStart(date))}</a>}
        actions={<>{views}<Steps label="day" prev={href('day', addDays(date, -1))} next={href('day', addDays(date, 1))} today={href('day', data.today)} /></>} />
      {prompt}
      {special?.kind === 'SPECIAL' && <Banner tone="info" title={`Special schedule: ${special.name}`}>{shortDate(special.startDate)} – {shortDate(special.endDate)}. These times replace your weekly schedule.</Banner>}
      <section className="card">
        {lessons.length > 0 && <header className="card__head"><div><h2 className="h2">Every time on this day</h2></div>
          {fut.length > 0 && <button type="button" className="btn btn--danger-outline btn--sm" onClick={() => onCancel(dayPlan('DAY', back, fut))}>
            <Icon name="calOff" size={14} /><span>Cancel this day</span></button>}</header>}
        <div className="card__body" style={{ padding: 0 }}>
          {lessons.length ? lessons.map((l) => (
            <div key={l.startTime} className={`row${isPast(data, date, l) ? ' row--muted' : ''}`}>
              <div className="row__main">
                <span className="cal-slot__t num">{formatTime(l.startTime)}</span>
                {l.lessonStatus === 'OPEN'
                  ? <><span className="roundicon"><Icon name="plus" size={14} /></span><div><div className="row__title">Open</div><div className="row__sub">Families can book this time</div></div></>
                  : l.lessonStatus === 'HELD'
                    ? <><span className="roundicon roundicon--warn"><Icon name="lock" size={14} /></span><div><div className="row__title">Held</div><div className="row__sub">You kept this time closed</div></div></>
                    : <><Avatar name={whoIn(l, true)} size="sm" /><div><div className="row__title">{whoIn(l, true)}</div>
                        {l.skaters.some((s) => s.familyName) && <div className="row__sub">{[...new Set(l.skaters.map((s) => s.familyName).filter(Boolean))].join(' · ')}</div>}</div></>}
              </div>
              <div className="row__side"><span className="muted num">{l.durationMinutes} min · {formatMoney(l.priceMinor)}</span>
                {cancellable(data, date, l) && <button type="button" className="btn btn--ghost btn--sm"
                  onClick={() => onCancel(dayPlan('LESSON', back, [{ date, l }]))}><span>Cancel</span></button>}</div>
            </div>
          )) : special?.kind === 'TIME_OFF' ? (
            <div className="pempty">
              <span className="pempty__icon"><Icon name="calOff" size={22} /></span>
              <b>Time off: {special.name}</b>
              <span className="muted">{shortDate(special.startDate)} – {shortDate(special.endDate)}. Families can’t book these days.</span>
            </div>
          ) : (
            <div className="pempty">
              <span className="pempty__icon"><Icon name="calendar" size={22} /></span>
              <b>No lessons on {DAYS_LONG[dayOfWeek(date)]}s</b>
              <span className="muted">Your weekly schedule has nothing on this day. <a className="link" href="#/schedule/weekly">Edit weekly schedule</a></span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
