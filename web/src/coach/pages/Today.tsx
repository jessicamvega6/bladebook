/**
 * Today, the coach's home page (design: coach/static/today.html and today-code-pending.html; FeatureDecriptions/Coach
 * Dashboard on website.md). Batch 14's "code not working yet" banner, Batch 7's "Heading to the rink?" card (one of the
 * coach's two ways to the rinkside page; the other is the morning email), and Batch 22 (G-6): the week, unpaid and
 * waiting figures, today's lessons with each skater's attendance and the next one marked, new families to approve, and
 * a link to every page.
 *
 * Lessons and figures come from GET /api/coach/today, in the coach's time zone. The waiting figure counts the Students
 * list the app already loads for the nav. A failed load says so on the page and leaves the rest of it working.
 */
import { useEffect, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { Avatar, Badge, Banner, Card, Icon } from '../../shared/components/harbor';
import { plural } from '../../shared/logic/booking';
import { DAYS_LONG, dayOfWeek, formatClock, formatMoney, longDate, shortDate, toMinutes, todayIn } from '../../shared/logic/schedule';
import type { Profile, StudentDto, TodayApi, TodayDto, TodayLessonDto, TodaySkaterDto } from '../api';
import { CodePendingBanner } from '../components/CodeCard';

/** The design's attendance badges (shared.js STATUS_BADGE). */
const ATTEND: Record<TodaySkaterDto['attendance'], [string, string, string?]> = {
  CHECKED_IN: ['Attended', 'success', 'check'], NO_SHOW: ['No-show', 'danger', 'x'], BOOKED: ['Booked', 'neutral'],
  NOT_RECORDED: ['Not recorded', 'warning', 'alert'],
};

/** Waiting skaters grouped by family, in sign-up order. */
function byFamily(pending: StudentDto[]): StudentDto[][] {
  const by = new Map<string, StudentDto[]>();
  for (const s of pending) by.set(s.familyId, [...(by.get(s.familyId) ?? []), s]);
  return [...by.values()];
}

function Stat({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: string }) {
  return <div className="stat"><span className="stat__icon"><Icon name={icon} size={18} /></span><div className="stat__label">{label}</div><div className="stat__value">{value}</div><div className="stat__sub">{sub}</div></div>;
}

function AttendBadge({ s }: { s: TodaySkaterDto }) {
  const [text, tone, icon] = ATTEND[s.attendance];
  return <Badge tone={tone} icon={icon}>{text}</Badge>;
}

/** One lesson as the design draws it: time, avatar, who, length and price, then Next and each skater's attendance. */
function LessonRow({ l, started }: { l: TodayLessonDto; started: boolean }) {
  const shared = l.skaters.length > 1;
  const sub = l.held
    ? `${l.durationMinutes} min · not bookable`
    : `${l.durationMinutes} min · ${l.skaters.map((s) => formatMoney(s.amountMinor)).join(' + ')}${shared ? ' · shared lesson' : ''}`;
  return (
    <div className={`row${started && !l.next ? ' row--muted' : ''}`}>
      <div className="row__main">
        <span className="tlist__t num">{formatClock(l.startTime)}</span>
        {l.held ? <span className="roundicon"><Icon name="lock" size={14} /></span> : <Avatar name={l.skaters[0]!.name} size="sm" />}
        <div className="row__title">{l.held ? 'Held slot' : l.skaters.map((s) => s.name).join(' & ')}</div>
        <div className="row__sub">{sub}</div>
      </div>
      {(l.next || !l.held) && (
        <div className="row__side">
          {l.next && <Badge tone="primary">Next</Badge>}
          {!l.held && (shared
            ? l.skaters.map((s) => <span key={s.studentId} className="sh-badge"><small>{s.name.split(' ')[0]}</small><AttendBadge s={s} /></span>)
            : <AttendBadge s={l.skaters[0]!} />)}
        </div>
      )}
    </div>
  );
}

/** The design's "Go to" card; time off and special schedules both start on the schedule hub. */
const goTo = (today: string): [string, string, string][] => [
  ['Edit weekly schedule', 'repeat', '#/schedule/weekly'], ['Time off or special schedule', 'calOff', '#/schedule'],
  ['Month', 'calendar', `#/calendar/month/${today}`], ['Week', 'calendar', '#/calendar'], ['Students', 'users', '#/students'],
  ['Payments', 'card', '#/payments'], ['Financial summary', 'trend', '#/finances'], ['Profile', 'user', '#/profile'],
];

export function Today({ profile, api, onUseLogin, onResend, onError, note, busy, pending }: {
  profile: Profile; api: TodayApi; onUseLogin: () => void; onResend?: () => void; onError: (e: unknown) => void;
  note?: string; busy: boolean; pending?: StudentDto[];
}) {
  const [data, setData] = useState<TodayDto | null>(null);
  const [failed, setFailed] = useState('');

  useEffect(() => {
    let live = true;
    api.today()
      .then((d) => { if (live) { setData(d); setFailed(''); } })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 401) onError(e);
        else setFailed(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      });
    return () => { live = false; };
  }, [api, onError]);

  // The coach's own clock once it has loaded; the browser's until then.
  const hour = data ? Math.floor(toMinutes(data.now) / 60) : new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const today = data?.today ?? todayIn(profile.coachTimezone);
  const cur = data?.currency ?? profile.currency;
  const money = (m: Record<string, number>) => formatMoney(m[cur] ?? 0);
  const families = pending ? byFamily(pending) : [];
  const booked = data ? data.lessons.filter((l) => !l.held).length : 0;
  const nowMin = data ? toMinutes(data.now) : 0;

  return (
    <>
      <div className="phead">
        <div className="phead__text"><h1 className="h1">{greeting}, {profile.firstName}</h1>
          <p className="lede">{longDate(today)}</p></div>
        <div className="phead__actions"><a className="btn btn--secondary" href="#/calendar"><Icon name="calendar" /><span>Open week view</span></a></div>
      </div>
      {note && <Banner tone="info">{note}</Banner>}
      <CodePendingBanner profile={profile} onUseLogin={onUseLogin} onResend={onResend} busy={busy} />
      <Card>
        <div className="rink-cta">
          <div className="rink-cta__text"><b>Heading to the rink?</b>
            <span className="muted">Check skaters in from your phone at <span className="num">/coach/rinkside</span>, with the same email and password. The link is in your morning email too.</span></div>
          <a className="btn btn--primary btn--lg" href="/coach/rinkside/"><Icon name="phone" /><span>Open the rinkside page</span></a>
        </div>
      </Card>
      {failed && <Banner tone="danger" title="Couldn’t load today’s lessons">{failed}</Banner>}
      <div className="stats">
        <Stat label="This week" value={data ? plural(data.week.count, 'lesson') : '…'} sub={data ? `${money(data.week.amounts)} booked` : ''} icon="calendar" />
        <Stat label="Unpaid" value={data ? money(data.unpaid.amounts) : '…'} sub={data ? plural(data.unpaid.count, 'past lesson') : ''} icon="card" />
        <Stat label="Waiting for approval" value={pending ? plural(pending.length, 'skater') : '…'}
          sub={pending ? (families.length ? families.map((k) => k[0]!.clientName).join(', ') : 'Nobody waiting') : ''} icon="users" />
      </div>
      <div className="split split--today">
        <Card title="Today’s lessons" sub={data ? `${plural(booked, 'lesson')} · Pelham Civic Center` : 'Loading…'} flush
          action={<a className="link" href={`#/calendar/day/${today}`}>Day view</a>}>
          {!data ? <p className="muted" style={{ padding: '14px 22px' }} aria-busy={!failed}>{failed ? 'Not loaded.' : 'Loading…'}</p>
            : data.lessons.length ? (
              <>
                {data.lessons.map((l) => <LessonRow key={l.startTime} l={l} started={toMinutes(l.startTime) <= nowMin} />)}
                <div className="card__note"><Icon name="info" size={14} /> Attendance comes from the rinkside app. Fix a mistake on <a className="link" href="#/lessons">Lessons</a>.</div>
              </>
            ) : (
              <div className="pempty"><span className="pempty__icon"><Icon name="calendar" size={22} /></span><b>No lessons today</b>
                <span className="muted">{data.nextLessonDate
                  ? `Your next lesson is on ${DAYS_LONG[dayOfWeek(data.nextLessonDate)]}, ${shortDate(data.nextLessonDate)}.`
                  : 'Nothing is booked after today yet.'}</span></div>
            )}
        </Card>
        <div className="stack">
          {families.length > 0 && (
            <Card title="New families to approve" sub="They can’t see your times or book until you approve them." flush className="card--attn">
              {families.map((kids) => (
                <div className="row" key={kids[0]!.familyId}>
                  <div className="row__main"><Avatar name={kids[0]!.clientName} size="sm" />
                    <div className="row__title">{kids[0]!.clientName}</div>
                    <div className="row__sub">{`${kids.map((k) => k.studentName).join(' & ')} · signed up ${new Date(kids[0]!.signedUpAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}</div></div>
                </div>
              ))}
              <div className="card__foot"><a className="btn btn--primary btn--block" href="#/students/pending"><span>Review sign-ups</span></a></div>
            </Card>
          )}
          <Card title="Go to">
            <div className="quick">
              {goTo(today).map(([t, i, h]) => (
                <a key={t} className="quick__item" href={h}>
                  <span className="quick__icon"><Icon name={i} size={18} /></span><span>{t}</span></a>
              ))}
              <span className="quick__item is-disabled" aria-disabled="true"><span className="quick__icon"><Icon name="mail" size={18} /></span><span>Email templates</span><small>Phase 2</small></span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
