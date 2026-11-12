/**
 * The schedule section, Batch 2 (design: coach/schedule.html → schedule-hub, schedule-weekly,
 * schedule-weekly-clash, schedule-weekly-no-ice, schedule-review).
 *
 * Rulings applied (implementation plan §4): S2 a block's number is its stored seq; S3 times run 12:00 AM
 * to 11:45 PM in 15-minute steps; S4 (amended 2026-11-09) a new block starts 5:00 AM to 7:00 PM with length
 * and days cleared, and the time lists have no blank choice; S5 the Name field always shows; S6 clicking a slot with no length sets
 * 30, no slot runs past the end; S1 the price is in the coach's currency, with the odd-cents warning.
 *
 * Not yet: time off and special schedules (Batch 6) and the save's impact preview (Batch 6; with no
 * bookings yet, Review shows the week and saves).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '../../shared/api/client';
import { signInLocally } from '../../shared/auth/localAuth';
import { Badge, Banner, Button, Card, Dialog, Icon } from '../../shared/components/harbor';
import {
  DAYS, LESSON_LENGTHS, MAX_NAME, MAX_SKATERS, MAX_SPECIAL_DAYS, QUARTER_HOURS, addDays, dateRange, datesBetween, dayOfWeek, forDate,
  formatClock, formatMoney, formatShort, formatTime, isOff, label, lessonsOn, longDate, nextSeq, oddCentsWarning, parseMoney, problems,
  shortDate, slots, specialProblems, tempProblems, todayIn, toMinutes, type Template, type TempSummary,
} from '../../shared/logic/schedule';
import { scheduleApi, type PreviewDto, type Profile, type ScheduleApi, type ScheduleDto, type TempDto, type TemplateDto } from '../api';
import { ChangeReview } from './ScheduleReview';

/** Pelham Civic Center's ice types (ADR-MASTER section 6). Families never see them. */
const ICE_TYPES = [
  { id: 'BFSC_FREESTYLE', name: 'Birmingham Figure Skating Club (BFSC) freestyle ice', short: 'BFSC freestyle' },
  { id: 'STICK_AND_PUCK', name: 'Stick and Puck (S&P) ice', short: 'S&P ice' },
  { id: 'PUBLIC', name: 'Public ice', short: 'Public ice' },
] as const;
const RINK = 'Pelham Civic Center (PCC)';

const iceShort = (id: string | null) => ICE_TYPES.find((x) => x.id === id)?.short;
const skatersText = (n: number | null) => (n && n > 1 ? `up to ${n} skaters` : '1 skater');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dayList = (t: { days: number[] }) => [...t.days].sort().map((d) => DAYS[d]).join(' · ');

/** A special schedule's dates and name, as typed. */
interface Dates { sd: string; ed: string; name: string }
export const summary = (t: TempDto): TempSummary => ({ tempId: t.tempId!, kind: t.kind, displayName: t.displayName ?? t.name, startDate: t.startDate, endDate: t.endDate });

/** The editor's copy of a template: the price is kept as typed. */
interface Draft extends Omit<Template, 'priceMinor'> {
  priceText: string;
}

/** The times a new block starts with; whatever the lists show is what gets saved. */
const DEFAULT_START = '05:00';
const DEFAULT_END = '19:00';

const toDraft = (t: TemplateDto): Draft => ({
  ...t, startTime: t.startTime ?? DEFAULT_START, endTime: t.endTime ?? DEFAULT_END, priceText: t.priceMinor == null ? '' : formatMoney(t.priceMinor).slice(1).replace(/,/g, ''),
});
const toTemplate = (d: Draft): Template => {
  const price = parseMoney(d.priceText);
  const { priceText: _, ...rest } = d;
  return { ...rest, priceMinor: price === undefined ? null : price };
};
/** S4 as amended by the owner (2026-11-09): a new block starts 5:00 AM to 7:00 PM, with length and days cleared. */
const blankDraft = (seq: number): Draft => ({
  seq, name: '', startTime: DEFAULT_START, endTime: DEFAULT_END, lessonMinutes: null, priceText: '', maxSkaters: 1, iceType: null, days: [], off: {},
});

const weekLessons = (ts: Template[]) => ts.reduce((n, t) => n + [0, 1, 2, 3, 4, 5, 6].reduce((m, d) => m + lessonsOn(t, d), 0), 0);

function useSchedule(api: ScheduleApi, onError: (e: unknown) => void) {
  const [data, setData] = useState<ScheduleDto | null>(null);
  useEffect(() => {
    let live = true;
    api.schedule().then((d) => live && setData(d)).catch((e: unknown) => live && onError(e));
    return () => { live = false; };
  }, [api, onError]);
  return data;
}

function Loading() {
  return <p className="muted" aria-busy="true">Loading…</p>;
}

// ------------------------------------------------------------------ hub

