/**
 * My bookings (design: client/screens-booking.js SCREENS.bookings and MODALS.bkCancel; FeatureDecriptions/C_Client
 * My Bookings.md and cancelation.md, Client cancelation). Batch 5 closes G-23.
 *
 * Upcoming: every lesson not started yet, soonest first, the first 10 with "Show all". Each has Cancel, which always
 * confirms. Recent: the last 4 lessons, greyed. A skater filter once two skaters are approved; a coach filter once two
 * coaches have lessons coming up.
 *
 * Late or not is the lesson's own notice period (B6) against the clock now; the server decides again when it cancels.
 * Recent shows the attendance the coach recorded (Batch 7, G-27); nothing recorded shows no badge.
 * Batch 9: the Repeating lessons card with Change (SeriesChange below), and each lesson's "Repeats weekly" badge.
 * Batch 11: shared lessons. Each row says who it's shared with; the inviting family can withdraw an unanswered invitation;
 * the staying family answers on its card (WaitingCards); a kept lesson takes a one-lesson invitation (a freed place); a
 * date past its answer-by time shows "Cancelled, no answer" from the clock (B8); a shared series can only be cancelled (B4).
 */
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { ApiError } from '../../shared/api/client';
import { Badge, Banner, Button, Card, Dialog, Icon, Row, Seg } from '../../shared/components/harbor';
import { everyLabel, plural, repeatsBadge } from '../../shared/logic/booking';
import { firstName } from '../../shared/logic/names';
import { DAYS, DAYS_LONG, MONTHS, dayOfWeek, formatMoney, formatTime, shortDate, todayIn } from '../../shared/logic/schedule';
import { noAnswer } from '../../shared/logic/sharing';
import type { Family, FamilyApi, MyBookings, MyLesson, MySeries, Weekday } from '../api';
import { ShareBox, WaitingCards, type ShareAnswer } from './Sharing';

