/**
 * The coach's cancel preview (design: coach/screens-calendar.js SCREENS['cancel-preview']; ADR-MASTER section 10;
 * FeatureDecriptions/cancelation.md, Coach cancelation). Every cancel from the calendar comes here first and needs
 * the coach to accept.
 *
 * S9 (owner, 2026-11-08): for a lesson or a day, release-or-hold is asked per lesson, with no "Release all".
 * S8: Cancel rest of week holds every booked lesson and open time left in the week, with no question.
 */
import { useId, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { Avatar, Badge, Banner, Help, Icon, Row, Seg } from '../../shared/components/harbor';
import { plural } from '../../shared/logic/booking';
import { DAYS, dayOfWeek, formatTime, shortDate } from '../../shared/logic/schedule';
import type { CancelResult, LessonDto, ScheduleApi } from '../api';

export interface CancelPlan {
  scope: 'LESSON' | 'DAY' | 'WEEK';
  /** The page to go back to, and its label ("Week of Nov 15", "Monday, November 16"). */
  backLabel: string;
  lessons: Array<{ date: string; l: LessonDto }>;
  /** Cancel rest of week only: the open times it holds. */
  open: Array<{ date: string; l: LessonDto }>;
  weekStart?: string;
}

export const dDow = (date: string) => `${DAYS[dayOfWeek(date)]}, ${shortDate(date)}`;
export const calRange = (a: string, b: string) => (a === b ? dDow(a) : `${dDow(a)} – ${dDow(b)}`);
const keyOf = (date: string, l: LessonDto) => `${date}#${l.startTime}`;
const fullNames = (l: LessonDto) => l.skaters.map((s) => s.fullName).join(' & ') || 'Booked';

/** The families with a lesson cancelled, by family: each gets one email. */
export function familiesIn(plan: CancelPlan): string[] {
  const out = new Map<string, string>();
  for (const { l } of plan.lessons) {
    for (const s of l.skaters) out.set(s.familyId ?? s.studentId, s.familyName ?? s.fullName);
  }
  return [...out.values()];
}

/** What the coach is told afterwards, from what the server actually did. */
export function doneMessage(r: CancelResult): string {
  const left = r.skipped ? ` ${plural(r.skipped, 'lesson')} had already started or gone, so ${r.skipped === 1 ? 'it was' : 'they were'} left alone.` : '';
  return `${plural(r.cancelled, 'lesson')} cancelled${r.held ? `, ${r.held} held closed` : ''}${r.openHeld ? `, ${plural(r.openHeld, 'open time')} closed` : ''}. `
    + `${plural(r.families, 'family', 'families')} will be emailed.${left}`;
}

export function CancelPreview({ plan, api, onBack, onDone, onError }: {
  plan: CancelPlan; api: ScheduleApi; onBack: () => void; onDone: (r: CancelResult) => void; onError: (e: unknown) => void;
}) {
  const [hold, setHold] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState('');
  const lessonsId = useId();
  const weekAll = plan.scope === 'WEEK';
  const back = <a className="link" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}><Icon name="arrowL" size={14} /> {plan.backLabel}</a>;

  if (!plan.lessons.length && !(weekAll && plan.open.length)) {
    return (
      <div className="phead"><div className="phead__text"><div className="crumb">{back}</div><h1 className="h1">Nothing to cancel</h1>
        <p className="lede">These lessons have already started or were cancelled.</p></div></div>
    );
  }
  const fams = familiesIn(plan);
  const isHeld = (date: string, l: LessonDto) => weekAll || !!hold[keyOf(date, l)];
  const held = plan.lessons.filter(({ date, l }) => isHeld(date, l)).length;
  const open = weekAll ? plan.open : [];
  const dates = [...plan.lessons.map((x) => x.date), ...open.map((x) => x.date)].sort();
  const span = calRange(dates[0]!, dates[dates.length - 1]!);
  const what = weekAll ? `the rest of the week, ${span}` : span;
  const count = [plan.lessons.length ? plural(plan.lessons.length, 'lesson') : '', open.length ? plural(open.length, 'open time') : '']
    .filter(Boolean).join(' and ');
  const heldBadge = <Badge tone="neutral" icon="lock">Held closed</Badge>;

  const accept = async () => {
    setSending(true);
    setFailed('');
    try {
      const r = await api.cancel(plan.scope === 'WEEK' ? { scope: 'WEEK', weekStart: plan.weekStart! } : {
        scope: plan.scope,
        picks: plan.lessons.map(({ date, l }) => ({ date, startTime: l.startTime, after: hold[keyOf(date, l)] ? 'HOLD' : 'RELEASE' })),
      });
      onDone(r);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setFailed(e.message);
      else onError(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="phead"><div className="phead__text"><div className="crumb">{back}</div>
        <h1 className="h1">Cancel {what}</h1>
        <p className="lede">{weekAll
          ? 'Everything left this week is held closed: families can’t book these times. Your weekly schedule doesn’t change, so next week is untouched.'
          : 'For each lesson, choose whether families can book the time again.'}</p></div></div>
      {failed && <Banner tone="danger">{failed}</Banner>}
      <div className="impact">
        <div className="stat"><div className="stat__label">Cancelled</div><div className="stat__value">{plural(plan.lessons.length, 'lesson')}</div></div>
        <div className="stat"><div className="stat__label">Held closed</div><div className="stat__value">{held + open.length}</div></div>
        <div className="stat"><div className="stat__label">Families emailed</div><div className="stat__value">{fams.length}</div></div>
      </div>
      {plan.lessons.length > 0 && (
        <section className="card" aria-labelledby={lessonsId}>
          <header className="card__head"><div><h2 className="h2" id={lessonsId}>Lessons</h2></div></header>
          <div className="card__body" style={{ padding: 0 }}>
            <div className="tablehead"><span>Lesson</span><span>After cancelling</span></div>
            {plan.lessons.map(({ date, l }) => (
              <Row key={keyOf(date, l)} lead={<Avatar name={fullNames(l)} size="sm" />} title={fullNames(l)}
                sub={`${dDow(date)} · ${formatTime(l.startTime)} · ${l.durationMinutes} min`}
                side={weekAll ? heldBadge : <Seg label={`After cancelling ${fullNames(l)}’s lesson`} options={['Release for rebooking', 'Hold — keep closed']}
                  selected={hold[keyOf(date, l)] ? 1 : 0} onSelect={(i) => setHold({ ...hold, [keyOf(date, l)]: i === 1 })} />} />
            ))}
            <div className="card__note"><Icon name="alert" size={14} /> A held time stays closed to families, and your schedule doesn’t change. You can’t undo a cancellation.</div>
          </div>
        </section>
      )}
      {open.length > 0 && (
        <section className="card">
          <header className="card__head"><div><h2 className="h2">Open times</h2></div></header>
          <div className="card__body" style={{ padding: 0 }}>
            <div className="tablehead"><span>Open time</span><span>After cancelling</span></div>
            {open.map(({ date, l }) => (
              <Row key={keyOf(date, l)} lead={<span className="roundicon"><Icon name="plus" size={14} /></span>} title="Open"
                sub={`${dDow(date)} · ${formatTime(l.startTime)} · ${l.durationMinutes} min`} side={heldBadge} />
            ))}
          </div>
        </section>
      )}
      {fams.length > 0 && (
        <Help title="Who gets told">
          {fams.join(', ')} will each get one email listing their cancelled {plan.lessons.length === 1 ? 'lesson' : 'lessons'}, with a link to book another time. Repeating lessons in other weeks aren’t affected.
        </Help>
      )}
      <div className="stickybar">
        <button type="button" className="btn btn--secondary" onClick={onBack}><span>Back</span></button>
        <span className="stickybar__note">{plural(fams.length, 'family', 'families')} will be emailed. Nothing changes until you confirm.</span>
        <button type="button" className="btn btn--danger btn--lg" onClick={() => void accept()} disabled={sending}>
          <span>{sending ? 'Cancelling…' : weekAll ? `Cancel ${count}` : `Cancel ${plural(plan.lessons.length, 'lesson')}`}</span>
        </button>
      </div>
    </>
  );
}
