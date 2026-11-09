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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { signInLocally } from '../../shared/auth/localAuth';
import { Badge, Banner, Button, Card, Dialog, Icon } from '../../shared/components/harbor';
import {
  DAYS, LESSON_LENGTHS, MAX_NAME, MAX_SKATERS, QUARTER_HOURS, formatClock, formatMoney, formatShort, formatTime,
  isOff, label, lessonsOn, longDate, nextSeq, oddCentsWarning, parseMoney, problems, slots, todayIn, toMinutes,
  type Template,
} from '../../shared/logic/schedule';
import { scheduleApi, type Profile, type ScheduleApi, type ScheduleDto, type TemplateDto } from '../api';

/** Pelham Civic Center's ice types (ADR-MASTER section 6). Families never see them. */
export const ICE_TYPES = [
  { id: 'BFSC_FREESTYLE', name: 'Birmingham Figure Skating Club (BFSC) freestyle ice', short: 'BFSC freestyle' },
  { id: 'STICK_AND_PUCK', name: 'Stick and Puck (S&P) ice', short: 'S&P ice' },
  { id: 'PUBLIC', name: 'Public ice', short: 'Public ice' },
] as const;
const RINK = 'Pelham Civic Center (PCC)';

const iceShort = (id: string | null) => ICE_TYPES.find((x) => x.id === id)?.short;
const skatersText = (n: number | null) => (n && n > 1 ? `up to ${n} skaters` : '1 skater');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dayList = (t: { days: number[] }) => [...t.days].sort().map((d) => DAYS[d]).join(' · ');

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
            <span className="action-card__title">{data.exists ? 'Edit weekly schedule' : 'Build your teaching week'}</span>
            <span className="action-card__sub">Your normal week. It repeats until you change it.</span>
            <span className="action-card__meta">
              {data.exists ? `${days} · ${plural(templates.length, 'block')} · ${weekLessons(asTemplates)} lessons` : 'Start here'} <Icon name="arrowR" />
            </span>
          </a>
          <span className="action-card is-disabled" aria-disabled="true" title="Comes in a later batch">
            <span className="action-card__icon"><Icon name="calOff" size={22} /></span>
            <span className="action-card__title">Add time off or a special schedule</span>
            <span className="action-card__sub">Vacation, a tournament, a camp or holiday hours — for a set range of dates.</span>
            <span className="action-card__meta">Not available yet</span>
          </span>
        </div>
      )}
    </>
  );
}

// --------------------------------------------------------------- editor