/** Java's weekday names, Sunday first like DAYS. */
const WEEKDAYS: Weekday[] = ['SUNDAY' as Weekday, 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const SHOWN = 10;
const dDow = (date: string) => `${DAYS[dayOfWeek(date)]}, ${shortDate(date)}`;
const keyOf = (l: MyLesson) => `${l.coachId}/${l.studentId}/${l.date}/${l.startTime}`;
const money = (l: MyLesson) => (noAnswer(l.share?.answerBy, Date.now()) ? ' · No charge' : l.priceMinor == null ? '' : ` · ${formatMoney(l.priceMinor)}`);

/** Someone else is in the lesson, joined or invited (B4: a series with one still to come is shared). */
const sharedNow = (l: MyLesson) => ['INVITED', 'BOOKED', 'CHECKED_IN', 'NO_SHOW'].includes(l.share?.partnerStatus ?? '');

/** Who the lesson is shared with, as the family may know it (design: bkShareLine). */
export function shareLine(l: MyLesson): string {
  const s = l.share;
  if (!s?.partnerName || !s.partnerStatus) return '';
  const what: Record<string, string> = {
    BOOKED: '', CHECKED_IN: '', NO_SHOW: '', INVITED: ' · waiting for their family', DECLINED: ' · declined · a private lesson',
    EXPIRED: ' · expired · a private lesson',
  };
  return s.partnerStatus in what ? `Shared with ${s.partnerName}${what[s.partnerStatus]}` : '';
}

/** Inside the lesson's notice period: strictly under N hours before the start, and not started. */
export function insideNotice(l: MyLesson, now = Date.now()): boolean {
  const left = Date.parse(l.startsAtUtc) - now;
  return left > 0 && left < l.requiredNoticeHours * 3_600_000;
}

function DateBlock({ date, past }: { date: string; past?: boolean }) {
  return <span className={`dateblock${past ? ' bk-dateblock--past' : ''}`}><b>{Number(date.slice(8))}</b><small>{MONTHS[Number(date.slice(5, 7)) - 1]}</small></span>;
}

export function Bookings({ family, api, onError }: { family: Family; api: FamilyApi; onError: (e: unknown) => void }) {
  const [data, setData] = useState<MyBookings | null>(null);
  const [who, setWho] = useState('all');
  const [coach, setCoach] = useState('all');
  const [all, setAll] = useState(false);
  const [asking, setAsking] = useState<MyLesson | null>(null);
  const [withdrawing, setWithdrawing] = useState<MyLesson | null>(null);
  const [inviting, setInviting] = useState<MyLesson | null>(null);
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState(() => {
    // The series page hands its message over on its way back here.
    try { const f = sessionStorage.getItem('bb.family.flash') ?? ''; sessionStorage.removeItem('bb.family.flash'); return f; } catch { return ''; }
  });
  const [failed, setFailed] = useState('');

  const load = useCallback(() => api.myBookings().then(setData).catch(onError), [api, onError]);
  useEffect(() => { void load(); }, [load]);

  const kids = family.skaters.filter((k) => k.coaches.some((c) => c.status === 'ACTIVE'));
  const approvedCoaches = family.coaches.filter((c) => c.status === 'ACTIVE');
  const multiCoach = approvedCoaches.length > 1;
  const head = (
    <div className="phead">
      <div className="phead__text"><h1 className="h1">My bookings</h1>
        <p className="lede">{multiCoach ? 'Lessons with all your coaches' : `Lessons with Coach ${approvedCoaches[0] ? `${approvedCoaches[0].firstName} ${approvedCoaches[0].lastName}` : ''}`}</p></div>
      <div className="phead__actions"><a className="btn btn--primary" href="#/book"><Icon name="plus" /><span>Book a lesson</span></a></div>
    </div>
  );
  // One tree for loading and loaded, so the heading isn't replaced when the lessons arrive.
  if (!data) return <>{false}{head}<p className="muted" aria-busy="true">Loading…</p></>;

  // The coach filter lists only coaches with lessons coming up, once two or more have them (owner, 2026-10-13).
  const withLessons = approvedCoaches.filter((c) => data.upcoming.some((l) => l.coachId === c.coachId));
  const coachOn = coach !== 'all' && withLessons.some((c) => c.coachId === coach) ? coach : 'all';
  const pass = (l: MyLesson) => (who === 'all' || l.studentId === who) && (coachOn === 'all' || l.coachId === coachOn);
  const upAll = data.upcoming.filter(pass);
  const up = all ? upAll : upAll.slice(0, SHOWN);
  const recent = data.recent.filter(pass);
  const series = (data.series ?? []).filter((a) => (who === 'all' || a.studentId === who) && (coachOn === 'all' || a.coachId === coachOn));
  const whoName = who === 'all' ? '' : firstName(kids.find((k) => k.studentId === who)?.name ?? '');
  const coachName = coachOn === 'all' ? '' : withLessons.find((c) => c.coachId === coachOn)?.firstName ?? '';
  const coachTag = (l: MyLesson) => (multiCoach ? ` · Coach ${l.coachFirstName}` : '');

  const cancel = async () => {
    if (!asking) return;
    const l = asking;
    setSending(true);
    setFailed('');
    try {
      const r = await api.cancel(l);
      const told = r.outcome === 'CANCELLED' && r.late ? ` Coach ${r.coachFirstName} has been told, because it’s a late cancellation.` : '';
      const other = l.share?.partnerName;
      const shared = r.leave === 'IN_TIME' && other ? ` ${other}’s family is asked whether to keep it at the full price.`
        : r.leave === 'WITHDRAW' && other ? ` The invitation to ${other} is withdrawn.` : '';
      setFlash(`${firstName(l.studentName)}’s lesson on ${dDow(l.date)} at ${formatTime(l.startTime)} is cancelled.${shared}${told}`);
      setAsking(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setFailed(e.message);
      } else {
        setAsking(null);
        onError(e);
      }
    } finally {
      setSending(false);
    }
  };

  const filters = (kids.length > 1 || withLessons.length > 1) && (
    <div className="bk-filter">
      {kids.length > 1 && (
        <Seg label="Skater" options={['Everyone', ...kids.map((k) => firstName(k.name))]}
          selected={who === 'all' ? 0 : kids.findIndex((k) => k.studentId === who) + 1}
          onSelect={(i) => { setWho(i === 0 ? 'all' : kids[i - 1]!.studentId); setAll(false); }} />
      )}
      {withLessons.length > 1 && (
        <div className="picker"><label className="picker__label" htmlFor="bk-filter-coach">Coach</label>
          <select id="bk-filter-coach" className="ctl bk-coachsel" value={coachOn} onChange={(e) => setCoach(e.target.value)}>
            <option value="all">All coaches</option>
            {withLessons.map((c) => <option key={c.coachId} value={c.coachId!}>Coach {c.firstName} {c.lastName}</option>)}
          </select></div>
      )}
    </div>
  );

  const empty = whoName || coachName
    ? <div className="pempty bk-pempty"><span className="pempty__icon"><Icon name="calendar" size={22} /></span>
        <b>Nothing booked{whoName ? ` for ${whoName}` : ''}{coachName ? ` with Coach ${coachName}` : ''}</b>
        <span className="muted">Try another skater or coach, or book a lesson.</span>
        <Button variant="secondary" onClick={() => { setWho('all'); setCoach('all'); setAll(false); }}>Show everything</Button></div>
    : <div className="pempty bk-pempty"><span className="pempty__icon"><Icon name="calendar" size={22} /></span><b>Nothing booked</b>
        <span className="muted">Book a time with Coach {approvedCoaches[0]?.firstName}.</span>
        <a className="btn btn--primary" href="#/book"><span>Book a lesson</span></a></div>;

  return (
    <>
      {flash && <Banner tone="success">{flash}</Banner>}
      {head}
      <WaitingCards lessons={data.upcoming} api={api} onChanged={() => void load()} onError={onError} />
      {filters}
      <Card title="Upcoming" sub={up.length ? `${plural(upAll.length, 'lesson')}. Cancelling one doesn’t change the rest of its series.` : undefined} flush>
        {up.length ? <>
          {up.map((l) => {
            const gone = noAnswer(l.share?.answerBy, Date.now()), share = shareLine(l);
            const waitingNow = l.share?.partnerStatus === 'LEFT' && !gone;
            return (
              <Row key={keyOf(l)} lead={<DateBlock date={l.date} />}
                title={<>{DAYS[dayOfWeek(l.date)]} · {formatTime(l.startTime)}{l.date === todayIn(l.coachTz) && <> <Badge tone="primary">Today</Badge></>}</>}
                sub={<>{`${firstName(l.studentName)}${coachTag(l)} · ${l.durationMinutes} min${money(l)}`}
                  {waitingNow && <> <Badge tone="warning" icon="alert">Needs your answer</Badge></>}
                  {share && <span className="bk-shared"><Icon name="users" size={12} />{share}</span>}</>}
                side={gone ? <Badge tone="neutral" icon="x">Cancelled, no answer</Badge>
                  : l.share?.joined ? <><Badge tone="neutral" icon="users">Shared lesson</Badge>
                      <Button variant="ghost" sm onClick={() => { setFailed(''); setAsking(l); }}>Cancel</Button></>
                  : <>{l.recurrenceId && l.intervalWeeks ? <Badge tone="neutral" icon="repeat">{repeatsBadge(l.intervalWeeks)}</Badge> : null}
                      {l.share?.partnerStatus === 'INVITED' && l.share.inviteId && <Button variant="ghost" sm onClick={() => { setFailed(''); setWithdrawing(l); }}>Withdraw invitation</Button>}
                      {l.share?.freedPlace && !sharedNow(l) && l.share.shareable && <Button variant="secondary" sm icon="users" onClick={() => { setFailed(''); setInviting(l); }}>Invite a skater</Button>}
                      <Button variant="ghost" sm onClick={() => { setFailed(''); setAsking(l); }}>Cancel</Button></>} />
            );
          })}
          {upAll.length > SHOWN && <div className="card__foot"><Button variant="secondary" sm onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${upAll.length}`}</Button></div>}
        </> : empty}
      </Card>
      {series.length > 0 && (
        <Card title="Repeating lessons" sub="Shorten a series, make it less frequent, or stop it. To add lessons, book again." flush>
          {series.map((a) => (
            <Row key={a.recurrenceId} lead={<span className="roundicon"><Icon name="repeat" size={18} /></span>}
              title={`${firstName(a.studentName)}${multiCoach ? ` · Coach ${a.coachFirstName}` : ''} · ${DAYS_LONG[WEEKDAYS.indexOf(a.weekday)]}s ${formatTime(a.startTime)}, ${everyLabel(a.intervalWeeks)}`}
              sub={`Until ${shortDate(a.endDate)} · ${plural(a.lessonsLeft, 'lesson')} left${data.upcoming.some((l) => l.recurrenceId === a.recurrenceId && sharedNow(l)) ? ' · Shared: cancel one lesson or the whole series' : ''}`}
              side={<a className="btn btn--secondary btn--sm" href={`#/bookings/series/${a.coachId}/${a.recurrenceId}`}><span>Change</span></a>} />
          ))}
        </Card>
      )}
      {recent.length > 0 && (
        <Card title="Recent" flush>
          {recent.map((l) => (
            <Row key={keyOf(l)} muted lead={<DateBlock date={l.date} past />} title={`${DAYS[dayOfWeek(l.date)]} · ${formatTime(l.startTime)}`}
              sub={`${firstName(l.studentName)}${coachTag(l)} · ${l.durationMinutes} min${money(l)}`}
              side={l.attendance === 'CHECKED_IN' ? <Badge tone="success" icon="check">Attended</Badge>
                : l.attendance === 'NO_SHOW' ? <Badge tone="danger" icon="x">No-show</Badge> : undefined} />
          ))}
        </Card>
      )}
      {asking && <CancelDialog l={asking} multiCoach={multiCoach} sending={sending} failed={failed}
        onKeep={() => { setAsking(null); setFailed(''); }} onCancel={() => void cancel()} />}
      {withdrawing && <WithdrawDialog l={withdrawing} lessons={data.upcoming} sending={sending} failed={failed}
        onKeep={() => { setWithdrawing(null); setFailed(''); }}
        onWithdraw={async () => {
          setSending(true);
          setFailed('');
          try {
            await api.withdrawInvite(withdrawing.share!.inviteId!);
            setFlash(`The invitation to ${withdrawing.share?.partnerName ?? 'the other skater'} is withdrawn. ${firstName(withdrawing.studentName)}’s lessons stay booked.`);
            setWithdrawing(null);
            await load();
          } catch (e) {
            if (e instanceof ApiError && e.status !== 401) setFailed(e.message); else { setWithdrawing(null); onError(e); }
          } finally {
            setSending(false);
          }
        }} />}
      {inviting && <FreedPlaceDialog l={inviting} api={api} family={family} onClose={() => setInviting(null)}
        onDone={(msg) => { setInviting(null); setFlash(msg); void load(); }} onError={onError} />}
    </>
  );
}

