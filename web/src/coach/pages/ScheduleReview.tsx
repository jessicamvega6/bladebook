/**
 * The review page every schedule change goes through, and the save status after it (design: coach/schedule.html
 * review() and statusScreen(); FeatureDecriptions/Schedule Creater.md "What the review page shows" and "Big price
 * change warning"; C_Coach Time Off.md; C_Coach Schedule Save Status.md). Batch 6 closes SC-6 and G-12.
 *
 * The figures come from the server's preview, the same evaluator the save runs. The preview is advisory: a family
 * booking meanwhile is handled by the save.
 */
import { useEffect, useState } from 'react';
import { Avatar, Badge, Banner, Button, Card, Icon, Row } from '../../shared/components/harbor';
import { plural } from '../../shared/logic/booking';
import { DAYS, dayOfWeek, formatMoney, formatTime, shortDate } from '../../shared/logic/schedule';
import type { ChangeStatusDto, ImpactDto, PreviewDto, ScheduleApi } from '../api';

const whenOf = (i: ImpactDto) => `${DAYS[dayOfWeek(i.date)]}, ${shortDate(i.date)} · ${formatTime(i.startTime)}`;
const who = (i: ImpactDto) => i.skaters.map((s) => s.name).join(' & ') || 'Booked';

function LessonRow({ i, side }: { i: ImpactDto; side: React.ReactNode }) {
  return <Row lead={<Avatar name={who(i)} size="sm" />} title={who(i)} sub={whenOf(i)} side={side} />;
}

/** The sticky bar's accept button: blocked until a big change is acknowledged. */
export function acceptLabel(p: PreviewDto, acked: boolean): string {
  if (p.big.length && !acked) return 'Tick the box above to continue';
  return p.families ? `Accept & email ${plural(p.families, 'family', 'families')}` : 'Accept & save';
}

export function ChangeReview({ what, preview, timeOff, noticeHours, errors, busy, onBack, onAccept }: {
  what: string; preview: PreviewDto | null; timeOff?: boolean; noticeHours: number; errors: string[]; busy: boolean;
  onBack: () => void; onAccept: () => void;
}) {
  const [acked, setAcked] = useState(false);
  const head = (
    <div className="phead"><div className="phead__text">
      <div className="crumb"><button type="button" className="link crumbbtn" onClick={onBack}><Icon name="arrowL" size={14} /> Back to editing</button></div>
      <h1 className="h1">Review your changes</h1>
      <p className="lede">{what}</p>
    </div></div>
  );
  if (!preview) {
    return <>{head}{errors.length > 0 ? <Banner tone="danger" title="This can’t be saved">{errors.map((m) => <div key={m}>{m}</div>)}</Banner>
      : <p className="muted" aria-busy="true">Checking your booked lessons…</p>}
      <div className="stickybar"><Button variant="secondary" onClick={onBack}>Back</Button></div></>;
  }
  const p = preview;
  const blocked = p.big.length > 0 && !acked;
  const ups = p.reprice.filter((i) => (i.newPriceMinor ?? 0) > i.priceMinor), downs = p.reprice.filter((i) => (i.newPriceMinor ?? 0) < i.priceMinor);
  const delta = (i: ImpactDto) => (
    <span className="delta"><s>{formatMoney(i.priceMinor)}</s><Icon name="arrowR" size={14} /><b className={(i.newPriceMinor ?? 0) > i.priceMinor ? 'is-up' : ''}>{formatMoney(i.newPriceMinor ?? 0)}</b></span>
  );
  return (
    <>
      {head}
      {p.big.length > 0 && (
        <div className="alertcard alertcard--warn" role="alert">
          <div className="alertcard__head"><Icon name="alert" size={20} />
            <div>
              <div className="alertcard__title">Check this price — it’s a big change</div>
              {p.big.map((c) => (
                <div key={c.seq} className="alertcard__body">{c.label} {c.cut ? 'drops' : 'rises'} from <b>{formatMoney(c.fromMinor)}</b> to <b>{formatMoney(c.toMinor)}</b>, a {c.percent}% {c.cut ? 'cut' : 'increase'}.</div>
              ))}
              <div className="alertcard__body">If it’s a typo, families get emailed twice: once for the mistake, once for the fix.</div>
            </div>
          </div>
          <label className="check" htmlFor="ack"><input id="ack" type="checkbox" className="check__input" checked={acked} onChange={(e) => setAcked(e.target.checked)} />
            <span className="check__text"><span className="check__label">I’ve checked the new price</span></span></label>
        </div>
      )}
      {errors.length > 0 && <Banner tone="danger" title="This couldn’t be saved">{errors.map((m) => <div key={m}>{m}</div>)}</Banner>}
      <div className="impact">
        <div className="stat"><div className="stat__label">Cancelled</div><div className="stat__value">{plural(p.cancel.length, 'lesson')}</div></div>
        <div className="stat"><div className="stat__label">New price</div><div className="stat__value">{plural(p.reprice.length, 'lesson')}</div></div>
        <div className="stat"><div className="stat__label">Families emailed</div><div className="stat__value">{p.families}</div></div>
      </div>
      {p.cancel.length > 0 && (
        <Card title={`${plural(p.cancel.length, 'lesson')} will be cancelled`} flush
          sub={`Each family is emailed with a link to book another time.${timeOff ? ' These times stop existing, so nobody can rebook them.' : ''}`}>
          {p.cancel.map((i) => <LessonRow key={i.date + i.startTime} i={i} side={<Badge tone="danger">Cancelled</Badge>} />)}
        </Card>
      )}
      {p.reprice.length > 0 && (
        <Card title={`${plural(p.reprice.length, 'upcoming lesson')} will change price`} flush>
          {p.reprice.map((i) => <LessonRow key={i.date + i.startTime} i={i} side={delta(i)} />)}
          <div className="card__note">{[ups.length ? 'Families with a price increase are emailed the new price.' : '',
            downs.length ? 'Families with a decrease are told: “Good news — some lessons are now cheaper.”' : ''].filter(Boolean).join(' ')}</div>
        </Card>
      )}
      {p.kept.length > 0 && (
        <Card title={`Not changed — inside your ${noticeHours}-hour notice`} flush>
          {p.kept.map((i) => <LessonRow key={i.date + i.startTime} i={i} side={<span className="muted">stays {formatMoney(i.priceMinor)}</span>} />)}
          <div className="card__note"><Icon name="info" size={14} />A price increase never reaches a lesson inside your {noticeHours}-hour notice period.</div>
        </Card>
      )}
      {!p.cancel.length && !p.reprice.length && !p.kept.length && <Banner tone="success" title="No booked lessons are affected">Families won’t be emailed.</Banner>}
      <div className="stickybar">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <span className="stickybar__note">Nothing changes until you accept.</span>
        <Button lg onClick={onAccept} disabled={blocked || busy}>{busy ? 'Saving…' : acceptLabel(p, acked)}</Button>
      </div>
    </>
  );
}

