/**
 * Shared lessons on the family website, Batch 11 (design: client/screens-booking.js → bkShareBox, bkShareResult,
 * bkAskFull*, bkFullCancelAll; client/screens-account.js → acInviteCard, invite; ADR-MASTER section 8, ADR-033;
 * FeatureDecriptions/Schedule lesson split, cancelation.md).
 *
 * The share box asks the share-check as soon as a whole code is in, and the booking can't be sent while the box holds
 * anything that hasn't checked out (ADR-033 2a). Invitations, and the staying family's question, are worked out from the
 * clock (B8): an invitation whose lessons have all started is no longer available, and a date past its answer-by time is
 * "Cancelled, no answer", without waiting for the hourly sweep.
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import { ApiError } from '../../shared/api/client';
import { Avatar, Badge, Banner, Button, Card, Dialog, Field, Help, Icon, Row } from '../../shared/components/harbor';
import { plural } from '../../shared/logic/booking';
import { firstName } from '../../shared/logic/names';
import { DAYS, DAYS_LONG, MONTHS, dayOfWeek, formatMoney, formatTime, shortDate } from '../../shared/logic/schedule';
import { codeState, noAnswer, normaliseShareCode, splitLine } from '../../shared/logic/sharing';
import type { Family, FamilyApi, Invitation, MyLesson } from '../api';

const dDow = (date: string) => `${DAYS[dayOfWeek(date)]}, ${shortDate(date)}`;
const dateBlock = (date: string) => (
  <span className="dateblock"><b>{Number(date.slice(8))}</b><small>{MONTHS[Number(date.slice(5, 7)) - 1]}</small></span>
);
const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

/** "Sun, Nov 15 at 6:00 AM", in the coach's time zone. */
export function atTime(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso));
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
  return `${dDow(`${p('year')}-${p('month')}-${p('day')}`)} at ${formatTime(`${p('hour')}:${p('minute')}`)}`;
}

// ------------------------------------------------------------------ the share box

/** What the share box says now. {@code ready}: the booking may go ahead with {@code code} ({@code null}: book private). */
export interface ShareAnswer { ready: boolean; code: string | null; name?: string; sibling?: boolean }

type Checked =
  | { key: string; at: 'checking' }
  | { key: string; at: 'failed' }
  | { key: string; at: 'nomatch' }
  | { key: string; at: 'done'; name: string; onRoster: boolean };