/** Withdraw an invitation the other family hasn't answered (design: bkWithdraw). Every date it covers is withdrawn. */
function WithdrawDialog({ l, lessons, sending, failed, onKeep, onWithdraw }: {
  l: MyLesson; lessons: MyLesson[]; sending: boolean; failed: string; onKeep: () => void; onWithdraw: () => void;
}) {
  const titleId = useId();
  const all = lessons.filter((x) => x.share?.inviteId === l.share?.inviteId && x.share?.partnerStatus === 'INVITED');
  const kf = firstName(l.studentName);
  return (
    <Dialog onClose={onKeep} labelledBy={titleId}>
      <div className="dialog__icon dialog__icon--danger"><Icon name="users" size={22} /></div>
      <h2 className="h2" id={titleId}>Withdraw the invitation to {l.share?.partnerName ?? 'the other skater'}?</h2>
      <div className="dialog__what"><b>{all.length > 1 ? `${DAYS_LONG[dayOfWeek(l.date)]}s at ${formatTime(l.startTime)}` : `${dDow(l.date)} at ${formatTime(l.startTime)}`}</b>
        <span>{all.length > 1 ? `${shortDate(all[0]!.date)} – ${shortDate(all[all.length - 1]!.date)} · ${plural(all.length, 'lesson')}` : `${l.durationMinutes} min`}</span></div>
      <p className="fine">Their family is told. {kf}’s {all.length > 1 ? 'lessons stay' : 'lesson stays'} booked, just for {kf}.</p>
      {failed && <Banner tone="danger">{failed}</Banner>}
      <div className="dialog__actions">
        <Button variant="secondary" onClick={onKeep}>Keep invitation</Button>
        <Button variant="danger" onClick={onWithdraw} disabled={sending}>{sending ? 'Withdrawing…' : 'Withdraw'}</Button>
      </div>
    </Dialog>
  );
}

