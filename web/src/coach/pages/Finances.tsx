/**
 * The coach's Financial summary (design: coach/screens-money-profile.js SCREENS.finances and MODALS.finExport;
 * FeatureDecriptions/Coach Financial Page.md; ADR-MASTER section 12 "Financial page"; ADR-030). Batch 12.
 *
 * This year's gross so far, month by month: money received, meaning lessons marked paid (a no-show marked paid
 * included), counted in the month the lesson was taught. A lesson from last year marked paid this year counts in the
 * month it was marked paid, labelled with its year (owner, 2026-11-13). Rink fees are Phase 2, so the page says
 * they're coming.
 * Download saves the summary CSV for this year or last; past years on screen are Phase 2.
 */
import { useEffect, useId, useState } from 'react';
import { Badge, Banner, Button, Card, Dialog, Help, Icon, Seg } from '../../shared/components/harbor';
import { plural } from '../../shared/logic/booking';
import { MONTHS, MONTHS_LONG, formatMoney } from '../../shared/logic/schedule';
import type { FinanceYearDto, FinancesApi } from '../api';

function Stat({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: string }) {
  return <div className="stat"><span className="stat__icon"><Icon name={icon} size={18} /></span><div className="stat__label">{label}</div><div className="stat__value">{value}</div><div className="stat__sub">{sub}</div></div>;
}

