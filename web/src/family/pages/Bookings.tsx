/**
 * My bookings (design: client/screens-booking.js SCREENS.bookings and MODALS.bkCancel; FeatureDecriptions/C_Client
 * My Bookings.md and cancelation.md, Client cancelation). Batch 5 closes G-23.
 *
 * Upcoming: every lesson not started yet, soonest first, the first 10 with "Show all". Each has Cancel, which always
 * confirms. Recent: the last 4 lessons, greyed. A skater filter once two skaters are approved; a coach filter once two
 * coaches have lessons coming up.
 *
 * Late or not is the lesson's own notice period (B6) against the clock now; the server decides again when it cancels.
 * Not yet: repeating lessons (Batch 9, G-20), shared lessons (Batch 11, G-21), attendance badges (Batch 7).
 */
import { useCallback, useEffect, useId, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { Badge, Banner, Button, Card, Dialog, Icon, Row, Seg } from '../../shared/components/harbor';
import { plural } from '../../shared/logic/booking';
import { firstName } from '../../shared/logic/names';
import { DAYS, MONTHS, dayOfWeek, formatMoney, formatTime, shortDate, todayIn } from '../../shared/logic/schedule';
import type { Family, FamilyApi, MyBookings, MyLesson } from '../api';

const SHOWN = 10;
const dDow = (date: string) => `${DAYS[dayOfWeek(date)]}, ${shortDate(date)}`;
const keyOf = (l: MyLesson) => `${l.coachId}/${l.studentId}/${l.date}/${l.startTime}`;
const money = (l: MyLesson) => (l.priceMinor == null ? '' : ` · ${formatMoney(l.priceMinor)}`);

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
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState('');
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
      setFlash(`${firstName(l.studentName)}’s lesson on ${dDow(l.date)} at ${formatTime(l.startTime)} is cancelled.${told}`);
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
    ? <div className="pempty"><span className="pempty__icon"><Icon name="calendar" size={22} /></span>
        <b>Nothing booked{whoName ? ` for ${whoName}` : ''}{coachName ? ` with Coach ${coachName}` : ''}</b>
        <span className="muted">Try another skater or coach, or book a lesson.</span>
        <Button variant="secondary" onClick={() => { setWho('all'); setCoach('all'); setAll(false); }}>Show everything</Button></div>
    : <div className="pempty"><span className="pempty__icon"><Icon name="calendar" size={22} /></span><b>Nothing booked</b>
        <span className="muted">Book a time with Coach {approvedCoaches[0]?.firstName}.</span>
        <a className="btn btn--primary" href="#/book"><span>Book a lesson</span></a></div>;

  return (
    <>
      {flash && <Banner tone="success">{flash}</Banner>}
      {head}
      {filters}
      <Card title="Upcoming" sub={up.length ? `${plural(upAll.length, 'lesson')}. Cancelling one doesn’t change the rest of its series.` : undefined} flush>
        {up.length ? <>
          {up.map((l) => (
            <Row key={keyOf(l)} lead={<DateBlock date={l.date} />}
              title={<>{DAYS[dayOfWeek(l.date)]} · {formatTime(l.startTime)}{l.date === todayIn(l.coachTz) && <> <Badge tone="primary">Today</Badge></>}</>}
              sub={`${firstName(l.studentName)}${coachTag(l)} · ${l.durationMinutes} min${money(l)}`}
              side={<Button variant="ghost" sm onClick={() => { setFailed(''); setAsking(l); }}>Cancel</Button>} />
          ))}
          {upAll.length > SHOWN && <div className="card__foot"><Button variant="secondary" sm onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${upAll.length}`}</Button></div>}
        </> : empty}
      </Card>
      {recent.length > 0 && (
        <Card title="Recent" flush>
          {recent.map((l) => (
            <Row key={keyOf(l)} muted lead={<DateBlock date={l.date} past />} title={`${DAYS[dayOfWeek(l.date)]} · ${formatTime(l.startTime)}`}
              sub={`${firstName(l.studentName)}${coachTag(l)} · ${l.durationMinutes} min${money(l)}`} />
          ))}
        </Card>
      )}
      {asking && <CancelDialog l={asking} multiCoach={multiCoach} sending={sending} failed={failed}
        onKeep={() => { setAsking(null); setFailed(''); }} onCancel={() => void cancel()} />}
    </>
  );
}

function CancelDialog({ l, multiCoach, sending, failed, onKeep, onCancel }: {
  l: MyLesson; multiCoach: boolean; sending: boolean; failed: string; onKeep: () => void; onCancel: () => void;
}) {
  const titleId = useId();
  const late = insideNotice(l);
  const cf = l.coachFirstName, h = l.requiredNoticeHours;
  return (
    <Dialog onClose={onKeep} labelledBy={titleId}>
      <div className="dialog__icon dialog__icon--danger"><Icon name="calOff" size={22} /></div>
      <h2 className="h2" id={titleId}>Cancel {firstName(l.studentName)}’s lesson{multiCoach ? ` with Coach ${cf}` : ''}?</h2>
      <div className="dialog__what"><b>{dDow(l.date)} · {formatTime(l.startTime)}</b><span>{l.durationMinutes} min{money(l)}</span></div>
      {late
        ? <Banner tone="warning" title={`Inside the ${h}-hour notice period`}>{cf} may charge a late cancellation fee.</Banner>
        : <p className="fine">Cancelling within {h} hours of a lesson may incur a late cancellation fee.</p>}
      <p className="fine">The time goes back on {cf}’s calendar{late ? ` and ${cf} will be told, because it’s a late cancellation` : ''}.</p>
      {failed && <Banner tone="danger">{failed}</Banner>}
      <div className="dialog__actions">
        <Button variant="secondary" onClick={onKeep}>Keep lesson</Button>
        <Button variant="danger" onClick={onCancel} disabled={sending}>{sending ? 'Cancelling…' : 'Cancel lesson'}</Button>
      </div>
    </Dialog>
  );
}
