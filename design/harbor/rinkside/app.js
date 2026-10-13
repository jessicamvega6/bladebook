/* BladeBook rinkside app — Harbor. The coach's phone at the rink: today's lessons, Present / No-show,
   contact details on a tap, and cancelling lessons (FeatureDecriptions/Coach App, ADR-014, ADR-009 d5a).
   One source for the interactive demo and the static page designs (PRESETS), built by ../build-app.mjs.
   Uses ../library.js (component vocabulary) and ../shared.js (sample data, controls, runtime).

   The same world as the coach demo, but earlier in the morning: Wed Oct 14, 2026, 6:35 AM at Pelham Civic Center.
   The 6:00 lesson is shared by Sam Rivera and Leo Martin and both are recorded, Mia Chen's 6:30 is under way,
   Owen 8:30 and Leo 10:00 are to come, and 11:00 is a held slot.

   A shared lesson (ADR-026 d6) is one booking with the other skaters in l.with. Each skater is a "seat" with their
   own status, so they're recorded, queued offline and undone one at a time; cancelling cancels every seat.

   Bottom sheets (more, contact, cancel, week confirmation, sign out) live in state.sheet and are drawn inside
   the phone, because a sheet belongs to the phone's frame rather than the page. */

const APP_TITLE = 'Dana Whitfield · BladeBook rinkside demo';
const CLOCK_EARLY = 6 * 60 + 35;       // 6:35 AM — the demo's "now"
const CLOCK_LATE = 8 * 60 + 40;        // 8:40 AM — the demo-bar control that moves the morning on
const CLOCK_BEFORE = 5 * 60 + 45;      // 5:45 AM — before the first lesson, so the shared 6:00 can still be cancelled
const NO_SIGNAL_SINCE = '6:15 AM';
const FAMILY_CANCELLED_AT = '6:20 AM';

function freshState() {
  NOW_MIN = CLOCK_EARLY;
  const students = freshStudents();
  const lessons = freshLessons(students);
  resetToday(lessons);
  return {
    screen: 'today', authed: true, modal: null, flash: '',
    students, lessons, profile: freshProfile(), invites: freshInvites(), ui: {},
    auth: { email: 'dana.whitfield@gmail.com', pw: '' },
    sheet: null,
    rk: {
      online: true, loaded: true, syncedAt: fmtT(NOW_MIN - 4),
      queue: [],          // entries saved on the phone, waiting to send, one per skater: { lid, sid, outcome, at }
      unsent: [],         // entries the server rejected: { lid, name, when, outcome, at, reason }
      undo: null,         // the seat whose outcome can still be undone: 'lessonId/studentId'
      toast: '',
      serverCancel: null, // a lesson the family cancelled while the phone had no signal
      sel: {}, hold: {},  // week tab: selected lesson ids, and which are held rather than released
    },
  };
}
/** Every skater in a lesson, each with their own status: the booking itself, then anyone sharing it (ADR-026 d6). */
function seats(l) { return l.sid ? [l, ...(l.with || [])] : []; }
/** Today's lessons as of NOW_MIN: finished ones are recorded Present, the rest not yet. */
function resetToday(lessons) {
  for (const l of lessons.filter(l => l.iso === TODAY && l.sid)) seats(l).forEach((p, i) => {
    p.pay = 'UNPAID'; p.paidBy = null;
    if (l.t + l.len <= NOW_MIN) { p.status = 'CHECKED_IN'; p.at = fmtT(l.t + 2 + i); }
    else { p.status = 'BOOKED'; delete p.at; }
  });
}
let state = freshState();

/* ---------- lookups ---------- */
const rk = () => state.rk;
const lessonById = id => state.lessons.find(l => l.id === id);
const todays = () => lessonsOn(TODAY).slice().sort((a, b) => a.t - b.t);
const recordable = () => todays().filter(l => l.sid && l.status !== 'FAMILY_CANCELLED');
const isRecorded = p => p.status === 'CHECKED_IN' || p.status === 'NO_SHOW';   // a lesson, or one skater in it
const allRecorded = l => seats(l).every(isRecorded);
const isShared = l => !!(l.with && l.with.length);
const seatOf = (l, sid) => seats(l).find(p => p.sid === sid) || l;
const inProgress = l => l.iso === TODAY && l.t <= NOW_MIN && NOW_MIN < l.t + l.len;
const nextLesson = () => recordable().find(l => !allRecorded(l) && l.t + l.len > NOW_MIN);
const queued = (l, sid = l.sid) => rk().queue.some(q => q.lid === l.id && q.sid === sid);
const seatName = sid => shortName(student(sid).name);
const rkName = l => l.sid ? seats(l).map(p => seatName(p.sid)).join(' and ') : 'Held';
const clients = l => seats(l).map(p => student(p.sid).client);
const clockText = () => fmtT(NOW_MIN).replace(/ (AM|PM)$/, '');
const waitingCount = () => rk().queue.length + rk().unsent.length;

/* ---------- the phone ---------- */
const TABS = [['today', 'Today', 'list'], ['week', 'Week', 'calendar'], ['account', 'Account', 'user']];
const TAB_OF = s => ({ week: 'week', account: 'account' }[s] || 'today');