export function ShareBox({ api, coachId, coachFirstName, priceMinor, currency, kid, family, repeat, onlyNote, value, onChange, onAnswer }: {
  api: FamilyApi; coachId: string; coachFirstName: string; priceMinor: number; currency: string | null;
  kid: Family['skaters'][number]; family: Family; repeat: boolean; onlyNote: string; value: string;
  onChange: (v: string) => void; onAnswer: (a: ShareAnswer) => void;
}) {
  const [checked, setChecked] = useState<Checked | null>(null);
  const [retry, setRetry] = useState(0);
  const st = codeState(value, kid.shareCode);
  const code = st === 'ready' ? normaliseShareCode(value) : null;
  const sibs = family.skaters.filter((k) => k.studentId !== kid.studentId);
  const sibling = code ? sibs.find((k) => k.shareCode === code) : undefined;
  const siblingOk = !!sibling && sibling.coaches.some((c) => c.coachId === coachId && c.status === 'ACTIVE');
  const key = `${code}|${coachId}`;
  const answer = checked && checked.key === key ? checked : null;

  useEffect(() => {
    // A sibling is known to the page: no call (ADR-033 d1). Anyone else's code is checked as soon as it's whole.
    if (!code || sibling) return;
    let live = true;
    setChecked({ key, at: 'checking' });
    api.shareCheck(code, coachId)
      .then((r) => live && setChecked({ key, at: 'done', name: r.displayName, onRoster: r.onCoachRoster }))
      .catch((e: unknown) => live && setChecked({ key, at: e instanceof ApiError && e.status === 404 ? 'nomatch' : 'failed' }));
    return () => { live = false; };
  }, [api, code, coachId, key, sibling, retry]);

  const kf = firstName(kid.name);
  let err = '', hint = '';
  let found: { name: string; sibling: boolean } | null = null;
  if (st === 'typing') hint = 'Keep typing. Book stays off until the whole code is in, or the box is empty.';
  else if (st === 'self') err = `That’s ${kf}’s own code. Enter the other skater’s code.`;
  else if (st === 'wrong') err = 'That code doesn’t match a skater. Check it with the other family.';
  else if (sibling) {
    if (siblingOk) found = { name: shortName(sibling.name), sibling: true };
    else err = `${firstName(sibling.name)} is not available to add until Coach ${coachFirstName} accepts them.`;
  } else if (code) {
    if (!answer || answer.at === 'checking') hint = 'Checking the code… Book stays off until it’s checked.';
    else if (answer.at === 'failed') err = 'Couldn’t check that code. Try again.';
    else if (answer.at === 'nomatch') err = 'That code doesn’t match a skater. Check it with the other family.';
    else if (!answer.onRoster) {
      const f = firstName(answer.name);
      err = `${answer.name} isn’t one of Coach ${coachFirstName}’s students yet. ${f}’s family can sign up with Coach ${coachFirstName}’s code, and once Coach ${coachFirstName} accepts ${f} you can share a lesson.`;
    } else found = { name: answer.name, sibling: false };
  }
  const ready = st === 'empty' || !!found;

  useEffect(() => {
    onAnswer({ ready, code: found ? code : null, name: found?.name, sibling: found?.sibling });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, code, found?.name, found?.sibling]);

  return (
    <div className="bk-share">
      <div className="bk-share__head"><Icon name="users" size={16} /><b>Share this lesson</b><span className="label__opt">Optional</span></div>
      <p className="fine">Enter another skater’s share code{sibs.length ? ', or add one of your own skaters' : ''}. Only Coach {coachFirstName}’s students can share a lesson. Another family must accept before their skater joins. {splitLine(priceMinor, currency)}{repeat ? ' Every lesson in the series is shared.' : ''}{onlyNote}</p>
      <Field label="Skater’s share code" value={value} onChange={onChange} mono placeholder="e.g. LIL-6T2NB" error={err || undefined} hint={hint || undefined} />
      {answer?.at === 'failed' && code && !sibling && (
        <div className="bk-share__retry"><Button variant="secondary" sm icon="refresh" onClick={() => setRetry((n) => n + 1)}>Try again</Button>
          <span className="fine">Book stays off until the code is checked, or the box is empty.</span></div>
      )}
      {found && (
        <div className="found"><Avatar name={found.name} size="sm" />
          <div><div className="found__name">{found.name}</div>
            <div className="found__sub">{found.sibling ? `In your family, so ${firstName(found.name)} is added directly. No invitation.` : 'Their family gets an email to accept.'}</div></div>
          <Badge tone="success" icon="check">Code found</Badge></div>
      )}
      {sibs.length > 0 && (
        <div className="bk-share__sibs"><div className="label">Your skaters</div><div className="listbox">
          {sibs.map((x) => {
            const ok = x.coaches.some((c) => c.coachId === coachId && c.status === 'ACTIVE');
            const on = ok && !!x.shareCode && code === x.shareCode;
            return (
              <Row key={x.studentId} muted={!ok} lead={<Avatar name={x.name} size="sm" />} title={x.name}
                sub={ok ? `Coach ${coachFirstName}’s student · added directly, no invitation` : !x.coaches.length ? 'Not with a coach yet' : `Not available to add until Coach ${coachFirstName} accepts them`}
                side={!ok ? <Badge tone="neutral" icon="lock">Not available</Badge> : on ? <Badge tone="success" icon="check">Added</Badge>
                  : <Button variant="secondary" sm disabled={!x.shareCode} onClick={() => x.shareCode && onChange(x.shareCode)}>{`Add ${firstName(x.name)}`}</Button>} />
            );
          })}
        </div></div>
      )}
    </div>
  );
}

