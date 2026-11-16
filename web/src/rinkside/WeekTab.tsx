/**
 * The rinkside Week tab (Batch 23, G-28; design: rinkside/screens-rink.js "Week: cancel several lessons", presets week,
 * week-offline, week-confirm and week-all-confirm; ADR-MASTER section 10 "From the rinkside page"; ADR-009 d5a;
 * FeatureDecriptions/C_Rinkside Cancel Several Lessons.md).
 *
 * - Each day from today to Saturday with the lessons that can still be cancelled. Pick lessons, choose Release or Hold
 *   closed for each (S9), confirm once: they're cancelled as one batch, so each family gets one email.
 * - *Cancel rest of week*, at the top, holds every booked lesson and open time left, with no release-or-hold question
 *   (S8). Its confirmation lists everything it closes.
 * - With no signal the tab shows no lessons, only "The week needs a connection" (R5): the phone keeps today's lessons
 *   only, and cancelling needs signal anyway.
 *
 * Both cancels are the website's cancel (CoachCancelService), on the rinkside session.
 */
import { Badge, Banner, Button, Icon } from '../shared/components/harbor';
import { plural } from '../shared/logic/booking';
import { DAYS, dayOfWeek, formatTime, shortDate } from '../shared/logic/schedule';
import type { OpenTime, RinkWeek, WeekLesson } from './api';

export type WeekSheet = { kind: 'picked' | 'all'; error: string; busy: boolean };
export type Picks = Record<string, boolean>;

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