function statusPill() {
  const r = rk(), n = r.queue.length;
  if (!r.online) return `<span class="rk-pill rk-pill--warn">${ic('wifiOff', 13)}${n ? `${n} saved on phone` : 'No signal'}</span>`;
  if (r.unsent.length) return `<span class="rk-pill rk-pill--danger">${ic('alert', 13)}${plural(r.unsent.length, 'not sent')}</span>`;
  return `<span class="rk-pill rk-pill--ok">${ic('check', 13)}All saved</span>`;
}
/** The phone frame. o: { title, sub, progress: [done, total, label], wide (no tabbar) } */
function phoneShell(body, o = {}) {
  const r = rk(), tab = TAB_OF(state.screen), badge = waitingCount();
  const sheet = state.sheet && state.sheet.on === state.screen && RK_SHEETS[state.sheet.kind] ? `<div class="scrim" data-act="rkClose"></div>${RK_SHEETS[state.sheet.kind](state.sheet)}` : '';
  return `<div class="rk-stage"><div class="phone rk-phone">
    <div class="phone__status"><span class="num">${clockText()}</span><span class="phone__status-r">${r.online ? '<span class="bars"><i></i><i></i><i></i><i></i></span>' : ic('wifiOff', 14)}<span class="batt"><i></i></span></span></div>
    ${o.bare ? '' : `<header class="phone__head"><div><div class="phone__title">${o.title || 'Today'}</div><div class="phone__sub">${o.sub || `Wed, Oct 14 · ${RINK_SHORT}`}</div></div>${statusPill()}</header>`}
    ${o.progress ? `<div class="phone__progress"><div class="phone__progress-row"><span>${o.progress[0]} of ${o.progress[1]} recorded</span><span>${o.progress[2] || ''}</span></div><div class="meter"><span style="width:${o.progress[1] ? (o.progress[0] / o.progress[1]) * 100 : 0}%"></span></div></div>` : ''}
    <div class="phone__body rk-body">${r.toast ? `<div class="rk-toast" role="status">${ic('check', 16)}<span>${r.toast}</span></div>` : ''}${body}</div>
    ${o.bare ? '' : `<nav class="tabbar" aria-label="Rinkside">${TABS.map(([s, l, i]) => `<a class="tabbar__item${s === tab ? ' is-active' : ''}" href="${href(s)}"${s === tab ? ' aria-current="page"' : ''}><span class="rk-tabicon">${ic(i, 20)}${s === 'today' && badge ? `<span class="rk-badge">${badge}</span>` : ''}</span><span>${l}</span></a>`).join('')}</nav>`}
    ${sheet}
  </div></div>`;
}

/* Sheets register here (kind -> sheet => html, markup starting with <div class="sheet">). */
const RK_SHEETS = {};
const sheetOpen = (kind, extra = {}) => { state.sheet = { kind, on: state.screen, ...extra }; };

/* ---------- actions every screen uses ---------- */
/** Run before any coach action: a new action ends the undo window and clears the last toast. */
const fresh = () => { rk().undo = null; rk().toast = ''; };
Object.assign(ACTIONS, {
  rkClose() { state.sheet = null; },
  rkSignal(on) {
    const r = rk(); fresh(); state.sheet = null;
    if (!on) {
      if (!r.online) return;
      r.online = false;
      // While the phone has no signal, the Chen family cancels Mia's 6:30 lesson (before it started).
      const mia = todays().find(l => l.sid === 's1' && !allRecorded(l));
      if (mia) r.serverCancel = mia.id;
      return;
    }
    if (r.online) return;
    r.online = true; r.loaded = true;
    let sent = 0;
    for (const q of r.queue) {
      const l = lessonById(q.lid);
      const st = student(q.sid);
      if (l && r.serverCancel === l.id) {
        r.unsent.push({ lid: l.id, name: st.name, client: st.client, when: `${dDow(l.iso)} · ${fmtT(l.t)}`, outcome: q.outcome, at: q.at,
          kind: 'cancelled', reason: `${esc(st.client)} cancelled this lesson at ${FAMILY_CANCELLED_AT}. Your phone had no signal, so it didn’t know. Your ${q.outcome === 'NO_SHOW' ? 'no-show' : 'check-in'} wasn’t recorded.` });
      } else if (l) sent++;
    }
    if (r.serverCancel) { const l = lessonById(r.serverCancel); if (l) { l.status = 'FAMILY_CANCELLED'; l.cancelledAt = FAMILY_CANCELLED_AT; delete l.at; l.saved = false; } r.serverCancel = null; }
    r.queue = []; r.syncedAt = fmtT(NOW_MIN);
    r.toast = r.unsent.length ? `Back online. ${plural(sent, 'check-in')} sent, ${plural(r.unsent.length, 'couldn’t be sent', 'couldn’t be sent')}.` : `Back online. ${sent ? plural(sent, 'check-in') + ' sent.' : 'Everything is up to date.'}`;
  },
  /** Demo bar: 0 = 6:35, 1 = 8:40, 2 = 5:45. Going back before the first lesson starts the morning over. */
  rkClock(which) {
    fresh(); NOW_MIN = [CLOCK_EARLY, CLOCK_LATE, CLOCK_BEFORE][+which] || CLOCK_EARLY;
    if (NOW_MIN === CLOCK_BEFORE) { resetToday(state.lessons); rk().queue = []; }
  },
  rkNotLoaded() { state = freshState(); state.rk.online = false; state.rk.loaded = false; state.screen = 'today'; },
  rkRetry() { const r = rk(); fresh(); if (r.online) { r.loaded = true; r.toast = 'Today’s lessons loaded.'; } else r.toast = 'Still no signal. Try again near the entrance.'; },
});