/** A freed place: invite a skater to that one lesson only, the same way as while booking (ADR-MASTER section 8). */
function FreedPlaceDialog({ l, api, family, onClose, onDone, onError }: {
  l: MyLesson; api: FamilyApi; family: Family; onClose: () => void; onDone: (msg: string) => void; onError: (e: unknown) => void;
}) {
  const titleId = useId();
  const [code, setCode] = useState('');
  const [answer, setAnswer] = useState<ShareAnswer>({ ready: true, code: null });
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState('');
  const kid = family.skaters.find((k) => k.studentId === l.studentId);
  if (!kid) return null;
  const kf = firstName(l.studentName);
  const send = async () => {
    if (!answer.code) return;
    setSending(true);
    setFailed('');
    try {
      const r = await api.inviteToFreed({ coachId: l.coachId, studentId: l.studentId, date: l.date, startTime: l.startTime, shareCode: answer.code });
      onDone(r.sibling ? `${firstName(r.displayName)} added to ${kf}’s lesson on ${dDow(l.date)}.` : `Invitation sent to ${r.displayName}’s family for ${kf}’s lesson on ${dDow(l.date)}.`);
    } catch (e) {
      if (e instanceof ApiError && e.status !== 401) setFailed(e.message); else onError(e);
    } finally {
      setSending(false);
    }
  };
  return (
    <Dialog onClose={onClose} labelledBy={titleId}>
      <div className="dialog__icon"><Icon name="users" size={22} /></div>
      <h2 className="h2" id={titleId}>Share {kf}’s lesson on {dDow(l.date)} at {formatTime(l.startTime)}</h2>
      <p className="fine">This lesson only. Until the other skater joins, {kf} pays the full price.</p>
      <ShareBox api={api} coachId={l.coachId} coachFirstName={l.coachFirstName} priceMinor={l.share?.fullPriceMinor ?? l.priceMinor ?? 0}
        currency={l.currency} kid={kid} family={family} repeat={false} onlyNote="" value={code} onChange={setCode} onAnswer={setAnswer} />
      {failed && <Banner tone="danger">{failed}</Banner>}
      <div className="dialog__actions">
        <Button variant="secondary" onClick={onClose}>Back</Button>
        <Button onClick={() => void send()} disabled={sending || !answer.code}>{sending ? 'Sending…' : 'Share the lesson'}</Button>
      </div>
    </Dialog>
  );
}