/** Saves text as a file: the browser's download, from a blob. */
function save(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Phase 1 coaches teach at one rink (ADR-MASTER section 6). */
const RINK = 'Pelham Civic Center';

export function Finances({ api, year, onError }: { api: FinancesApi; year: number; onError: (e: unknown) => void }) {
  const [data, setData] = useState<FinanceYearDto | null>(null);
  const [exporting, setExporting] = useState(false);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    let live = true;
    api.year(year).then((d) => live && setData(d)).catch((e: unknown) => live && onError(e));
    return () => { live = false; };
  }, [api, year, onError]);

  const head = (
    <>
      <div className="crumb"><a className="link crumbbtn" href="#/payments"><Icon name="arrowL" size={14} /> Payments</a></div>
      <div className="phead">
        <div className="phead__text"><h1 className="h1">Financial summary</h1>
          <p className="lede">Your {year} figures so far, for your taxes. Gross is money you’ve received.</p></div>
        <div className="phead__actions">
          <Button variant="secondary" icon="arrowR" onClick={() => setExporting(true)}>Download summary</Button>
          <span className="mp-phase"><Button variant="secondary" icon="calendar" disabled>Past years</Button><Badge tone="neutral">Phase 2</Badge></span>
        </div>
      </div>
    </>
  );
  if (!data) return <>{head}<p className="muted" aria-busy="true">Loading…</p></>;

  const cur = data.currency;
  const money = (m: Record<string, number>) => formatMoney(m[cur] ?? 0);
  const thisMonth = data.today.slice(0, 7);
  const first = data.months.findIndex((m) => m.hasLessons || m.earlierLessons > 0);
  /** Only last year's lessons are read, so "earlier" is always the year before (FinancialService). */
  const earlier = (m: Record<string, number>) => `${formatMoney(m[cur] ?? 0)} for ${data.year - 1} lessons`;
  const monthName = (ym: string) => MONTHS_LONG[Number(ym.slice(5, 7)) - 1];
  const upTo = MONTHS_LONG[data.months.length - 1];
  const rows = data.months.slice(Math.max(first, 0)).map((m) => {
    const unpaid = m.unpaid[cur] ?? 0;
    return (
      <tr key={m.month}>
        <td><b>{monthName(m.month)}</b>{m.month === thisMonth && <small className="mp-sub">To {MONTHS[Number(data.today.slice(5, 7)) - 1]} {Number(data.today.slice(8))}</small>}</td>
        <td className="num">{plural(m.paidLessons, 'lesson')}{unpaid > 0 && <small className="mp-sub">{formatMoney(unpaid)} still unpaid</small>}</td>
        <td className="r money">{money(m.gross)}{m.earlierLessons > 0 && <small className="mp-sub">Includes {earlier(m.earlierGross)}</small>}</td>
      </tr>
    );
  });

  return (
    <>
      {flash && <Banner tone="success">{flash}</Banner>}
      {head}
      <Banner tone="info" title="Based on lessons you’ve marked as paid">These figures are calculated from the lessons you’ve marked as paid. A lesson you haven’t marked paid isn’t included. A finished year is closed: a lesson from it marked paid later counts in the month you mark it, labelled with its year.</Banner>
      <div className="stats">
        <Stat label={`Gross, ${data.year} to date`} value={money(data.gross)} sub={`${plural(data.paidLessons, 'lesson')} marked paid${data.earlierLessons > 0 ? ` · ${earlier(data.earlierGross)}` : ''}`} icon="card" />
        <Stat label="Still unpaid" value={money(data.unpaid)} sub="Not in gross until marked paid" icon="alert" />
      </div>
      <div className="split fin-split">
        <Card title="Month by month" sub={`January – ${upTo} ${data.year}`} flush>
          <div className="mp-tablewrap"><table className="table fin-table">
            <thead><tr><th>Month</th><th>Paid lessons</th><th className="r">Gross received</th></tr></thead>
            <tbody>
              {first > 0 && <tr className="fin-none"><td>{MONTHS_LONG[0]} – {MONTHS_LONG[first - 1]}</td><td colSpan={2} className="muted">No lessons in BladeBook</td></tr>}
              {first < 0 && <tr className="fin-none"><td>{data.months.length > 1 ? `${MONTHS_LONG[0]} – ${upTo}` : upTo}</td><td colSpan={2} className="muted">No lessons in BladeBook</td></tr>}
              {first >= 0 && rows}
            </tbody>
            <tfoot><tr><td><b>{data.year} to date</b></td><td className="num">{plural(data.paidLessons, 'lesson')}</td><td className="r money">{money(data.gross)}{data.earlierLessons > 0 && <small className="mp-sub">Includes {earlier(data.earlierGross)}</small>}</td></tr></tfoot>
          </table></div>
          <div className="card__note"><Icon name="info" size={14} /> Gross counts lessons marked paid, including a missed-lesson fee once you’ve collected it (mark the no-show paid). Unpaid and waived lessons aren’t counted. A lesson counts in the month it was taught; one from last year marked paid this year counts in the month you marked it. Amounts are in {cur}.</div>
        </Card>
        <div className="stack">
          <Card title="Rink fees">
            <p className="fine"><Badge tone="neutral">Coming in Phase 2</Badge></p>
            <p className="fine">Rink fee calculation is coming. BladeBook will work out what you owe {RINK} each month from the rink’s terms, and add it to this page and your download.</p>
          </Card>
          <Help title="For your tax records">Download a summary for your records or your tax preparer: one row per month, no skater names. Seeing past years on screen, and a lesson-by-lesson export, come in Phase 2.</Help>
        </div>
      </div>
      {exporting && <ExportDialog year={data.year} onClose={() => setExporting(false)}
        onDownload={async (y) => {
          try {
            const d = await api.download(y);
            save(d.fileName, d.csv);
            setExporting(false);
            setFlash(`Saved ${d.fileName}.`);
          } catch (e) { onError(e); }
        }} />}
    </>
  );
}

function ExportDialog({ year, onClose, onDownload }: { year: number; onClose: () => void; onDownload: (year: number) => void }) {
  const id = useId();
  const [last, setLast] = useState(false);
  return (
    <Dialog onClose={onClose} labelledBy={id}>
      <div className="dialog__icon"><Icon name="arrowR" size={22} /></div>
      <h2 className="h2" id={id}>Download a summary</h2>
      <p className="fine">A CSV file with one row per month: gross received and the number of paid lessons, plus the year’s totals. No skater names.</p>
      <div className="fieldset"><div className="label">Year</div>
        <Seg label="Year" options={[`${year} so far`, String(year - 1)]} selected={last ? 1 : 0} onSelect={(i) => setLast(i === 1)} />
        <div className="hint">{last ? `${year - 1} is closed, so its figures won’t change.` : 'Calculated from the lessons you’ve marked as paid.'}</div></div>
      <div className="dialog__actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onDownload(last ? year - 1 : year)}>Download CSV</Button></div>
    </Dialog>
  );
}