export function WeeklyEditor({ api, profile, onSaved, onToken, onError }: {
  api: ScheduleApi; profile: Profile; onSaved: () => void; onToken: (token: string) => void; onError: (e: unknown) => void;
}) {
  const data = useSchedule(api, onError);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [snapshot, setSnapshot] = useState<Draft[]>([]);
  const [active, setActive] = useState(1);
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [onlyThis, setOnlyThis] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string[]>([]);
  const [reauth, setReauth] = useState(false);

  useEffect(() => {
    if (!data || drafts) return;
    const ds = data.templates.length ? data.templates.map(toDraft) : [blankDraft(1)];
    setDrafts(ds);
    setSnapshot(ds);
    setActive(ds[0].seq);
  }, [data, drafts]);

  const templates = useMemo(() => (drafts ?? []).map(toTemplate), [drafts]);
  const errs = useMemo(() => problems(templates), [templates]);

  const update = useCallback((seq: number, change: (d: Draft) => Draft) => {
    setDrafts((ds) => ds && ds.map((d) => (d.seq === seq ? change(d) : d)));
  }, []);

  if (!data || !drafts) return <Loading />;

  const save = async (withApi: ScheduleApi) => {
    setBusy(true);
    setSaveError([]);
    try {
      await withApi.saveSchedule(data.scheduleVersion, templates.map((t) => ({ ...t })));
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SIGN_IN_TO_SAVE') setReauth(true);
      else if (e instanceof ApiError && (e.status === 400 || e.status === 409)) setSaveError(e.message.split('\n'));
      else onError(e);
    } finally {
      setBusy(false);
    }
  };

  /** LOCAL STAND-IN for entering the password again (shortcut SC-1): a fresh stub sign-in, then the same save. */
  const signInAndSave = async () => {
    setReauth(false);
    try {
      const token = await signInLocally(profile.loginEmail);
      onToken(token);
      await save(scheduleApi(token));
    } catch (e) {
      onError(e);
    }
  };

  const reauthDialog = reauth && (
    <Dialog onClose={() => setReauth(false)} labelledBy="reauth-title">
      <h2 className="h2" id="reauth-title">Confirm it’s you</h2>
      <p className="muted">Saving your schedule needs a sign-in from the last 15 minutes. Your changes are kept.</p>
      <div className="actions">
        <Button variant="secondary" onClick={() => setReauth(false)}>Not now</Button>
        <Button onClick={signInAndSave}>Sign in again and save</Button>
      </div>
    </Dialog>
  );

  if (step === 'review') {
    return (
      <>
        <Review templates={templates} exists={data.exists} errors={saveError} onBack={() => { setSaveError([]); setStep('edit'); }} />
        <div className="stickybar">
          <Button variant="secondary" onClick={() => { setSaveError([]); setStep('edit'); }}>Back</Button>
          <span className="stickybar__note">Nothing changes until you save.</span>
          <Button lg onClick={() => save(api)} disabled={busy}>{busy ? 'Saving…' : 'Accept & save'}</Button>
        </div>
        {reauthDialog}
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
    setDrafts(snapshot);
    setActive(snapshot[0].seq);
  };
  const toggleSlot = (seq: number, day: number, t: string) => {
    update(seq, (d) => {
      const list = d.off[String(day)] ?? [];
      const off = { ...d.off, [String(day)]: list.includes(t) ? list.filter((x) => x !== t) : [...list, t] };
      return { ...d, off, lessonMinutes: d.lessonMinutes ?? 30 }; // S6: no length yet means 30
    });
    setActive(seq);
  };
  const total = weekLessons(templates);
  const cash = templates.reduce((n, t) => n + [0, 1, 2, 3, 4, 5, 6].reduce((m, d) => m + lessonsOn(t, d) * (t.priceMinor ?? 0), 0), 0);
  const priceUnreadable = parseMoney(current.priceText) === undefined;
  const odd = oddCentsWarning(cur.priceMinor, cur.maxSkaters);
  const idx = drafts.indexOf(current) + 1;

  return (
    <>
      <div className="phead">
        <div className="phead__text">
          <div className="crumb"><a className="link crumbbtn" href="#/schedule"><Icon name="arrowL" size={14} /> Your schedule</a></div>
          <h1 className="h1">Your teaching week</h1>
          <p className="lede">Repeats every week — no dates, just the shape of your week.</p>
        </div>
        {data.exists && <div className="phead__actions"><Badge tone="success" icon="refresh">Live</Badge></div>}
      </div>

      <div className="bgrid">
        <div className="stack">
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
                      {dayList(d) || 'No days yet'} · {times} · {d.lessonMinutes ? `${d.lessonMinutes} min` : 'No length yet'} · {t.priceMinor != null ? formatMoney(t.priceMinor) : 'No price yet'} · {skatersText(d.maxSkaters)} · {iceShort(d.iceType) ?? 'No ice type yet'}
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
                  {priceUnreadable && <div id="b-cost-hint" className="hint hint--error"><Icon name="alert" size={14} />Enter a price like 50 or 45.50.</div>}
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
              {errs.length
                ? <Banner tone="danger" title="Fix this before you can review">{errs.map((m) => <div key={m}>{m}</div>)}</Banner>
                : <Banner tone="success" title={`No clashes · ${plural(total, 'lesson')} a week`} />}
            </div>
          </section>
        </div>

        <Card title="Every week, all blocks together" sub="Columns are weekdays. This shape repeats every week.">
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
            {DAYS.map((name, day) => (
              <WeekColumn key={name} name={name} day={day} drafts={onlyThis ? [current] : drafts} all={templates}
                activeSeq={current.seq} onToggle={toggleSlot} />
            ))}
          </div></div>
          <div className="wktotal"><span>Tap a time to switch it off. An off time is your break.</span><b className="num">{plural(total, 'lesson')} a week · {formatMoney(cash)}</b></div>
        </Card>
      </div>

      <div className="stickybar">
        <Button variant="secondary" icon="undo" onClick={undo}>Undo edits</Button>
        <span className="stickybar__note">Nothing is saved until you review and accept.</span>
        <Button lg iconRight="arrowR" disabled={errs.length > 0} onClick={() => { setStep('review'); window.scrollTo(0, 0); }}>Review changes</Button>
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

function WeekColumn({ name, day, drafts, all, activeSeq, onToggle }: {
  name: string; day: number; drafts: Draft[]; all: Template[]; activeSeq: number; onToggle: (seq: number, day: number, t: string) => void;
}) {
  const runs = drafts.filter((d) => d.days.includes(day) && d.startTime).sort((a, b) => toMinutes(a.startTime!) - toMinutes(b.startTime!));
  const n = all.reduce((m, t) => m + lessonsOn(t, day), 0);
  const cash = all.reduce((m, t) => m + lessonsOn(t, day) * (t.priceMinor ?? 0), 0);
  if (!runs.length) {
    return <div className="wk__col wk__col--off"><div className="wk__dow">{name}</div><div className="wk__none"><Icon name="ban" /><span>No lessons</span></div></div>;
  }
  return (
    <div className="wk__col">
      <div className="wk__dow">{name}</div>
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

// ---------------------------------------------------------------- review

function Review({ templates, exists, errors, onBack }: { templates: Template[]; exists: boolean; errors: string[]; onBack: () => void }) {
  const total = weekLessons(templates);
  return (
    <>
      <div className="phead"><div className="phead__text">
        <div className="crumb"><button type="button" className="link crumbbtn" onClick={onBack}><Icon name="arrowL" size={14} /> Back to editing</button></div>
        <h1 className="h1">Review your changes</h1>
        <p className="lede">Weekly schedule · repeats every week until you change it</p>
      </div></div>
      {errors.length > 0 && <Banner tone="danger" title="This couldn’t be saved">{errors.map((m) => <div key={m}>{m}</div>)}</Banner>}
      <Card title={exists ? 'Your new week' : 'Your teaching week'} sub={`${plural(total, 'lesson')} a week. Families can book these times once you save.`} flush>
        {templates.map((t) => {
          const n = [0, 1, 2, 3, 4, 5, 6].reduce((m, d) => m + lessonsOn(t, d), 0);
          return (
            <div key={t.seq} className="row">
              <div className="row__main"><div>
                <div className="row__title">{label(t)}</div>
                <div className="row__sub">{dayList(t)} · {formatShort(t.startTime!)}–{formatShort(t.endTime ?? '19:00')} · {t.lessonMinutes} min · {formatMoney(t.priceMinor ?? 0)} · {skatersText(t.maxSkaters)} · {iceShort(t.iceType)}</div>
              </div></div>
              <div className="row__side"><span className="muted num">{plural(n, 'lesson')} a week</span></div>
            </div>
          );
        })}
      </Card>
    </>
  );
}