/** "Mia R.": first name and the last name's initial (ADR-MASTER section 7). */
export function shortName(name: string): string {
  const w = name.trim().split(/\s+/);
  return w.length < 2 ? w[0]! : `${w[0]} ${w[w.length - 1]![0]!.toUpperCase()}.`;
}

/** The result page's line about the share code (design: bkShareResult). */
export function ShareResult({ shared, kidName, coachFirstName }: {
  shared: { displayName: string; sibling: boolean; lessons: number }; kidName: string; coachFirstName: string;
}) {
  const fn = firstName(shared.displayName), kf = firstName(kidName), n = plural(shared.lessons, 'lesson');
  return shared.sibling
    ? <Banner tone="success" icon="users" title={`${fn} added to ${kf}’s ${shared.lessons === 1 ? 'lesson' : n}`}>{fn} is in your family, so there’s no invitation.</Banner>
    : <Banner tone="info" icon="users" title={`Invitation sent to ${shared.displayName}’s family`}>
        They get an email to accept sharing {shared.lessons === 1 ? 'the lesson' : `all ${n}`} with Coach {coachFirstName}, and {fn} joins once they do. Until then it’s {kf}’s lesson alone. You can withdraw the invitation from My bookings until they answer.
      </Banner>;
}

// ---------------------------------------------------------------- invitations

const invWhen = (i: Invitation) => i.series
  ? `${DAYS_LONG[dayOfWeek(i.dates[0]!.date)]}s at ${formatTime(i.dates[0]!.startTime)}`
  : `${dDow(i.dates[0]!.date)} at ${formatTime(i.dates[0]!.startTime)}`;
const invDates = (i: Invitation) => i.series ? `${shortDate(i.dates[0]!.date)} – ${shortDate(i.dates[i.dates.length - 1]!.date)} · ${plural(i.dates.length, 'lesson')}` : '';
/** Still open: some date hasn't started (B8: worked out from the clock). */
export const invOpen = (i: Invitation, nowMs = Date.now()) => i.dates.some((d) => Date.parse(d.startsAtUtc) > nowMs);

/** Home: invitations for the family's skaters still to answer (design: acInviteCard). */
export function InvitationsCard({ invitations }: { invitations: Invitation[] }) {
  const open = invitations.filter((i) => invOpen(i));
  if (!open.length) return null;
  return (
    <Card flush className="card--attn" title="Shared lesson invitations" sub="Another family invited your skater to share their lesson.">
      {open.map((i) => (
        <Row key={i.inviteId} lead={<span className="roundicon"><Icon name="users" size={18} /></span>}
          title={`${i.invitedByName ?? 'Another family'} invited ${firstName(i.studentName)} to share a lesson with Coach ${i.coachFirstName} ${i.coachLastName}`.trim()}
          sub={`${invWhen(i)}${i.series ? ` · ${invDates(i)}` : ''}${i.hostName ? ` · with ${i.hostName}` : ''}`}
          side={<a className="btn btn--primary btn--sm" href={`#/invite/${i.inviteId}`}><span>See the invitation</span></a>} />
      ))}
    </Card>
  );
}

/**
 * The invitation page (design: invite): opened from the invitation email, signed in. Who invited, the lesson or series,
 * the skater's share once they join (B10), every clash with the skater's other lessons (B7), and Go ahead / Decline (B11).
 */