export function WeekTab({ week, picks, onPicks, sheet, onSheet, onCancelPicked, onCancelAll }: {
  week: RinkWeek; picks: Picks; onPicks: (p: Picks) => void; sheet: WeekSheet | null; onSheet: (s: WeekSheet | null) => void;
  onCancelPicked: (picked: Array<WeekLesson & { hold: boolean }>) => void; onCancelAll: () => void;
}) {
  const listed = week.days.flatMap((d) => d.lessons);
  const picked = listed.filter((l) => pickKey(l) in picks).map((l) => ({ ...l, hold: picks[pickKey(l)]! }));
  const all = restOfWeek(week);
  const when = (x: { date: string; startTime: string }) => `${x.date === week.today ? 'Today' : dDow(x.date)} · ${formatTime(x.startTime)}`;
  const toggle = (l: WeekLesson) => {
    const next = { ...picks };
    if (pickKey(l) in next) delete next[pickKey(l)]; else next[pickKey(l)] = false;
    onPicks(next);
  };
  const selectDay = (ls: WeekLesson[], on: boolean) => {
    const next = { ...picks };
    ls.forEach((l) => { if (on) next[pickKey(l)] = next[pickKey(l)] ?? false; else delete next[pickKey(l)]; });
    onPicks(next);
  };

  return (
    <>
      {all.lessons.length + all.open.length > 0 && (
        <section className="rk-card"><b>Cancel the rest of the week</b>
          <p className="fine">Holds everything left from now to Saturday: {plural(all.lessons.length, 'lesson')} and {plural(all.open.length, 'open time')}. Families can’t book them. Your schedule doesn’t change.</p>
          <button type="button" className="btn btn--danger-outline btn--block" onClick={() => onSheet({ kind: 'all', error: '', busy: false })}>
            <Icon name="calOff" size={16} /><span>Cancel rest of week</span></button>
        </section>
      )}
      <p className="fine">Or pick lessons to cancel. For each one, choose whether the time can be booked again.</p>
      {week.days.map((d) => {
        const head = d.date === week.today ? (d.lessons.length ? `Today, ${shortDate(d.date)}` : 'Today') : dDow(d.date);
        if (!d.lessons.length) {
          return <section key={d.date} className="rk-day"><div className="rk-day__head"><b>{head}</b><span className="muted-sm">{d.started ? 'Nothing left to cancel' : 'No lessons'}</span></div></section>;
        }
        const whole = d.lessons.every((l) => pickKey(l) in picks);
        return (
          <section key={d.date} className="rk-day" aria-label={head}>
            <div className="rk-day__head"><b>{head}</b>
              <button type="button" className="link" onClick={() => selectDay(d.lessons, !whole)}>{whole ? 'Clear day' : 'Select whole day'}</button></div>
            {d.lessons.map((l) => {
              const on = pickKey(l) in picks;
              return (
                <div key={pickKey(l)} className={`rk-pick${on ? ' is-on' : ''}`}>
                  <label className="rk-pick__row">
                    <input type="checkbox" className="check__input" checked={on} onChange={() => toggle(l)} />
                    <span className="num rk-pick__t">{formatTime(l.startTime)}</span>
                    <span className="rk-pick__n">{rkName(l)}{l.skaters.length > 1 && <small>Shared · cancels both skaters</small>}</span>
                    <span className="rl__len">{l.durationMinutes} min</span>
                  </label>
                  {on && (
                    <div className="seg seg--block" role="group" aria-label={`After cancelling ${rkName(l)} at ${formatTime(l.startTime)}`}>
                      {['Release', 'Hold closed'].map((o, i) => (
                        <button key={o} type="button" className={`seg__opt${picks[pickKey(l)] === (i === 1) ? ' is-on' : ''}`} aria-pressed={picks[pickKey(l)] === (i === 1)}
                          onClick={() => onPicks({ ...picks, [pickKey(l)]: i === 1 })}>{o}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {d.started > 0 && <p className="fine">{plural(d.started, 'lesson')} already started and can’t be cancelled.</p>}
          </section>
        );
      })}
      <div className="rk-sticky">
        <Button variant="danger" block lg disabled={!picked.length} onClick={() => onSheet({ kind: 'picked', error: '', busy: false })}>
          {picked.length ? `Cancel ${plural(picked.length, 'lesson')}` : 'Pick lessons to cancel'}</Button>
      </div>

      {sheet && (
        <>
          <div className="scrim" onClick={() => !sheet.busy && onSheet(null)} />
          {sheet.kind === 'picked' ? (() => {
            const held = picked.filter((p) => p.hold).length, fams = families(picked);
            return (
              <div className="sheet" role="dialog" aria-modal="true" aria-label="Confirm cancellation"><span className="sheet__grab" />
                <h2 className="h2">Cancel {plural(picked.length, 'lesson')}?</h2>
                <ul className="rk-confirm">{picked.map((p) => (
                  <li key={pickKey(p)}><span className="num">{when(p)}</span><b>{rkName(p)}</b>
                    {p.hold ? <Badge tone="warning" icon="lock">Hold</Badge> : <Badge>Release</Badge>}</li>))}</ul>
                <p className="fine">{fams.join(', ')} will be emailed.{held ? ` ${plural(held, 'held time')} stay${held === 1 ? 's' : ''} closed for good.` : ''} This can’t be undone.</p>
                {sheet.error && <Banner tone="danger">{sheet.error}</Banner>}
                <Button variant="danger" block lg disabled={sheet.busy} onClick={() => onCancelPicked(picked)}>
                  {sheet.busy ? 'Cancelling…' : `Cancel ${plural(picked.length, 'lesson')}`}</Button>
                <Button variant="secondary" block lg disabled={sheet.busy} onClick={() => onSheet(null)}>Keep them</Button>
              </div>
            );
          })() : (() => {
            const fams = families(all.lessons);
            const openRow = (o: OpenTime) => <li key={`open-${pickKey(o)}`}><span className="num">{when(o)}</span><b>Open</b><Badge tone="warning" icon="lock">Hold</Badge></li>;
            return (
              <div className="sheet" role="dialog" aria-modal="true" aria-label="Confirm cancellation"><span className="sheet__grab" />
                <h2 className="h2">Cancel the rest of the week?</h2>
                <p className="fine">Everything left from now to Saturday is held closed. Nobody can book these times.</p>
                <ul className="rk-confirm">
                  {all.lessons.map((l) => <li key={pickKey(l)}><span className="num">{when(l)}</span><b>{rkName(l)}</b><Badge tone="warning" icon="lock">Hold</Badge></li>)}
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