function CancelDialog({ l, multiCoach, sending, failed, onKeep, onCancel }: {
  l: MyLesson; multiCoach: boolean; sending: boolean; failed: string; onKeep: () => void; onCancel: () => void;
}) {
  const titleId = useId();
  const late = insideNotice(l);
  const cf = l.coachFirstName, h = l.requiredNoticeHours;
  // Shared with a skater who joined (design: bkCancel): the other family keeps their share, or is asked.
  const joined = ['BOOKED', 'CHECKED_IN', 'NO_SHOW'].includes(l.share?.partnerStatus ?? '');
  const other = l.share?.partnerName ?? 'The other skater';
  const kf = firstName(l.studentName);
  return (
    <Dialog onClose={onKeep} labelledBy={titleId}>
      <div className="dialog__icon dialog__icon--danger"><Icon name="calOff" size={22} /></div>
      <h2 className="h2" id={titleId}>Cancel {kf}’s lesson{multiCoach ? ` with Coach ${cf}` : ''}?</h2>
      <div className="dialog__what"><b>{dDow(l.date)} · {formatTime(l.startTime)}</b><span>{l.durationMinutes} min{money(l)}{joined ? ' · shared' : ''}</span></div>
      {late
        ? <Banner tone="warning" title={`Inside the ${h}-hour notice period`}>{cf} may charge a late cancellation fee{joined ? `. The lesson is shared, so ${kf}’s share is the fee split between the 2 skaters` : ''}.</Banner>
        : <p className="fine">Cancelling within {h} hours of a lesson may incur a late cancellation fee.</p>}
      {joined
        ? <p className="fine">{late ? `${other} keeps the lesson at their share, ${formatMoney(l.priceMinor ?? 0)}.`
            : `${other}’s family is asked whether to keep it as a private lesson at the full ${formatMoney(l.share?.fullPriceMinor ?? l.priceMinor ?? 0)}, or cancel it with no charge.`}</p>
        : <p className="fine">The time goes back on {cf}’s calendar{late ? ` and ${cf} will be told, because it’s a late cancellation` : ''}.{l.share?.partnerStatus === 'INVITED' ? ` The invitation to ${other} is withdrawn too.` : ''}{l.recurrenceId ? ' Other lessons in this series aren’t affected.' : ''}</p>}
      {failed && <Banner tone="danger">{failed}</Banner>}
      <div className="dialog__actions">
        <Button variant="secondary" onClick={onKeep}>Keep lesson</Button>
        <Button variant="danger" onClick={onCancel} disabled={sending}>{sending ? 'Cancelling…' : 'Cancel lesson'}</Button>
      </div>
    </Dialog>
  );
}