export function InvitePage({ api, inviteId, onError }: { api: FamilyApi; inviteId: string; onError: (e: unknown) => void }) {
  const [inv, setInv] = useState<Invitation | null | undefined>(undefined);
  const [done, setDone] = useState<'joined' | 'declined' | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    api.invitations()
      .then((all) => live && setInv(all.find((i) => i.inviteId === inviteId) ?? null))
      .catch((e: unknown) => { if (live) { if (e instanceof ApiError && e.status === 401) onError(e); else setInv(null); } });
    return () => { live = false; };
  }, [api, inviteId, onError]);

  const answer = async (go: boolean) => {
    if (!inv) return;
    setBusy(true);
    setErr('');
    try {
      await (go ? api.acceptInvite(inv.inviteId) : api.declineInvite(inv.inviteId));
      setDone(go ? 'joined' : 'declined');
      window.scrollTo?.(0, 0);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onError(e);
      else setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const crumb = <div className="crumb"><a href="#/home"><Icon name="chevL" size={14} />Home</a></div>;
  if (inv === undefined) return <p className="muted" aria-busy="true">Loading…</p>;
  if (inv === null) {
    return (
      <>{crumb}<div className="hero bk-hero--warn"><span className="hero__icon"><Icon name="clock" size={26} /></span>
        <div><h1 className="h1">This lesson is no longer available</h1><p className="lede">The invitation has ended, or it was answered already.</p></div></div>
        <div><a className="btn btn--secondary" href="#/home"><span>Back to home</span></a></div></>
    );
  }
  const kf = firstName(inv.studentName), host = inv.hostName ?? 'the other skater', coach = inv.coachFirstName;
  const details = (
    <Card title={inv.series ? 'The lessons' : 'The lesson'}>
      <div className="kv"><span className="kv__k">Invited by</span><span className="kv__v">{inv.invitedByName ?? 'Another family'}, for {host}</span></div>
      <div className="kv"><span className="kv__k">Lesson</span><span className="kv__v">{inv.series ? `${invWhen(inv)} · ${inv.dates[0]!.durationMinutes} min` : `${invWhen(inv)} · ${inv.dates[0]!.durationMinutes} min`}</span></div>
      {inv.series && <div className="kv"><span className="kv__k">Dates</span><span className="kv__v">{invDates(inv)}</span></div>}
      <div className="kv"><span className="kv__k">Coach</span><span className="kv__v">Coach {coach} {inv.coachLastName}</span></div>
      <div className="kv"><span className="kv__k">Skater</span><span className="kv__v">{inv.studentName}</span></div>
      <div className="kv"><span className="kv__k">Price</span><span className="kv__v">{inv.priceMinor != null && inv.shareMinor != null
        ? `${formatMoney(inv.shareMinor)} for ${kf}${inv.series ? ' per lesson' : ''}: the lesson’s ${formatMoney(inv.priceMinor)}, split between ${inv.skaters} skaters. You pay Coach ${coach} directly.`
        : `You pay Coach ${coach} directly.`}</span></div>
    </Card>
  );
  const page = (top: ReactNode, body: ReactNode = null) => (
    <>{top}<div className="split split--today"><div className="stack">{details}{body}</div>
      <div className="stack"><Help title="Shared lessons">Two skaters share one lesson with Coach {coach}. Each skater’s attendance and payment are kept separately.</Help>
        {inv.series && <Help title="A repeating lesson">Going ahead joins {kf} to every lesson in the series.</Help>}</div></div></>
  );
  const hero = (cls: string, icon: string, title: string, sub: ReactNode) => (
    <>{crumb}<div className={`hero ${cls}`}><span className="hero__icon"><Icon name={icon} size={26} /></span><div><h1 className="h1">{title}</h1><p className="lede">{sub}</p></div></div></>
  );
  if (done === 'joined') return page(hero('hero--success', 'check', `${kf} has joined ${host}’s ${inv.series ? 'lessons' : 'lesson'}`, <>{inv.series ? 'Every lesson in the series is' : 'It’s'} in <a href="#/bookings">My bookings</a>. Coach {coach} sees both skaters.</>));
  if (done === 'declined') return page(hero('bk-hero--warn', 'x', 'Invitation declined', `We’ve told ${inv.invitedByName ?? 'the other family'}. Nothing was booked for ${kf}.`));
  if (!invOpen(inv)) return page(hero('bk-hero--warn', 'clock', 'This lesson is no longer available', `It wasn’t answered before it started, so ${kf} wasn’t added.`));
  const open = inv.dates.filter((d) => Date.parse(d.startsAtUtc) > Date.now());
  return page(
    <>{crumb}<div className="phead"><div className="phead__text"><h1 className="h1">{inv.invitedByName ?? 'Another family'} invited {kf} to share a lesson</h1>
      <p className="lede">{host} and {kf}, together with Coach {coach} {inv.coachLastName}{inv.series ? `, ${invWhen(inv)}` : ` on ${invWhen(inv)}`}.</p></div></div></>,
    <>
      <Card title="Clashes" sub={`Checked against ${kf}’s other lessons, with any coach.`}>
        {inv.clashes.length
          ? <><Banner tone="warning" title={`${plural(inv.clashes.length, 'clash', 'clashes')} with ${kf}’s other lessons`}>{kf} can’t be in two places at once. You can still go ahead and sort out the other lesson.</Banner>
              <div className="listbox">{inv.clashes.map((c) => (
                <Row key={c.date + c.startTime + c.otherStartTime} lead={<span className="roundicon roundicon--warn"><Icon name="alert" size={16} /></span>}
                  title={dDow(c.date)} sub={`${formatTime(c.otherStartTime)} with Coach ${c.otherCoachFirstName} overlaps this lesson at ${formatTime(c.startTime)}`} />
              ))}</div></>
          : <Row lead={<span className="roundicon roundicon--ok"><Icon name="check" size={16} /></span>} title="No clashes" sub={`Nothing else is booked for ${kf} at ${inv.series ? 'these times' : 'that time'}.`} />}
      </Card>
      {err && <Banner tone="danger" title="That didn’t go through">{err}</Banner>}
      <div className="actions"><div><Button variant="secondary" disabled={busy} onClick={() => answer(false)}>Decline</Button></div>
        <div className="actions__r"><Button lg iconRight="arrowR" disabled={busy} onClick={() => answer(true)}>{busy ? 'Sending…' : 'Go ahead'}</Button></div></div>
      <p className="fine">Going ahead adds {kf} to {inv.series ? `all ${plural(open.length, 'lesson')}` : 'the lesson'} now.</p>
    </>,
  );
}

// ---------------------------------------------------------------- the staying family

/** Lessons waiting for this family's answer: the other skater left in time, not started, answer-by not passed. */
export const waiting = (lessons: MyLesson[], nowMs = Date.now()) => lessons.filter((l) => l.share?.partnerStatus === 'LEFT'
  && !!l.share.answerBy && !noAnswer(l.share.answerBy, nowMs) && Date.parse(l.startsAtUtc) > nowMs);

/**
 * The staying family's cards on Home and My bookings (design: bkAskFullCards): one card per series (a one-off date is its
 * own), keep it private at the full price or cancel with no charge; for a series, Keep all / Cancel all remaining dates
 * (which confirms) and a choice per date (B3).
 */
export function WaitingCards({ lessons, api, onChanged, onError }: {
  lessons: MyLesson[]; api: FamilyApi; onChanged: () => void; onError: (e: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmAll, setConfirmAll] = useState<MyLesson[] | null>(null);
  const titleId = useId();
  const groups = new Map<string, MyLesson[]>();
  for (const l of waiting(lessons).sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc))) {
    const k = l.recurrenceId ?? `${l.coachId}|${l.studentId}|${l.date}|${l.startTime}`;
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  if (!groups.size && !msg) return null;

  const run = async (ls: MyLesson[], keep: boolean) => {
    setBusy(true);
    setMsg('');
    try {
      const l0 = ls[0]!;
      const r = await (keep ? api.keep : api.cancelWaiting)({ coachId: l0.coachId, studentId: l0.studentId, startTime: l0.startTime, dates: ls.map((l) => l.date) });
      const kf = firstName(l0.studentName);
      setMsg(`${keep ? `Kept ${plural(r.done.length, 'lesson')} for ${kf} at the full price.` : `Cancelled ${plural(r.done.length, 'lesson')} for ${kf}, with no charge.`}${r.skipped.length ? ` ${plural(r.skipped.length, 'date')} had already started or been answered, so ${r.skipped.length === 1 ? 'it was' : 'they were'} left alone.` : ''}`);
      setConfirmAll(null);
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onError(e);
      else setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const full = (l: MyLesson) => formatMoney(l.share?.fullPriceMinor ?? l.priceMinor ?? 0);
  const by = (l: MyLesson) => atTime(l.share!.answerBy!, l.coachTz);
  return (
    <>
      {msg && <Banner tone="info" title={msg} />}
      {[...groups.entries()].map(([k, ls]) => {
        const l0 = ls[0]!, kf = firstName(l0.studentName), who = l0.share?.partnerName ?? 'The other skater';
        if (ls.length === 1) {
          return (
            <section key={k} className="card card--attn"><div className="card__body"><div className="decide">
              <div><div className="row__title">{who} can’t make {kf}’s shared lesson on {dDow(l0.date)} at {formatTime(l0.startTime)}</div>
                <div className="row__sub">Keep it as a private lesson for {kf} at the full {full(l0)} ({kf}’s share was {formatMoney(l0.priceMinor ?? 0)}), or cancel it with no charge. If you don’t answer by {by(l0)}, it’s cancelled with no charge.</div></div>
              <div className="decide__btns"><Button variant="secondary" disabled={busy} onClick={() => run(ls, false)}>Cancel, no charge</Button>
                <Button disabled={busy} onClick={() => run(ls, true)}>{`Keep at ${full(l0)}`}</Button></div>
            </div></div></section>
          );
        }
        const total = formatMoney(ls.reduce((s, l) => s + (l.share?.fullPriceMinor ?? l.priceMinor ?? 0), 0));
        return (
          <section key={k} className="card card--attn"><div className="card__body"><div className="stack">
            <div><div className="row__title">{who} can’t make {kf}’s shared {DAYS_LONG[dayOfWeek(l0.date)]} lessons at {formatTime(l0.startTime)}</div>
              <div className="row__sub">{plural(ls.length, 'date')} waiting for your answer. Keep them as private lessons for {kf} at the full {full(l0)} each ({kf}’s share was {formatMoney(l0.priceMinor ?? 0)}), or cancel them with no charge. A date not answered by its time is cancelled with no charge.</div></div>
            <div className="listbox">{ls.map((l) => (
              <Row key={l.date} lead={dateBlock(l.date)} title={`${dDow(l.date)} · ${formatTime(l.startTime)}`} sub={`Answer by ${by(l)}`}
                side={<div className="decide__btns"><Button variant="secondary" sm disabled={busy} onClick={() => run([l], false)}>Cancel</Button>
                  <Button variant="secondary" sm disabled={busy} onClick={() => run([l], true)}>{`Keep at ${full(l)}`}</Button></div>} />
            ))}</div>
            <div className="kv"><span className="kv__k">Keep all</span><span className="kv__v">{plural(ls.length, 'lesson')} · <b>{total}</b></span></div>
            <div className="decide__btns"><Button variant="secondary" disabled={busy} onClick={() => setConfirmAll(ls)}>Cancel all remaining dates</Button>
              <Button disabled={busy} onClick={() => run(ls, true)}>Keep all remaining dates</Button></div>
          </div></div></section>
        );
      })}
      {confirmAll && (
        <Dialog onClose={() => setConfirmAll(null)} labelledBy={titleId}>
          <div className="dialog__icon dialog__icon--danger"><Icon name="calOff" size={22} /></div>
          <h2 className="h2" id={titleId}>Cancel all remaining dates?</h2>
          <p className="fine">{firstName(confirmAll[0]!.studentName)}’s {plural(confirmAll.length, 'lesson')}:</p>
          <div className="bk-dlist">{confirmAll.map((l) => <Row key={l.date} lead={dateBlock(l.date)} title={`${dDow(l.date)} · ${formatTime(l.startTime)}`} sub={`${l.durationMinutes} minutes`} />)}</div>
          <p className="fine">No charge. This can’t be undone.</p>
          <div className="dialog__actions"><Button variant="secondary" disabled={busy} onClick={() => setConfirmAll(null)}>Keep them</Button>
            <Button variant="danger" disabled={busy} onClick={() => run(confirmAll, false)}>{`Cancel ${plural(confirmAll.length, 'lesson')}`}</Button></div>
        </Dialog>
      )}
    </>
  );
}
