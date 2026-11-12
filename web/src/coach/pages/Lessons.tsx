/**
 * The coach's Lessons page (design: coach/screens-money-profile.js SCREENS.lessons; FeatureDecriptions/Coach lesson
 * list; ADR-MASTER section 11, "Correction"). Batch 7. Every lesson that has happened in a date range, one row per
 * skater, with Attended / No-show to set or correct. Capture is rinkside; correction is here only (R1).
 */
import { useEffect, useState } from 'react';
import { Avatar, Badge, Banner, Card, Help, Icon, Seg } from '../../shared/components/harbor';
import { plural } from '../../shared/logic/booking';
import { DAYS, MONTHS, dayOfWeek, formatTime, shortDate } from '../../shared/logic/schedule';
import type { LessonsApi, PastLessonDto } from '../api';

const dDow = (date: string) => `${DAYS[dayOfWeek(date)]}, ${shortDate(date)}`;
const dFull = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8))}, ${date.slice(0, 4)}`;
const keyOf = (l: PastLessonDto) => `${l.date}#${l.startTime}#${l.skater.studentId}`;

function Empty({ icon, title, body }: { icon: string; title: string; body: string }) {
  return <div className="mp-empty"><span className="mp-empty__icon"><Icon name={icon} size={22} /></span><b>{title}</b><span className="muted">{body}</span></div>;
}

export function Lessons({ api, onError }: { api: LessonsApi; onError: (e: unknown) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [list, setList] = useState<PastLessonDto[] | null>(null);
  const [flash, setFlash] = useState('');
  const rangeError = from && to && from > to ? 'The end date is before the start date.' : '';
  const ready = Boolean(from && to && !rangeError);

  useEffect(() => {
    if (!ready) { setList(null); return; }
    let live = true;
    api.list(from, to).then((l) => live && setList(l)).catch((e: unknown) => live && onError(e));
    return () => { live = false; };
  }, [api, from, to, ready, onError]);

  const correct = async (l: PastLessonDto, i: number) => {
    const outcome = i === 0 ? 'CHECKED_IN' : 'NO_SHOW';
    try {
      const after = await api.correct(l, outcome);
      setList((xs) => xs && xs.map((x) => (keyOf(x) === keyOf(l) ? { ...x, skater: after } : x)));
      setFlash(`${l.skater.fullName}, ${shortDate(l.date)} ${formatTime(l.startTime)}: marked ${i === 0 ? 'attended' : 'no-show'}.`);
    } catch (e) {
      onError(e);
    }
  };

  let body;
  if (!ready || !list) {
    body = <Card><Empty icon="calendar" title="Pick a date range" body="Choose a start and end date to see the lessons in it." /></Card>;
  } else {
    const nr = list.filter((l) => l.skater.status === 'NOT_RECORDED').length;
    const att = list.filter((l) => l.skater.status === 'CHECKED_IN').length;
    const ns = list.filter((l) => l.skater.status === 'NO_SHOW').length;
    body = (
      <>
        {nr > 0 && <Banner tone="warning" title={`${plural(nr, 'lesson has', 'lessons have')} no attendance`}>The rinkside page may still be holding a check-in that hasn’t been sent, or nobody recorded it. Pick Attended or No-show to settle it.</Banner>}
        <Card title={plural(list.length, 'lesson')} sub={`${dFull(from)} – ${dFull(to)} · ${att} attended · ${ns} no-show${nr ? ` · ${nr} not recorded` : ''}`} flush>
          {list.length ? list.map((l) => {
            const s = l.skater;
            const on = s.status === 'CHECKED_IN' ? 0 : s.status === 'NO_SHOW' ? 1 : -1;
            return (
              <div key={keyOf(l)} className={`row${s.status === 'NOT_RECORDED' ? ' row--attn' : ''}`}>
                <div className="row__main"><Avatar name={s.fullName} size="sm" />
                  <div>
                    <div className="row__title">{s.fullName}{s.status === 'NOT_RECORDED' && <> <Badge tone="warning" icon="alert">Not recorded</Badge></>}</div>
                    <div className="row__sub">{dDow(l.date)} · {formatTime(l.startTime)} · {l.durationMinutes} min{s.familyName && s.familyName !== s.fullName ? ` · ${s.familyName}` : ''}</div>
                    {l.sharedWith.length > 0 && <small className="mp-sub"><Icon name="users" size={12} /> Shared with {l.sharedWith.join(', ')}</small>}
                  </div>
                </div>
                <div className="row__side"><Seg label={`${s.fullName}, ${dDow(l.date)} ${formatTime(l.startTime)}`} options={['Attended', 'No-show']} selected={on} onSelect={(i) => void correct(l, i)} /></div>
              </div>
            );
          }) : <Empty icon="calendar" title="No lessons in this range" body="Only lessons that have already happened are listed." />}
        </Card>
      </>
    );
  }

  return (
    <>
      {flash && <Banner tone="success">{flash}</Banner>}
      <div className="phead"><div className="phead__text"><h1 className="h1">Lessons</h1>
        <p className="lede">Check who came. Fix anything recorded wrong at the rink here; the rinkside page can’t change a recorded lesson.</p></div></div>
      <div className="filters mp-filters">
        <div className="field"><label className="label" htmlFor="les-from">From</label>
          <input id="les-from" type="date" className="ctl" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className={`field${rangeError ? ' field--error' : ''}`}><label className="label" htmlFor="les-to">To</label>
          <input id="les-to" type="date" className={`ctl${rangeError ? ' is-error' : ''}`} value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={rangeError ? true : undefined} />
          {rangeError && <div className="hint hint--error"><Icon name="alert" size={14} />{rangeError}</div>}</div>
      </div>
      {body}
      <Help title="Changing a no-show">Switching a lesson to No-show doesn’t change its price. It stays unpaid until you mark it paid or waived on Payments. In a shared lesson each skater has their own attendance.</Help>
    </>
  );
}