/**
 * After accepting (C_Coach Schedule Save Status.md): the newest batch's state, refreshed while it applies. With nothing
 * booked touched no batch is written, and the page says so from the review's figures.
 */
export function SaveStatus({ api, lessons, families, since, onError }: {
  api: ScheduleApi; lessons: number; families: number; since: number; onError: (e: unknown) => void;
}) {
  const [s, setS] = useState<ChangeStatusDto | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    api.status().then((x) => live && setS(x)).catch((e: unknown) => live && onError(e));
    return () => { live = false; };
  }, [api, onError, tick]);
  // This save's batch, if it touched a booking: one written since the save started.
  const mine = s?.exists && s.createdAt && Date.parse(s.createdAt) >= since - 1000 ? s : null;
  const applying = mine != null && mine.executionStatus !== 'EXECUTED';
  useEffect(() => {
    if (!applying || mine?.stuck) return;
    const t = window.setTimeout(() => setTick((n) => n + 1), 3000);
    return () => window.clearTimeout(t);
  }, [applying, mine?.stuck]);
  if (!s) return <p className="muted" aria-busy="true">Loading…</p>;
  const fams = mine ? mine.clientCount : families;
  const count = mine ? mine.lessonCount : lessons;
  if (mine?.stuck) {
    return (
      <>
        <div className="phead"><div className="phead__text"><h1 className="h1">Saving your changes</h1></div></div>
        <Banner tone="danger">We’re having trouble applying this change. We’ve been alerted, and your families haven’t been notified yet.</Banner>
      </>
    );
  }
  const done = !applying;
  const step = (n: number, title: string, sub: string) => {
    const isDone = done || n < 0;
    const isNow = !isDone && n === 0;
    return <li className={isDone ? 'is-done' : isNow ? 'is-now' : ''}><span className="progress__dot">{isDone && <Icon name="check" size={12} />}</span><div><b>{title}</b><small>{sub}</small></div></li>;
  };
  return (
    <>
      <div className="phead"><div className="phead__text">
        <h1 className="h1">{done ? 'Saved' : 'Saving your changes'}</h1>
        <p className="lede">{done ? (fams ? `${plural(fams, 'family', 'families')} emailed.` : 'No families needed telling.') : 'You can leave this page — saving carries on in the background.'}</p>
      </div></div>
      <Card>
        <ol className="progress" aria-live="polite">
          {step(0, 'Applying changes', `Updating ${plural(count, 'lesson')}`)}
          {step(1, 'Emailing families', fams ? plural(fams, 'family', 'families') : 'Nobody to email')}
          {step(2, 'Done', 'Your schedule is live')}
        </ol>
      </Card>
      {mine && mine.passed.length > 0 && (
        <Card title="These lessons had already started" flush>
          {mine.passed.map((i) => <LessonRow key={i.date + i.startTime} i={i} side={<span className="muted">Waive it and contact the family</span>} />)}
        </Card>
      )}
      {done && <div className="actions"><span /><a className="btn btn--primary btn--lg" href="#/schedule"><span>Back to your schedule</span></a></div>}
    </>
  );
}
