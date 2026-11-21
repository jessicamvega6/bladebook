/**
 * The rinkside Week tab (Batch 23, G-28; design: rinkside/screens-rink.js "Week: cancel lessons", presets week,
 * week-offline, week-lesson, week-day and week-all-confirm; ADR-MASTER section 10 "From the rinkside page"; ADR-009 d5a;
 * FeatureDecriptions/C_Rinkside Cancel Several Lessons.md).
 *
 * Three ways to cancel, and only three (owner, 2026-11-16): one lesson, a whole day, or the rest of the week. Lessons on
 * different days are cancelled one by one.
 * - Each lesson's *Cancel* asks release or hold for that lesson (S9) and is sent as LESSON.
 * - A day with two or more lessons has *Cancel whole day*, sent as DAY, and *Cancel rest of week*, at the top, sent as
 *   WEEK. Both make those dates time off called "Cancelled", with no release-or-hold question (owner, 2026-11-18, I24).
 *   Each confirmation lists the lessons it cancels.
 * - With no signal the tab shows no lessons, only "The week needs a connection" (R5): the phone keeps today's lessons
 *   only, and cancelling needs signal anyway.
 *
 * All three are the website's cancel (CoachCancelService), on the rinkside session.
 */
import { Badge, Banner, Button, Icon } from '../shared/components/harbor';
import { plural } from '../shared/logic/booking';
import { DAYS, dayOfWeek, formatTime, shortDate } from '../shared/logic/schedule';
import type { OpenTime, RinkWeek, WeekLesson } from './api';

/** The open confirmation: one lesson, a whole day (each lesson's hold choice by pickKey), or the rest of the week. */
export type WeekSheet =
  | { kind: 'lesson'; lesson: WeekLesson; hold: boolean; error: string; busy: boolean }
  | { kind: 'day'; date: string; picks: string[]; error: string; busy: boolean }
  | { kind: 'all'; error: string; busy: boolean };

export const pickKey = (l: { date: string; startTime: string }) => `${l.date}#${l.startTime}`;
const dDow = (date: string) => `${DAYS[dayOfWeek(date)]}, ${shortDate(date)}`;
const rkName = (l: WeekLesson) => l.skaters.map((s) => s.shortName).join(' and ');
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The header's line under *This week*: "Mon, Nov 16 – Sat, Nov 21 · cancel lessons". */
export function weekRange(w: RinkWeek): string {
  const saturday = addDays(w.weekStart, 6);
  return `${dDow(w.today)}${saturday !== w.today ? ` – ${dDow(saturday)}` : ''} · cancel lessons`;
}

/** Everything *Cancel rest of week* closes, as the server will work it out. */
export const restOfWeek = (w: RinkWeek) => ({ lessons: w.days.flatMap((d) => d.lessons), open: w.days.flatMap((d) => d.open) });

/** The families with a lesson among {@code ls}, once each: one email apiece. */
const families = (ls: WeekLesson[]) => {
  const byId = new Map<string, string>();
  ls.forEach((l) => l.skaters.forEach((s) => { if (!byId.has(s.familyId)) byId.set(s.familyId, s.familyName ?? s.shortName); }));
  return [...byId.values()];
};

/** The page with no signal (R5; design week-offline). */
export function WeekOffline() {
  return (
    <div className="pempty"><span className="pempty__icon"><Icon name="wifiOff" size={28} /></span>
      <h2 className="h2">The week needs a connection</h2>
      <p>Cancelling needs signal too. Today’s lessons are on the Today tab.</p>
      <a className="btn btn--primary btn--block btn--lg" href="#/today"><span>Go to Today</span></a></div>
  );
}

/** Release or hold for one lesson (S9). */
function AfterChoice({ hold, label, onHold, long }: { hold: boolean; label: string; onHold: (hold: boolean) => void; long?: boolean }) {
  return (
    <div className="seg seg--block" role="group" aria-label={label}>
      {(long ? ['Release for rebooking', 'Hold it closed'] : ['Release', 'Hold closed']).map((o, i) => (
        <button key={o} type="button" className={`seg__opt${hold === (i === 1) ? ' is-on' : ''}`} aria-pressed={hold === (i === 1)}
          onClick={() => onHold(i === 1)}>{o}</button>
      ))}
    </div>
  );
}

