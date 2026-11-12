/**
 * The coach's Payments page (design: coach/screens-money-profile.js SCREENS.payments, MODALS.mpHow and mpWaive;
 * FeatureDecriptions/Coach Payment Section on Dashboard.md; ADR-MASTER section 12). Batch 8.
 *
 * Every skater's lesson that has happened in a date range, at their share of the price. Unpaid or All; Mark paid with
 * how they paid (optional, changeable afterwards), Waive (always confirms; final, R7), and Undo on paid lessons.
 * Not yet: the Financial summary (Batch 12) and Send reminders (Phase 2), both shown disabled.
 */
import { useEffect, useId, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { Avatar, Badge, Banner, Button, Card, Dialog, Icon, Seg } from '../../shared/components/harbor';
import { plural } from '../../shared/logic/booking';
import { DAYS, MONTHS, dayOfWeek, formatMoney, formatTime, shortDate } from '../../shared/logic/schedule';
import type { PaidVia, PaymentRowDto, PaymentsApi, PaymentsDto } from '../api';

const VIA: Record<PaidVia, string> = { CASH: 'Cash', CASHAPP: 'Cash App', VENMO: 'Venmo', PAYPAL: 'PayPal', OTHER: 'Other' };
const ATTEND: Record<PaymentRowDto['attendance'], [string, string, string?]> = {
  CHECKED_IN: ['Attended', 'success', 'check'], NO_SHOW: ['No-show', 'danger', 'x'], BOOKED: ['Booked', 'neutral'],
  NOT_RECORDED: ['Not recorded', 'warning', 'alert'],
};
const PAY: Record<PaymentRowDto['status'], [string, string, string?]> = {
  PAID: ['Paid', 'success', 'check'], WAIVED: ['Waived', 'neutral'], UNPAID: ['Unpaid', 'warning'],
};
const dDow = (date: string) => `${DAYS[dayOfWeek(date)]}, ${shortDate(date)}`;
const dFull = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8))}, ${date.slice(0, 4)}`;
const keyOf = (r: PaymentRowDto) => `${r.date}#${r.startTime}#${r.studentId}`;

function Empty({ icon, title, body }: { icon: string; title: string; body: string }) {
  return <div className="mp-empty"><span className="mp-empty__icon"><Icon name={icon} size={22} /></span><b>{title}</b><span className="muted">{body}</span></div>;
}

function Stat({ label, value, sub, icon }: { label: string; value: string; sub: React.ReactNode; icon: string }) {
  return <div className="stat"><span className="stat__icon"><Icon name={icon} size={18} /></span><div className="stat__label">{label}</div><div className="stat__value">{value}</div><div className="stat__sub">{sub}</div></div>;
}

type Modal = { kind: 'paid'; r: PaymentRowDto; edit: boolean; via: PaidVia | null } | { kind: 'waive'; r: PaymentRowDto };