export function ScheduleHub({ api, profile, flash, onError }: {
  api: ScheduleApi; profile: Profile; flash: string; onError: (e: unknown) => void;
}) {
  const data = useSchedule(api, onError);
  const [temps, setTemps] = useState<TempDto[] | null>(null);
  useEffect(() => {
    let live = true;
    api.temps().then((t) => live && setTemps(t)).catch((e: unknown) => live && onError(e));
    return () => { live = false; };
  }, [api, onError]);
  const templates = data?.templates ?? [];
  const asTemplates = templates.map((t) => t as Template);
  const days = [...new Set(templates.flatMap((t) => t.days))].sort().map((d) => DAYS[d]).join(' · ');
  return (
    <>
      {flash && <Banner tone="success" title={flash} />}
      <div className="phead"><div className="phead__text"><h1 className="h1">Your schedule</h1>
        <p className="lede">{longDate(todayIn(profile.coachTimezone))}</p></div></div>
      {!data ? <Loading /> : (
        <div className="grid2">
          <a className="action-card action-card--primary" href="#/schedule/weekly">
            <span className="action-card__icon"><Icon name="repeat" size={22} /></span>
            <span className="action-card__title">{data.exists ? 'Edit weekly schedule' : 'Build your repeating weekly schedule'}</span>
            <span className="action-card__sub">Your normal week. It repeats until you change it.</span>
            <span className="action-card__meta">
              {data.exists ? `${days} · ${plural(templates.length, 'block')} · ${weekLessons(asTemplates)} lessons` : 'Start here'} <Icon name="arrowR" />
            </span>
          </a>
          <a className="action-card" href="#/schedule/dates">
            <span className="action-card__icon"><Icon name="calOff" size={22} /></span>
            <span className="action-card__title">Add time off or a special schedule</span>
            <span className="action-card__sub">Vacation, a tournament, a camp or holiday hours — for a set range of dates.</span>
            <span className="action-card__meta">Add dates <Icon name="arrowR" /></span>
          </a>
        </div>
      )}
      {temps && temps.length > 0 && (
        <Card title="Time off and special schedules" flush>
          {temps.map((t) => (
            <div key={t.tempId} className="row">
              <div className="row__main">
                <span className={`roundicon${t.kind === 'SPECIAL' ? ' roundicon--alt' : ''}`}><Icon name={t.kind === 'SPECIAL' ? 'spark' : 'calOff'} size={16} /></span>
                <div><div className="row__title">{t.displayName ?? t.name}</div><div className="row__sub">{t.kind === 'SPECIAL' ? 'Special schedule' : 'No lessons'}</div></div>
              </div>
              <div className="row__side"><span className="muted num">{dateRange(t.startDate, t.endDate)}</span>
                {t.kind === 'SPECIAL' && <a className="btn btn--ghost btn--sm" href={`#/schedule/special/${t.tempId}`}><span>Edit</span></a>}
                <a className="btn btn--ghost btn--sm" href={`#/schedule/delete/${t.tempId}`} aria-label={`Delete ${t.displayName ?? t.name}`}><Icon name="trash" size={14} /><span>Delete</span></a></div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

/**
 * Deleting time off or a special schedule (owner, 2026-11-12; not in the design; C_Coach Schedule Hub.md). Its dates go
 * back to the weekly schedule, which can cancel or re-price booked lessons, so it goes through the same review as any
 * schedule change, then the save status.
 */
export function DeleteDates({ api, profile, tempId, onSaved, onToken, onError }: {
  api: ScheduleApi; profile: Profile; tempId: string; onSaved: (s: Saved) => void; onToken: (token: string) => void; onError: (e: unknown) => void;
}) {
  const [temp, setTemp] = useState<TempDto | null>(null);
  const [preview, setPreview] = useState<PreviewDto | null>(null);
  const save = useGuardedSave(profile, onToken, onError);
  useEffect(() => {
    let live = true;
    Promise.all([api.temp(tempId), api.previewDelete(tempId)])
      .then(([t, p]) => { if (live) { setTemp(t); setPreview(p); } })
      .catch((e: unknown) => live && onError(e));
    return () => { live = false; };
  }, [api, tempId, onError]);
  if (!temp) return <Loading />;
  const name = temp.displayName ?? temp.name;
  const what = temp.kind === 'TIME_OFF'
    ? `Delete ${name} · ${dateRange(temp.startDate, temp.endDate)} · families can book these dates again`
    : `Delete ${name} · ${dateRange(temp.startDate, temp.endDate)} · your weekly schedule applies to these dates again`;
  return (
    <>
      <ChangeReview what={what} preview={preview} noticeHours={profile.requiredNoticeHours} errors={save.errors} busy={save.busy}
        onBack={() => { window.location.hash = '#/schedule'; }}
        onAccept={() => { const since = Date.now(); void save.run(api, async (a) => { await a.deleteTemp(tempId); onSaved({ lessons: preview ? touched(preview) : 0, families: preview?.families ?? 0, since }); }); }} />
      {save.dialog}
    </>
  );
}

/** "What's different about these dates?" (design: chooseAway()). */
export function ChooseDates() {
  return (
    <>
      <div className="phead"><div className="phead__text">
        <div className="crumb"><a className="link crumbbtn" href="#/schedule"><Icon name="arrowL" size={14} /> Your schedule</a></div>
        <h1 className="h1">Add dates</h1><p className="lede">What’s different about these dates?</p>
      </div></div>
      <div className="grid2">
        <a className="choice" href="#/schedule/time-off"><span className="choice__icon"><Icon name="calOff" size={24} /></span><span className="choice__title">No lessons</span>
          <span className="choice__sub">Vacation, a tournament, an absence you know about in advance. Just a name and dates.</span><span className="choice__go"><Icon name="arrowR" size={18} /></span></a>
        <a className="choice" href="#/schedule/special/new"><span className="choice__icon"><Icon name="spark" size={24} /></span><span className="choice__title">Special schedule</span>
          <span className="choice__sub">A camp or holiday hours — different times, lengths or prices for a set of dates.</span><span className="choice__go"><Icon name="arrowR" size={18} /></span></a>
      </div>
      <Banner tone="info" title="Sick today?">Use <b>Cancel this day</b> on your week view instead. It cancels lessons without changing your schedule, and you choose whether the slots can be rebooked.</Banner>
    </>
  );
}

/** Time off (design: timeOff(); C_Coach Time Off.md): a name and dates, then the review, then the save status. */
export function TimeOffForm({ api, profile, onSaved, onToken, onError }: {
  api: ScheduleApi; profile: Profile; onSaved: (s: Saved) => void; onToken: (token: string) => void; onError: (e: unknown) => void;
}) {
  const today = todayIn(profile.coachTimezone);
  const [temps, setTemps] = useState<TempDto[] | null>(null);
  const [form, setForm] = useState({ name: '', sd: addDays(today, 1), ed: addDays(today, 2) });
  const [count, setCount] = useState<number | null>(null);
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [preview, setPreview] = useState<PreviewDto | null>(null);
  const save = useGuardedSave(profile, onToken, onError);
  useEffect(() => {
    let live = true;
    api.temps().then((t) => live && setTemps(t)).catch((e: unknown) => live && onError(e));
    return () => { live = false; };
  }, [api, onError]);
  const errs = temps ? tempProblems('TIME_OFF', form.name, form.sd, form.ed, temps.map(summary), today, null, null) : [];
  const body: TempDto = { tempId: null, kind: 'TIME_OFF', name: form.name, startDate: form.sd, endDate: form.ed, templates: [] };
  const valid = temps != null && errs.length === 0;
  // How many booked lessons it cancels, before review (C_Coach Time Off.md).
  useEffect(() => {
    if (!valid) return;
    let live = true;
    setCount(null);
    const t = window.setTimeout(() => {
      api.previewTemp({ tempId: null, kind: 'TIME_OFF', name: form.name, startDate: form.sd, endDate: form.ed, templates: [] })
        .then((p) => live && setCount(p.cancel.length)).catch(() => live && setCount(null));
    }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [api, valid, form.name, form.sd, form.ed]);

  if (!temps) return <Loading />;
  if (step === 'review') {
    return (
      <>
        <ChangeReview what={`${form.name.trim() || 'Time off'} · no lessons ${dateRange(form.sd, form.ed)}`} preview={preview} timeOff
          noticeHours={profile.requiredNoticeHours} errors={save.errors} busy={save.busy}
          onBack={() => { save.setErrors([]); setStep('edit'); }}
          onAccept={() => { const since = Date.now(); void save.run(api, async (a) => { await a.saveTemp(body); onSaved({ lessons: preview?.cancel.length ?? 0, families: preview?.families ?? 0, since }); }); }} />
        {save.dialog}
      </>
    );
  }
  const review = () => {
    setStep('review');
    setPreview(null);
    window.scrollTo(0, 0);
    api.previewTemp(body).then(setPreview)
      .catch((e: unknown) => (e instanceof ApiError && e.status === 400 ? save.setErrors(e.message.split('\n')) : onError(e)));
  };
  return (
    <>
      <div className="phead"><div className="phead__text">
        <div className="crumb"><a className="link crumbbtn" href="#/schedule/dates"><Icon name="arrowL" size={14} /> Add dates</a></div>
        <h1 className="h1">Time off</h1><p className="lede">Every date in this range becomes a day with no lessons. Families can’t book them.</p>
      </div></div>
      <Card>
        <div className="field"><label className="label" htmlFor="away-name">Name <span className="label__opt">Optional</span></label>
          <input id="away-name" className="ctl" maxLength={MAX_NAME} value={form.name} placeholder="e.g. Fall break" onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="grid2">
          <div className="field"><label className="label" htmlFor="away-sd">First day off</label>
            <input id="away-sd" type="date" className={`ctl${errs.length ? ' is-error' : ''}`} value={form.sd} onChange={(e) => setForm({ ...form, sd: e.target.value })} /></div>
          <div className="field"><label className="label" htmlFor="away-ed">Last day off</label>
            <input id="away-ed" type="date" className={`ctl${errs.length ? ' is-error' : ''}`} value={form.ed} onChange={(e) => setForm({ ...form, ed: e.target.value })} /></div>
        </div>
        {errs.length ? <Banner tone="danger" title="These dates can’t be used">{errs.map((m) => <div key={m}>{m}</div>)}</Banner>
          : count == null ? <p className="muted" aria-busy="true">Checking your booked lessons…</p>
            : count ? <Banner tone="warning" title={`${plural(count, 'booked lesson')} will be cancelled`}>You’ll see exactly which on the next step. Nothing changes until you accept.</Banner>
              : <Banner tone="success" title="No booked lessons on these dates" />}
      </Card>
      <div className="actions">
        <a className="btn btn--secondary" href="#/schedule/dates"><span>Back</span></a>
        <Button iconRight="arrowR" disabled={!valid} onClick={review}>Review changes</Button>
      </div>
    </>
  );
}

// --------------------------------------------------------------- editor

/** What the review and status pages are told after a save: the lessons touched and the families told. */
export interface Saved { lessons: number; families: number; since: number }

/**
 * Saving with the 15-minute sign-in (ADR-023 d4): a refused save asks to sign in again, keeps the edits, and retries
 * with the new sign-in (locally the token stub, SC-7).
 */
export function useGuardedSave(profile: Profile, onToken: (t: string) => void, onError: (e: unknown) => void) {
  const [reauth, setReauth] = useState<null | ((api: ScheduleApi) => Promise<void>)>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const run = async (withApi: ScheduleApi, save: (api: ScheduleApi) => Promise<void>) => {
    setBusy(true);
    setErrors([]);
    try {
      await save(withApi);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SIGN_IN_TO_SAVE') setReauth(() => save);
      else if (e instanceof ApiError && (e.status === 400 || e.status === 409)) setErrors(e.message.split('\n'));
      else onError(e);
    } finally {
      setBusy(false);
    }
  };
  /** LOCAL STAND-IN for entering the password again (shortcut SC-1): a fresh stub sign-in, then the same save. */
  const signInAndSave = async () => {
    const save = reauth;
    setReauth(null);
    if (!save) return;
    try {
      const token = await signInLocally(profile.loginEmail);
      onToken(token);
      await run(scheduleApi(token), save);
    } catch (e) {
      onError(e);
    }
  };
  const dialog = reauth && (
    <Dialog onClose={() => setReauth(null)} labelledBy="reauth-title">
      <h2 className="h2" id="reauth-title">Confirm it’s you</h2>
      <p className="muted">Saving your schedule needs a sign-in from the last 15 minutes. Your changes are kept.</p>
      <div className="actions">
        <Button variant="secondary" onClick={() => setReauth(null)}>Not now</Button>
        <Button onClick={signInAndSave}>Sign in again and save</Button>
      </div>
    </Dialog>
  );
  return { run, busy, errors, setErrors, dialog };
}

const touched = (p: PreviewDto) => p.cancel.length + p.reprice.length;

export function WeeklyEditor(props: {
  api: ScheduleApi; profile: Profile; onSaved: (s: Saved) => void; onToken: (token: string) => void; onError: (e: unknown) => void;
}) {
  return <ScheduleEditor {...props} special={undefined} />;
}

/**
 * The weekly editor and the special schedule editor (design: builder()). {@code special} undefined: the weekly
 * schedule; {@code null}: a new special schedule; an id: that one, to edit. A special schedule's blocks apply to every
 * date, its columns are real dates, and a time switched off is off on that date only.
 */
export function ScheduleEditor({ api, profile, special, onSaved, onToken, onError }: {
  api: ScheduleApi; profile: Profile; special: string | null | undefined; onSaved: (s: Saved) => void;
  onToken: (token: string) => void; onError: (e: unknown) => void;
}) {
  const temp = special !== undefined;
  const today = todayIn(profile.coachTimezone);
  const data = useSchedule(api, onError);
  const [temps, setTemps] = useState<TempDto[] | null>(temp ? null : []);
  const [opened, setOpened] = useState<TempDto | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [snapshot, setSnapshot] = useState<{ drafts: Draft[]; dates: Dates }>({ drafts: [], dates: { sd: '', ed: '', name: '' } });
  const [dates, setDates] = useState<Dates>({ sd: '', ed: '', name: '' });
  const [active, setActive] = useState(1);
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [preview, setPreview] = useState<PreviewDto | null>(null);
  const [onlyThis, setOnlyThis] = useState(false);
  const save = useGuardedSave(profile, onToken, onError);

  useEffect(() => {
    if (!temp) return;
    let live = true;
    Promise.all([api.temps(), special ? api.temp(special) : Promise.resolve(null)])
      .then(([list, one]) => { if (live) { setTemps(list); setOpened(one); } })
      .catch((e: unknown) => live && onError(e));
    return () => { live = false; };
  }, [api, temp, special, onError]);

  useEffect(() => {
    if (drafts || !data || !temps || (special && !opened)) return;
    let ds: Draft[];
    let d: Dates = { sd: '', ed: '', name: '' };
    if (!temp) ds = data.templates.length ? data.templates.map(toDraft) : [blankDraft(1)];
    else if (opened) { ds = opened.templates.map(toDraft); d = { sd: opened.startDate, ed: opened.endDate, name: opened.name }; }
    else { ds = [{ ...blankDraft(1), startTime: '10:00', endTime: '14:00', lessonMinutes: 60, priceText: '80' }]; d = { sd: addDays(today, 1), ed: addDays(today, 5), name: '' }; }
    setDrafts(ds);
    setDates(d);
    setSnapshot({ drafts: ds, dates: d });
    setActive(ds[0].seq);
  }, [data, temps, opened, drafts, temp, special, today]);

  const templates = useMemo(() => (drafts ?? []).map(toTemplate), [drafts]);
  const cols = useMemo(() => (temp ? datesBetween(dates.sd, dates.ed, MAX_SPECIAL_DAYS) : []), [temp, dates.sd, dates.ed]);
  const errs = useMemo(() => (temp
    ? [...tempProblems('SPECIAL', dates.name, dates.sd, dates.ed, (temps ?? []).map(summary), today, special ?? null, opened?.startDate ?? null), ...specialProblems(templates)]
    : problems(templates)), [temp, dates, temps, today, special, opened, templates]);

  const update = useCallback((seq: number, change: (d: Draft) => Draft) => {
    setDrafts((ds) => ds && ds.map((d) => (d.seq === seq ? change(d) : d)));
  }, []);

  if (!data || !drafts) return <Loading />;

  const asTemp = (): TempDto => ({ tempId: special ?? null, kind: 'SPECIAL', name: dates.name, startDate: dates.sd, endDate: dates.ed,
    templates: templates.map((t) => ({ ...t, days: [] })) });
  const review = () => {
    setStep('review');
    setPreview(null);
    save.setErrors([]);
    window.scrollTo(0, 0);
    (temp ? api.previewTemp(asTemp()) : api.previewWeekly(templates.map((t) => ({ ...t }))))
      .then(setPreview)
      .catch((e: unknown) => (e instanceof ApiError && e.status === 400 ? save.setErrors(e.message.split('\n')) : onError(e)));
  };
  const accept = () => {
    const since = Date.now();
    void save.run(api, async (withApi) => {
      if (temp) await withApi.saveTemp(asTemp());
      else await withApi.saveSchedule(data.scheduleVersion, templates.map((t) => ({ ...t })));
      onSaved({ lessons: preview ? touched(preview) : 0, families: preview?.families ?? 0, since });
    });
  };

  if (step === 'review') {
    const what = temp
      ? `${dates.name.trim() || 'Special schedule'} · ${dateRange(dates.sd, dates.ed)} · weekly schedule resumes after ${shortDate(dates.ed)}`
      : 'Weekly schedule · repeats every week until you change it';
    return (
      <>
        <ChangeReview what={what} preview={preview} noticeHours={profile.requiredNoticeHours} errors={save.errors} busy={save.busy}
          onBack={() => { save.setErrors([]); setStep('edit'); }} onAccept={accept} />
        {save.dialog}
      </>
    );
  }

  const current = drafts.find((d) => d.seq === active) ?? drafts[0];
  const cur = toTemplate(current);
  const addBlock = () => {
    const seq = nextSeq(templates);
    setDrafts([...drafts, blankDraft(seq)]);
    setActive(seq);
  };
  const deleteBlock = (seq: number) => {
    if (drafts.length < 2) return;
    const rest = drafts.filter((d) => d.seq !== seq);
    setDrafts(rest);
    if (active === seq) setActive(rest[0].seq);
  };
  const undo = () => {
    setDrafts(snapshot.drafts);
    setDates(snapshot.dates);
    setActive(snapshot.drafts[0].seq);
  };
  /** {@code key}: the weekday ("1") on the weekly schedule, the date on a special schedule. */
  const toggleSlot = (seq: number, key: string, t: string) => {
    update(seq, (d) => {
      const list = d.off[key] ?? [];
      const off = { ...d.off, [key]: list.includes(t) ? list.filter((x) => x !== t) : [...list, t] };
      return { ...d, off, lessonMinutes: d.lessonMinutes ?? 30 }; // S6: no length yet means 30
    });
    setActive(seq);
  };
  const perCol = temp
    ? cols.map((iso) => templates.reduce((m, t) => { const n = lessonsOn(forDate(t, iso), dayOfWeek(iso)); return [m[0] + n, m[1] + n * (t.priceMinor ?? 0)]; }, [0, 0]))
    : [0, 1, 2, 3, 4, 5, 6].map((day) => templates.reduce((m, t) => { const n = lessonsOn(t, day); return [m[0] + n, m[1] + n * (t.priceMinor ?? 0)]; }, [0, 0]));
  const total = perCol.reduce((n, c) => n + c[0], 0);
  const cash = perCol.reduce((n, c) => n + c[1], 0);
  const priceUnreadable = parseMoney(current.priceText) === undefined;
  const odd = oddCentsWarning(cur.priceMinor, cur.maxSkaters);
  const idx = drafts.indexOf(current) + 1;
  const savedPrice = (temp ? opened?.templates : data.templates)?.find((t) => t.seq === current.seq)?.priceMinor;
  const okTitle = temp ? `${plural(cols.length, 'date')} · ${plural(total, 'lesson')}` : `No clashes · ${plural(total, 'lesson')} a week`;
  const dayFor = (d: Draft, iso: string): Draft => { const dow = dayOfWeek(iso); return { ...d, days: [dow], off: { [String(dow)]: d.off[iso] ?? [] } }; };

  return (
    <>
      <div className="phead">
        <div className="phead__text">
          <div className="crumb"><a className="link crumbbtn" href="#/schedule"><Icon name="arrowL" size={14} /> Your schedule</a></div>
          <h1 className="h1">{temp ? dates.name.trim() || (special ? 'Special schedule' : 'New special schedule') : 'Your teaching week'}</h1>
          <p className="lede">{temp ? 'Replaces your weekly schedule on these dates only.' : 'Repeats every week — no dates, just the shape of your week.'}</p>
        </div>
        {temp ? <div className="phead__actions"><Badge tone="neutral" icon="spark">Special schedule</Badge></div>
          : data.exists && <div className="phead__actions"><Badge tone="success" icon="refresh">Live</Badge></div>}
      </div>

      <div className="bgrid">
        <div className="stack">
          {temp && (
            <Card title="Which dates" sub="Applies to every date in the range. Can’t overlap another one.">
              <div className="grid2">
                <div className="field"><label className="label" htmlFor="t-sd">Start date</label>
                  <input id="t-sd" type="date" className="ctl" value={dates.sd} onChange={(e) => setDates({ ...dates, sd: e.target.value })} /></div>
                <div className="field"><label className="label" htmlFor="t-ed">End date</label>
                  <input id="t-ed" type="date" className="ctl" value={dates.ed} onChange={(e) => setDates({ ...dates, ed: e.target.value })} /></div>
              </div>
              <div className="field"><label className="label" htmlFor="t-name">Name <span className="label__opt">Optional</span></label>
                <input id="t-name" className="ctl" maxLength={MAX_NAME} value={dates.name} placeholder="e.g. Fall clinic" onChange={(e) => setDates({ ...dates, name: e.target.value })} /></div>
            </Card>
          )}
          <Card title="Blocks" sub="Each block has one lesson length, price and ice type.">
            {drafts.map((d) => {
              const t = toTemplate(d), on = d.seq === current.seq;
              const times = d.startTime ? `${formatShort(d.startTime)}–${formatShort(d.endTime ?? '19:00')}` : 'No times yet';
              return (
                <div key={d.seq} className={`block${on ? ' is-editing' : ''}`}>
                  <span className={`block__bar${on ? '' : ' block__bar--other'}`} />
                  <button type="button" className="block__text" onClick={() => setActive(d.seq)} aria-pressed={on}>
                    <span className="block__name">{label(t)} {on && <span className="badge badge--primary">Editing</span>}</span>
                    <span className="block__meta">
                      {temp ? 'Every date' : dayList(d) || 'No days yet'} · {times} · {d.lessonMinutes ? `${d.lessonMinutes} min` : 'No length yet'} · {t.priceMinor != null ? formatMoney(t.priceMinor) : 'No price yet'} · {skatersText(d.maxSkaters)} · {iceShort(d.iceType) ?? 'No ice type yet'}
                    </span>
                  </button>
                  {drafts.length > 1 && (
                    <button type="button" className="iconbtn iconbtn--sm" onClick={() => deleteBlock(d.seq)} aria-label={`Delete ${label(t)}`}>
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>
              );
            })}
            <button type="button" className="addrow" onClick={addBlock}><Icon name="plus" />Add a block with a different length or price</button>
          </Card>

          <section className="card">
            <header className="card__head">
              <div><h2 className="h2">Edit {label(cur)}</h2></div>
              <span className="muted-sm">{idx} of {drafts.length}</span>
            </header>
            <div className="card__body">
              <div className="field">
                <label className="label" htmlFor="b-name">Name <span className="label__opt">Optional</span></label>
                <input id="b-name" className="ctl" maxLength={MAX_NAME} value={current.name} placeholder={`Block ${current.seq}`}
                  onChange={(e) => update(current.seq, (d) => ({ ...d, name: e.target.value }))} />
              </div>
              <div className="grid2">
                <TimeSelect id="b-sod" text="Starts" value={current.startTime} onChange={(v) => update(current.seq, (d) => ({ ...d, startTime: v, off: {} }))} />
                <TimeSelect id="b-eod" text="Ends" value={current.endTime} onChange={(v) => update(current.seq, (d) => ({ ...d, endTime: v }))} />
              </div>
              <div className="grid2">
                <div className="field">
                  <label className="label" htmlFor="b-len">Lesson length</label>
                  <select id="b-len" className="ctl" value={current.lessonMinutes ?? ''}
                    onChange={(e) => update(current.seq, (d) => ({ ...d, lessonMinutes: e.target.value ? Number(e.target.value) : null, off: {} }))}>
                    {current.lessonMinutes == null && <option value="">Pick a length</option>}
                    {LESSON_LENGTHS.map((l) => <option key={l} value={l}>{l} minutes</option>)}
                  </select>
                </div>
                <div className={`field${priceUnreadable ? ' field--error' : ''}`}>
                  <label className="label" htmlFor="b-cost">Price per lesson</label>
                  <div className="ctl ctl--money"><span>$</span>
                    <input id="b-cost" inputMode="decimal" value={current.priceText} placeholder="50"
                      aria-invalid={priceUnreadable || undefined} aria-describedby="b-cost-hint"
                      onChange={(e) => update(current.seq, (d) => ({ ...d, priceText: e.target.value }))} />
                    <span className="ctl__unit">{profile.currency}</span>
                  </div>
                  {priceUnreadable ? <div id="b-cost-hint" className="hint hint--error"><Icon name="alert" size={14} />Enter a price like 50 or 45.50.</div>
                    : savedPrice != null && cur.priceMinor != null && savedPrice !== cur.priceMinor
                      && <div id="b-cost-hint" className="hint">Was {formatMoney(savedPrice)}. You’ll see affected lessons before saving.</div>}
                </div>
              </div>
              {odd && <Banner tone="warning">{odd}</Banner>}
              <div className="field">
                <label className="label" htmlFor="b-max">Skaters per lesson</label>
                <select id="b-max" className="ctl" value={current.maxSkaters ?? 1}
                  onChange={(e) => update(current.seq, (d) => ({ ...d, maxSkaters: Number(e.target.value) }))}>
                  {Array.from({ length: MAX_SKATERS }, (_, k) => k + 1).map((n) => (
                    <option key={n} value={n}>{n === 1 ? '1 — private lesson' : `${n} — can be shared`}</option>
                  ))}
                </select>
                <div className="hint">Families don’t see this. On times in a block that allows 2, they see a “share this lesson” box.</div>
              </div>
              <div className="field">
                <label className="label" htmlFor="b-rink">Rink</label>
                <input id="b-rink" className="ctl ctl--locked" value={RINK} readOnly />
                <div className="hint"><Icon name="lock" size={12} />Choosing a rink comes in Phase 2.</div>
              </div>
              <div className={`field${current.iceType ? '' : ' field--error'}`}>
                <label className="label" htmlFor="b-ice">Ice type</label>
                <select id="b-ice" className={`ctl${current.iceType ? '' : ' is-error'}`} value={current.iceType ?? ''}
                  onChange={(e) => update(current.seq, (d) => ({ ...d, iceType: e.target.value || null }))}>
                  {!current.iceType && <option value="" disabled>Pick an ice type</option>}
                  {ICE_TYPES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <div className="hint">Families don’t see this. The rink fee depends on it. BladeBook keeps the list for each rink.</div>
              </div>
              {!temp && (
                <div className="fieldset">
                  <div className="label" id="days-l">Days</div>
                  <div className="days" role="group" aria-labelledby="days-l">
                    {DAYS.map((name, i) => {
                      const on = current.days.includes(i);
                      const other = drafts.some((x) => x.seq !== current.seq && x.days.includes(i));
                      return (
                        <button key={name} type="button" className={`day${on ? ' is-on' : ''}${other ? ' has-other' : ''}`} aria-pressed={on} aria-label={name}
                          onClick={() => update(current.seq, (d) => ({ ...d, days: on ? d.days.filter((x) => x !== i) : [...d.days, i].sort() }))}>
                          {name[0]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="hint">A dot means another block already runs that day.</div>
                </div>
              )}
              {errs.length
                ? <Banner tone="danger" title="Fix this before you can review">{errs.map((m) => <div key={m}>{m}</div>)}</Banner>
                : <Banner tone="success" title={okTitle}>You’ll see any booked lessons this affects before saving.</Banner>}
            </div>
          </section>
        </div>

        <Card title={temp ? 'These dates' : 'Every week, all blocks together'} sub={temp ? 'Columns are real dates.' : 'Columns are weekdays. This shape repeats every week.'}>
          <div className="wkbar">
            <div className="seg" role="group" aria-label="Preview">
              {(['All blocks', 'This block only'] as const).map((m, i) => (
                <button key={m} type="button" className={`seg__opt${onlyThis === (i === 1) ? ' is-on' : ''}`} aria-pressed={onlyThis === (i === 1)} onClick={() => setOnlyThis(i === 1)}>{m}</button>
              ))}
            </div>
            <div className="legend">
              <span className="legend__item"><i className="sw sw--sel" />Editing</span>
              <span className="legend__item"><i className="sw sw--open" />Other blocks</span>
              <span className="legend__item"><i className="sw sw--offd" />Switched off</span>
            </div>
          </div>
          <div className="wk-scroll"><div className="wk">
            {temp
              ? cols.map((iso, i) => (
                <WeekColumn key={iso} name={`${DAYS[dayOfWeek(iso)]} ${Number(iso.slice(8))}`} head={<>{DAYS[dayOfWeek(iso)]} <b>{Number(iso.slice(8))}</b></>}
                  day={dayOfWeek(iso)} drafts={(onlyThis ? [current] : drafts).map((d) => dayFor(d, iso))} totals={perCol[i]!}
                  activeSeq={current.seq} onToggle={(seq, _day, t) => toggleSlot(seq, iso, t)} />
              ))
              : DAYS.map((name, day) => (
                <WeekColumn key={name} name={name} day={day} drafts={onlyThis ? [current] : drafts} totals={perCol[day]!}
                  activeSeq={current.seq} onToggle={(seq, d, t) => toggleSlot(seq, String(d), t)} />
              ))}
          </div></div>
          <div className="wktotal"><span>Tap a time to switch it off. An off time is your break.</span><b className="num">{plural(total, 'lesson')} {temp ? 'over these dates' : 'a week'} · {formatMoney(cash)}</b></div>
        </Card>
      </div>

      <div className="stickybar">
        <Button variant="secondary" icon="undo" onClick={undo}>Undo edits</Button>
        <span className="stickybar__note">Nothing is saved until you review and accept.</span>
        <Button lg iconRight="arrowR" disabled={errs.length > 0} onClick={review}>Review changes</Button>
      </div>
    </>
  );
}

/** Always holds a time: there's no blank choice, so what the coach sees is what's sent. */
function TimeSelect({ id, text, value, onChange }: {
  id: string; text: string; value: string | null; onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{text}</label>
      <select id={id} className="ctl" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {QUARTER_HOURS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
      </select>
    </div>
  );
}

function WeekColumn({ name, head, day, drafts, totals, activeSeq, onToggle }: {
  name: string; head?: ReactNode; day: number; drafts: Draft[]; totals: number[]; activeSeq: number; onToggle: (seq: number, day: number, t: string) => void;
}) {
  const runs = drafts.filter((d) => d.days.includes(day) && d.startTime).sort((a, b) => toMinutes(a.startTime!) - toMinutes(b.startTime!));
  const [n, cash] = totals as [number, number];
  if (!runs.length) {
    return <div className="wk__col wk__col--off"><div className="wk__dow">{head ?? name}</div><div className="wk__none"><Icon name="ban" /><span>No lessons</span></div></div>;
  }
  return (
    <div className="wk__col">
      <div className="wk__dow">{head ?? name}</div>
      {runs.map((d, k) => {
        const t = toTemplate(d);
        const end = d.endTime ?? '19:00';
        const prev = runs[k - 1];
        const prevEnd = prev ? prev.endTime ?? '19:00' : null;
        const act = d.seq === activeSeq;
        return (
          <div key={d.seq} style={{ display: 'contents' }}>
            {prevEnd && toMinutes(d.startTime!) > toMinutes(prevEnd) && <span className="wk__break">Break {formatShort(prevEnd)}–{formatShort(d.startTime!)}</span>}
            <div className={`wk__tag${act ? ' wk__tag--edit' : ''}`}>{d.lessonMinutes ?? 30} min · {t.priceMinor != null ? formatMoney(t.priceMinor) : '—'}</div>
            {slots(d.startTime, end, d.lessonMinutes).map((s) => {
              const off = isOff(t, day, s);
              return (
                <button key={s} type="button" className={`wslot${off ? ' wslot--off' : act ? ' wslot--edit' : ''}${(d.lessonMinutes ?? 30) >= 60 ? ' wslot--60' : ''}`}
                  aria-pressed={!off} aria-label={`${name} ${formatTime(s)} ${off ? 'switched off' : 'on'}`} onClick={() => onToggle(d.seq, day, s)}>
                  {formatClock(s)}
                </button>
              );
            })}
          </div>
        );
      })}
      <div className="wk__foot num">{n} · {formatMoney(cash)}</div>
    </div>
  );
}