const lessonLine = (l: WeekLesson) => (
  <>
    <span className="num rk-pick__t">{formatTime(l.startTime)}</span>
    <span className="rk-pick__n">{rkName(l)}{l.skaters.length > 1 && <small>Shared · cancels both skaters</small>}</span>
    <span className="rl__len">{l.durationMinutes} min</span>
  </>
);

export function WeekTab({ week, sheet, onSheet, onCancelLesson, onCancelDay, onCancelAll }: {
  week: RinkWeek; sheet: WeekSheet | null; onSheet: (s: WeekSheet | null) => void;
  onCancelLesson: (l: WeekLesson, hold: boolean) => void;
  onCancelDay: (lessons: WeekLesson[]) => void;
  onCancelAll: () => void;
}) {
  const all = restOfWeek(week);
  const when = (x: { date: string; startTime: string }) => `${x.date === week.today ? 'Today' : dDow(x.date)} · ${formatTime(x.startTime)}`;
  const dayName = (date: string) => (date === week.today ? `today, ${shortDate(date)}` : dDow(date));
  const lessonsOn = (date: string) => week.days.find((d) => d.date === date)?.lessons ?? [];
  const emailed = (ls: WeekLesson[]) => `${families(ls).join(', ')} will be emailed.`;

  return (
    <>
      {all.lessons.length + all.open.length > 0 && (
        <section className="rk-card"><b>Cancel the rest of the week</b>
          <p className="fine">Makes the rest of the week, from now to Saturday, time off called “Cancelled”: {plural(all.lessons.length, 'lesson')} cancelled, and families can’t book it. Your weekly schedule doesn’t change.</p>
          <button type="button" className="btn btn--danger-outline btn--block" onClick={() => onSheet({ kind: 'all', error: '', busy: false })}>
            <Icon name="calOff" size={16} /><span>Cancel rest of week</span></button>
        </section>
      )}
      <p className="fine">Or cancel one lesson, or a whole day. Lessons on different days are cancelled one at a time.</p>
      {week.days.map((d) => {
        const head = d.date === week.today ? (d.lessons.length ? `Today, ${shortDate(d.date)}` : 'Today') : dDow(d.date);
        if (!d.lessons.length) {
          return <section key={d.date} className="rk-day"><div className="rk-day__head"><b>{head}</b><span className="muted-sm">{d.started ? 'Nothing left to cancel' : 'No lessons'}</span></div></section>;
        }
        return (
          <section key={d.date} className="rk-day" aria-label={head}>
            <div className="rk-day__head"><b>{head}</b>
              {d.lessons.length > 1 && (
                <button type="button" className="link rk-day__cancel"
                  onClick={() => onSheet({ kind: 'day', date: d.date, picks: d.lessons.map(pickKey), error: '', busy: false })}>
                  Cancel whole day</button>
              )}</div>
            {d.lessons.map((l) => (
              <div key={pickKey(l)} className="rk-pick">
                <div className="rk-pick__row rk-pick__row--plain">{lessonLine(l)}
                  <button type="button" className="btn btn--danger-outline btn--sm" aria-label={`Cancel ${rkName(l)} at ${formatTime(l.startTime)}`}
                    onClick={() => onSheet({ kind: 'lesson', lesson: l, hold: false, error: '', busy: false })}>Cancel</button></div>
              </div>
            ))}
            {d.started > 0 && <p className="fine">{plural(d.started, 'lesson')} already started and can’t be cancelled.</p>}
          </section>
        );
      })}

      {sheet && (
        <>
          <div className="scrim" onClick={() => !sheet.busy && onSheet(null)} />
          {sheet.kind === 'lesson' ? (() => {
            const l = sheet.lesson;
            return (
              <div className="sheet" role="dialog" aria-modal="true" aria-label="Cancel lesson"><span className="sheet__grab" />
                <h2 className="h2">Cancel {rkName(l)} · {l.date === week.today ? 'Today, ' : ''}{dDow(l.date)} · {formatTime(l.startTime)}?</h2>
                <p className="fine">{l.skaters.length > 1 ? 'It’s a shared lesson, so both skaters are cancelled. ' : ''}{emailed([l])} This can’t be undone.</p>
                <div className="fieldset"><div className="label">After cancelling</div>
                  <AfterChoice long hold={sheet.hold} label="After cancelling" onHold={(hold) => onSheet({ ...sheet, hold })} />
                  <div className="hint">{sheet.hold ? 'A held time stays closed for good. Nobody can book it.' : 'Another family can book this time.'}</div></div>
                {sheet.error && <Banner tone="danger">{sheet.error}</Banner>}
                <Button variant="danger" block lg disabled={sheet.busy} onClick={() => onCancelLesson(l, sheet.hold)}>
                  {sheet.busy ? 'Cancelling…' : 'Cancel lesson'}</Button>
                <Button variant="secondary" block lg disabled={sheet.busy} onClick={() => onSheet(null)}>Keep lesson</Button>
              </div>
            );
          })() : sheet.kind === 'day' ? (() => {
            const ls = lessonsOn(sheet.date).filter((l) => sheet.picks.includes(pickKey(l)));
            return (
              <div className="sheet" role="dialog" aria-modal="true" aria-label="Cancel day"><span className="sheet__grab" />
                <h2 className="h2">Cancel all of {dayName(sheet.date)}?</h2>
                <p className="fine">The day becomes time off called “Cancelled”: its {plural(ls.length, 'lesson')} are cancelled, and families can’t book it.</p>
                {ls.map((l) => (
                  <div key={pickKey(l)} className="rk-pick">
                    <div className="rk-pick__row rk-pick__row--plain">{lessonLine(l)}</div>
                  </div>
                ))}
                <p className="fine">{emailed(ls)} This can’t be undone.</p>
                {sheet.error && <Banner tone="danger">{sheet.error}</Banner>}
                <Button variant="danger" block lg disabled={sheet.busy || !ls.length}
                  onClick={() => onCancelDay(ls)}>
                  {sheet.busy ? 'Cancelling…' : `Cancel ${plural(ls.length, 'lesson')}`}</Button>
                <Button variant="secondary" block lg disabled={sheet.busy} onClick={() => onSheet(null)}>Keep them</Button>
              </div>
            );
          })() : (() => {
            const fams = families(all.lessons);
            const openRow = (o: OpenTime) => <li key={`open-${pickKey(o)}`}><span className="num">{when(o)}</span><b>Open</b><Badge tone="warning" icon="lock">Time off</Badge></li>;
            return (
              <div className="sheet" role="dialog" aria-modal="true" aria-label="Confirm cancellation"><span className="sheet__grab" />
                <h2 className="h2">Cancel the rest of the week?</h2>
                <p className="fine">Everything left from now to Saturday becomes time off called “Cancelled”. Nobody can book these times.</p>
                <ul className="rk-confirm">
                  {all.lessons.map((l) => <li key={pickKey(l)}><span className="num">{when(l)}</span><b>{rkName(l)}</b><Badge tone="warning" icon="lock">Time off</Badge></li>)}
                  {all.open.map(openRow)}
                </ul>
                <p className="fine">{fams.length ? `${fams.join(', ')} will be emailed. ` : ''}Your weekly schedule doesn’t change, so next week is untouched. This can’t be undone.</p>
                {sheet.error && <Banner tone="danger">{sheet.error}</Banner>}
                <Button variant="danger" block lg disabled={sheet.busy} onClick={onCancelAll}>
                  {sheet.busy ? 'Cancelling…' : `Cancel ${plural(all.lessons.length, 'lesson')} and ${plural(all.open.length, 'open time')}`}</Button>
                <Button variant="secondary" block lg disabled={sheet.busy} onClick={() => onSheet(null)}>Keep them</Button>
              </div>
            );
          })()}
        </>
      )}
    </>
  );
}