export function Payments({ api, onError }: { api: PaymentsApi; onError: (e: unknown) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [all, setAll] = useState(false);
  const [data, setData] = useState<PaymentsDto | null>(null);
  const [flash, setFlash] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const [failed, setFailed] = useState('');
  const [reload, setReload] = useState(0);
  const rangeError = from && to && from > to ? 'The end date is before the start date.' : '';
  const ready = Boolean(from && to && !rangeError);

  useEffect(() => {
    if (!ready) { setData(null); return; }
    let live = true;
    api.list(from, to).then((d) => live && setData(d)).catch((e: unknown) => live && onError(e));
    return () => { live = false; };
  }, [api, from, to, ready, reload, onError]);

  /** One write, then the list again so the figures follow. A write from a stale view is shown, not thrown. */
  const act = async (run: () => Promise<PaymentRowDto>, message: (after: PaymentRowDto) => string) => {
    setFailed('');
    try {
      const after = await run();
      setModal(null);
      setFlash(message(after));
      setReload((n) => n + 1);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setModal(null);
        setFailed(e.message);
        setReload((n) => n + 1);
      } else onError(e);
    }
  };

  const head = (
    <div className="phead">
      <div className="phead__text"><h1 className="h1">Payments</h1><p className="lede">Track who has paid. BladeBook doesn’t take payments; you mark them here.</p></div>
      <div className="phead__actions">
        <button type="button" className="btn btn--secondary" disabled title="Comes in a later batch"><Icon name="trend" /><span>Financial summary</span></button>
        <span className="mp-phase"><button type="button" className="btn btn--secondary" disabled><Icon name="mail" /><span>Send reminders</span></button><Badge tone="neutral">Phase 2</Badge></span>
      </div>
    </div>
  );
  const bar = (
    <div className="filters mp-filters">
      <div className="field"><label className="label" htmlFor="pay-from">From</label>
        <input id="pay-from" type="date" className="ctl" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      <div className={`field${rangeError ? ' field--error' : ''}`}><label className="label" htmlFor="pay-to">To</label>
        <input id="pay-to" type="date" className={`ctl${rangeError ? ' is-error' : ''}`} value={to} onChange={(e) => setTo(e.target.value)} />
        {rangeError && <div className="hint hint--error"><Icon name="alert" size={14} />{rangeError}</div>}</div>
      {ready && <Seg label="Show" options={['Unpaid', 'All']} selected={all ? 1 : 0} onSelect={(i) => setAll(i === 1)} />}
    </div>
  );
  if (!ready || !data) {
    return <>{head}{bar}<Card><Empty icon="card" title="Pick a date range" body="Choose a start and end date to see payments for the lessons in it." /></Card></>;
  }

  const cur = data.currency;
  const money = (m: Record<string, number>) => formatMoney(m[cur] ?? 0);
  const t = data.totals;
  const list = all ? data.rows : data.rows.filter((r) => r.status === 'UNPAID');
  const rows = list.map((r) => {
    const [at, atone, aicon] = ATTEND[r.attendance];
    const [pt, ptone, picon] = PAY[r.status];
    const acts = r.status === 'UNPAID'
      ? <><Button variant="ghost" sm onClick={() => setModal({ kind: 'waive', r })}>Waive</Button>
          <Button variant="secondary" sm icon="check" onClick={() => setModal({ kind: 'paid', r, edit: false, via: null })}>Mark paid</Button></>
      // Waived is final (R7): no Undo. Paid can still be undone.
      : r.status === 'WAIVED' ? <span className="muted">Final</span>
        : <Button variant="ghost" sm icon="undo" onClick={() => void act(() => api.undo(r), () => `${r.fullName}, ${shortDate(r.date)}: back to unpaid.`)}>Undo</Button>;
    return (
      <tr key={keyOf(r)} className={r.attendance === 'NOT_RECORDED' ? 'mp-attn' : undefined}>
        <td><span className="cellname"><Avatar name={r.fullName} size="sm" /><span>{r.fullName}
          {r.relationship === 'GUARDIAN' && r.familyName && <small className="mp-sub">{r.familyName}</small>}
          {r.sharedWith.length > 0 && <small className="mp-sub"><Icon name="users" size={12} /> Shared with {r.sharedWith.join(', ')}</small>}</span></span></td>
        <td className="num">{dDow(r.date)} · {formatTime(r.startTime)}</td>
        <td><Badge tone={atone} icon={aicon}>{at}</Badge></td>
        <td className="r money">{formatMoney(r.amountMinor)}</td>
        <td><Badge tone={ptone} icon={picon}>{pt}</Badge>
          {r.status === 'PAID' && <small className="mp-how">{r.paidVia ? `${VIA[r.paidVia]} · ` : ''}
            <a className="link" href="#" onClick={(e) => { e.preventDefault(); setModal({ kind: 'paid', r, edit: true, via: r.paidVia }); }}>{r.paidVia ? 'Change' : 'Add how they paid'}</a></small>}</td>
        <td className="r"><span className="cellbtns">{acts}</span></td>
      </tr>
    );
  });

  return (
    <>
      {flash && <Banner tone="success">{flash}</Banner>}
      {failed && <Banner tone="danger">{failed}</Banner>}
      {head}{bar}
      <div className="stats">
        <Stat label="Unpaid" value={money(t.unpaid)} sub={plural(t.unpaidCount, 'lesson')} icon="card" />
        <Stat label="No-shows" value={String(t.noShows)} sub={`${money(t.noShowsUnpaid)} unpaid`} icon="x" />
        <Stat label="Not recorded" value={String(t.notRecorded)} sub={t.notRecorded ? <a className="link" href="#/lessons">Check attendance</a> : 'All recorded'} icon="alert" />
        <Stat label="Paid" value={money(t.paid)} sub={plural(t.paidCount, 'lesson')} icon="check" />
      </div>
      <Card title={all ? 'All lessons' : 'Unpaid lessons'} sub={`${dFull(from)} – ${dFull(to)}`} flush>
        {list.length ? (
          <div className="mp-tablewrap"><table className="table">
            <thead><tr><th>Skater</th><th>Lesson</th><th>Attendance</th><th className="r">Amount</th><th>Payment</th><th className="r"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows}</tbody>
          </table></div>
        ) : all ? <Empty icon="calendar" title="No lessons in this range" body="Only lessons that have already happened are listed." />
          : <Empty icon="check" title="Nothing unpaid in this range" body="Every lesson here is paid or waived. Switch to All to see them." />}
        <div className="card__note"><Icon name="info" size={14} /> A no-show shows the full lesson price until you mark it paid or waived. Upcoming lessons aren’t listed until they’ve happened. Each skater in a shared lesson pays for themselves. How a family paid is for your records only; families don’t see it. All amounts are in {cur}.</div>
      </Card>
      {modal?.kind === 'paid' && <PaidDialog m={modal} choices={data.choices} onPick={(via) => setModal({ ...modal, via })} onClose={() => setModal(null)}
        onSave={() => void act(() => api.markPaid(modal.r, modal.via), (a) => `${a.fullName}, ${shortDate(a.date)}: ${modal.edit
          ? (a.paidVia ? `paid by ${VIA[a.paidVia]}.` : 'how they paid cleared.') : `marked paid${a.paidVia ? ` by ${VIA[a.paidVia]}` : ''}.`}`)} />}
      {modal?.kind === 'waive' && <WaiveDialog r={modal.r} onClose={() => setModal(null)}
        onWaive={() => void act(() => api.waive(modal.r), (a) => `${a.fullName}, ${shortDate(a.date)}: waived.`)} />}
    </>
  );
}