/**
 * Change a repeating lesson (design: SCREENS.recurrence; FeatureDecriptions/cancelation.md, Client recurrence management):
 * end it earlier, make it less frequent, or cancel all future lessons. "Future" excludes today's lesson. The preview names
 * each cancelled lesson inside the notice period (B9). A shared series offers only "Cancel all future lessons" (B4).
 */
export function SeriesChange({ api, coachId, recurrenceId, onError }: { api: FamilyApi; coachId: string; recurrenceId: string; onError: (e: unknown) => void }) {
  const [data, setData] = useState<MyBookings | null>(null);
  const [chosen, setMode] = useState<0 | 1 | 2>(0);
  const [end, setEnd] = useState('');
  const [interval, setIntervalWeeks] = useState(0);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState('');
  useEffect(() => { api.myBookings().then(setData).catch(onError); }, [api, onError]);
  if (!data) return <p className="muted" aria-busy="true">Loading…</p>;
  const a: MySeries | undefined = (data.series ?? []).find((x) => x.coachId === coachId && x.recurrenceId === recurrenceId);
  if (!a) {
    return <Card><div className="pempty bk-pempty"><b>That repeating lesson has ended</b><a className="btn btn--secondary" href="#/bookings"><span>Back to my bookings</span></a></div></Card>;
  }
  const lessons = data.upcoming.filter((l) => l.recurrenceId === recurrenceId && l.coachId === coachId);
  const today = todayIn(lessons[0]?.coachTz ?? 'UTC');
  const future = lessons.filter((l) => l.date > today);
  // B4: while any lesson still to come has another skater, joined or invited, only "Cancel all future lessons" is offered.
  const shared = lessons.some(sharedNow);
  const mode = shared ? 2 : chosen;
  const next = interval || Math.min(a.intervalWeeks + 1, 4);
  const weeks = (x: string, y: string) => Math.round((Date.parse(`${y}T00:00:00Z`) - Date.parse(`${x}T00:00:00Z`)) / (7 * 864e5));
  const plan = future.map((l) => ({ l, cut: mode === 2 ? true : mode === 0 ? !!end && l.date > end : weeks(future[0]!.date, l.date) % next !== 0 }));
  const err = mode === 0 ? (!end ? 'Pick a new last date.' : end >= a.endDate ? `Pick a date before ${shortDate(a.endDate)}. To add lessons, book again.` : end < today ? 'Pick a date from today on.' : '')
    : mode === 1 ? (a.intervalWeeks >= 4 ? 'Already every 4 weeks, the least often.' : '') : '';
  const cut = err ? [] : plan.filter((p) => p.cut);
  const lateLs = cut.filter((p) => insideNotice(p.l)).map((p) => p.l);
  const h = lateLs[0]?.requiredNoticeHours ?? 24;
  const names = lateLs.map((l) => `${dDow(l.date)} · ${formatTime(l.startTime)}`);
  const lateList = names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const shown = plan.slice(0, 10);
  const kf = firstName(a.studentName);
  const every = everyLabel(a.intervalWeeks);

  const apply = async () => {
    setSending(true);
    setFailed('');
    try {
      const r = await api.changeSeries({ coachId, recurrenceId, change: mode === 0 ? 'END_EARLIER' : mode === 1 ? 'LESS_OFTEN' : 'STOP',
        ...(mode === 0 ? { endDate: end } : mode === 1 ? { intervalWeeks: next } : {}) });
      const told = r.late ? ` Coach ${r.coachFirstName} has been told, because it’s a late cancellation.` : '';
      sessionStorage.setItem('bb.family.flash', `${kf}’s ${DAYS_LONG[WEEKDAYS.indexOf(a.weekday)]} lessons: ${plural(r.cancelled, 'lesson')} cancelled. ${r.status === 'ENDED' ? 'The series has stopped.' : mode === 1 ? `Now every ${r.intervalWeeks} weeks.` : `Last lesson ${shortDate(r.endDate)}.`}${told}`);
      window.location.hash = '#/bookings';
    } catch (e) {
      if (e instanceof ApiError && (e.status === 400 || e.status === 409)) setFailed(e.message);
      else onError(e);
    } finally {
      setSending(false);
    }
  };
  const opt = (i: 0 | 1 | 2, icon: string, title: string, sub: string, extra?: ReactNode) => (
    <div className="bk-opt">
      <button type="button" className={`rcard${mode === i ? ' is-on' : ''}`} aria-pressed={mode === i} onClick={() => setMode(i)}>
        <span className="rcard__icon"><Icon name={icon} size={20} /></span>
        <span className="rcard__text"><span className="rcard__title">{title}</span><span className="rcard__sub">{sub}</span></span>
        <span className={`radio${mode === i ? ' is-on' : ''}`} />
      </button>
      {mode === i && extra}
    </div>
  );
  return (
    <>
      <div className="phead"><div className="phead__text">
        <div className="crumb"><a className="link" href="#/bookings"><Icon name="arrowL" size={14} /> My bookings</a></div>
        <h1 className="h1">{kf} · {DAYS_LONG[WEEKDAYS.indexOf(a.weekday)]}s {formatTime(a.startTime)}</h1>
        <p className="lede">{every[0]!.toUpperCase() + every.slice(1)} until {shortDate(a.endDate)}. {shared ? 'This series is shared, so you can only cancel it here.' : 'You can shorten this or make it less frequent.'} To add lessons, book again.</p>
      </div></div>
      {failed && <Banner tone="danger">{failed}</Banner>}
      <div className="split split--even">
        <Card title="What do you want to change?">
          {shared && <Banner tone="info" title="This series is shared with another skater">You can cancel one lesson (from My bookings) or the whole series. Ending it earlier and making it less frequent come back once no lesson still to come is shared.</Banner>}
          {!shared && opt(0, 'calendar', 'End it earlier', `Last lesson now: ${shortDate(a.endDate)}`,
            <div className="bk-optfield"><div className={`field${mode === 0 && err && end ? ' field--error' : ''}`}><label className="label" htmlFor="bk-rec-end">New last date</label>
              <input id="bk-rec-end" type="date" className="ctl" value={end} onChange={(e) => setEnd(e.target.value)} />
              {err && end && <div className="hint hint--error"><Icon name="alert" size={14} />{err}</div>}</div></div>)}
          {!shared && opt(1, 'repeat', 'Make it less frequent', a.intervalWeeks >= 4 ? 'Already every 4 weeks, the least often' : `Now ${every}`,
            a.intervalWeeks >= 4 ? undefined : <div className="bk-optfield"><div className="field"><label className="label" htmlFor="bk-rec-int">Repeats</label>
              <select id="bk-rec-int" className="ctl" value={next} onChange={(e) => setIntervalWeeks(Number(e.target.value))}>
                {[2, 3, 4].filter((n) => n > a.intervalWeeks).map((n) => <option key={n} value={n}>Every {n} weeks</option>)}
              </select></div></div>)}
          {opt(2, 'calOff', 'Cancel all future lessons', lessons.some((l) => l.date === today) ? 'Today’s lesson is kept' : `${plural(plan.length, 'lesson')} from tomorrow on`)}
        </Card>
        <Card title="What this will do" sub={err ? 'Fix the choice on the left to see the result.' : `${plural(cut.length, 'lesson')} cancelled · ${plural(plan.length - cut.length, 'lesson')} kept`}>
          {shown.length ? <div className="timeline-list">{shown.map((p) => {
            const isCut = !err && p.cut;
            return (
              <div key={p.l.date} className={`tli tli--${isCut ? 'cut' : 'keep'}`}><span className="tli__dot"><Icon name={isCut ? 'x' : 'check'} size={12} /></span>
                <span className="tli__d">{dDow(p.l.date)} · {formatTime(p.l.startTime)}</span>
                <span className="tli__s">{isCut ? (lateLs.includes(p.l) ? 'Cancelled · late' : 'Cancelled') : 'Kept'}</span></div>
            );
          })}</div> : <p className="fine">No lessons after today.</p>}
          {plan.length > shown.length && <p className="fine">and {plural(plan.length - shown.length, 'more lesson')}: {plural(plan.slice(10).filter((p) => !err && p.cut).length, 'cancelled', 'cancelled')}</p>}
          {lateLs.length > 0 && <Banner tone="warning" title={`Inside the ${h}-hour notice period`}>{lateList} {lateLs.length === 1 ? 'is' : 'are'} less than {h} hours away. Cancelling {lateLs.length === 1 ? 'it' : 'them'} may incur a late cancellation fee from Coach {a.coachFirstName}.</Banner>}
          {cut.length > 0 && <Banner tone="warning">Cancelled times are released for other families. Switching back won’t get them back.</Banner>}
        </Card>
      </div>
      <div className="actions">
        <div><a className="btn btn--secondary" href="#/bookings"><span>Back</span></a></div>
        <div className="actions__r"><Button variant="danger" lg onClick={() => void apply()} disabled={sending || !!err || !cut.length}>
          {sending ? 'Cancelling…' : cut.length ? `Cancel ${plural(cut.length, 'lesson')}` : 'Nothing to cancel'}</Button></div>
      </div>
    </>
  );
}