function PaidDialog({ m, choices, onPick, onClose, onSave }: {
  m: Extract<Modal, { kind: 'paid' }>; choices: PaidVia[]; onPick: (via: PaidVia | null) => void; onClose: () => void; onSave: () => void;
}) {
  const id = useId();
  // A stored type switched off since stays a choice, so editing never loses it.
  const opts = m.r.paidVia && !choices.includes(m.r.paidVia) ? [...choices.slice(0, -1), m.r.paidVia, 'OTHER' as const] : choices;
  const on = m.via ? opts.indexOf(m.via) : -1;
  return (
    <Dialog onClose={onClose} labelledBy={id}>
      <div className="dialog__icon"><Icon name="check" size={22} /></div>
      <h2 className="h2" id={id}>{m.edit ? 'How did they pay?' : 'Mark paid'}</h2>
      <div className="dialog__what"><b>{m.r.fullName}</b><span>{dDow(m.r.date)} · {formatTime(m.r.startTime)} · {formatMoney(m.r.amountMinor)}</span></div>
      <div className="fieldset mp-how-pick"><div className="label">How did they pay? <span className="label__opt">Optional</span></div>
        <Seg label="How did they pay?" options={opts.map((v) => VIA[v])} selected={on} onSelect={(i) => onPick(opts[i] === m.via ? null : opts[i]!)} />
        <div className="hint">For your records only; families don’t see it. These are the payment types on your <a className="link" href="#/profile/payments">profile</a>, plus Other.{on >= 0 ? ' Pick it again to clear it.' : ''}</div></div>
      <div className="dialog__actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={m.edit ? undefined : 'check'} onClick={onSave}>{m.edit ? 'Save' : 'Mark paid'}</Button></div>
    </Dialog>
  );
}

/** Waiving can't be undone, so it always asks first (R7). */
function WaiveDialog({ r, onClose, onWaive }: { r: PaymentRowDto; onClose: () => void; onWaive: () => void }) {
  const id = useId();
  return (
    <Dialog onClose={onClose} labelledBy={id}>
      <div className="dialog__icon dialog__icon--danger"><Icon name="alert" size={22} /></div>
      <h2 className="h2" id={id}>Waive this lesson?</h2>
      <div className="dialog__what"><b>{r.fullName}</b><span>{dDow(r.date)} · {formatTime(r.startTime)} · {formatMoney(r.amountMinor)}</span></div>
      <p className="fine">The family won’t owe anything for it. This can’t be undone.</p>
      <div className="dialog__actions"><Button variant="secondary" onClick={onClose}>Keep it unpaid</Button><Button variant="danger" onClick={onWaive}>Waive lesson</Button></div>
    </Dialog>
  );
}
