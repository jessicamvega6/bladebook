/* BladeBook client website — Harbor. A family books lessons with their coach.
   One source for the interactive demo and the static page designs (PRESETS), built by ../build-app.mjs.
   Uses ../library.js (component vocabulary) and ../shared.js (sample data, controls, runtime).
   Screen groups live in screens-*.js and register into SCREENS, ACTIONS, MODALS, PRESETS.

   Sample families (the same world as the coach demo: Coach Dana Whitfield, Wed Oct 14, 2026, 8:15 AM):
     - Grace Chen, guardian of Mia and Noah — approved (ACTIVE). The default.
     - Sarah Park, guardian of Ava and Jack — waiting for approval (PENDING). A pending family sees only
       their own account: no schedule, no open times, no coach contact details (ADR-022 d6).
     - Tom Okafor, guardian of Zoe — invited by Grace to share Mia's Friday lesson; Zoe waits for Coach Dana (ADR-026 d5).
   Many coaches per skater (ADR-025): Grace's Mia and Noah also skate with Coach Ben Ortiz (power skating), and Noah is
   waiting for Coach Lauren Hayes. Those coaches exist only in the family demo; Coach Dana is the shared sample coach. */

const APP_TITLE = 'Grace Chen · BladeBook family demo';
const FAMILIES = {
  grace: { client: 'Grace Chen', rel: 'Guardian', email: 'grace.chen@example.com', phone: '(205) 555-0110', sms: true, kids: ['s1', 's2'] },
  sarah: { client: 'Sarah Park', rel: 'Guardian', email: 'sarah.park@example.com', phone: '(205) 555-0196', sms: true, kids: ['p1', 'p2'] },
  /* Tom Okafor's Zoe skates with another coach. Grace invited Zoe to share Mia's Friday lesson; Tom confirmed, so Zoe waits
     for Coach Dana's approval like any sign-up (ADR-026 d5). */
  tom: { client: 'Tom Okafor', rel: 'Guardian', email: 'tom.okafor@example.com', phone: '(205) 555-0153', sms: true, kids: ['p4'] },
};

/* ---------- other coaches (ADR-025) ----------
   Coach Dana is state.profile, shared with the coach and rinkside demos. Every other coach a family has lives here, with
   their own schedule, prices and notice period. A lesson with no `coach` is Dana's. A skater's status with Dana is
   `status`; with anyone else it's `links[coachId]` (ACTIVE or PENDING), approved by that coach alone (ADR-025 d2). */
const DANA = 'dana';
function freshCoaches() {
  return {
    ben: { id: 'ben', first: 'Ben', last: 'Ortiz', code: 'BENO-4R8T', sport: 'Power skating', phone: '(205) 555-0177', businessEmail: 'ben@ortizpower.com', showPhone: false, showEmail: true, notice: 48, currency: 'USD',
      blocks: [{ name: 'Early edges', days: [3], sod: 450, eod: 570, len: 60, price: 70 }, { name: 'Power skating', days: [2, 4], sod: 930, eod: 1110, len: 45, price: 65 }],
      specials: [{ name: 'Seminar', kind: 'timeoff', sd: '2026-10-29', ed: '2026-10-29' }] },
    lauren: { id: 'lauren', first: 'Lauren', last: 'Hayes', code: 'LAUR-3J9W', sport: 'Hockey skating skills', notice: 24, currency: 'USD', blocks: [], specials: [] },
  };
}
/** Coach codes the add-a-coach lookup finds besides the family's own coaches. */
const COACH_DIRECTORY = [{ id: 'marcus', first: 'Marcus', last: 'Lee', code: 'MARC-6P2D', sport: 'Figure skating', notice: 24, currency: 'USD', blocks: [], specials: [] }];
/* Coach Ben's lessons: Mia's Tuesdays at 4:15, Noah's one-off Wednesday Nov 4 at 8:30 (the clash on Owen's invitation),
   and other families' lessons that make some of Ben's times taken. [studentId, weekday, start, first, last]. */
function benLessons() {
  const out = [], c = freshCoaches().ben; let n = 0;
  const rec = [['s1', 2, 975, '2026-10-06', '2026-12-15'], ['s3', 2, 930, '2026-09-01', '2026-12-15'], ['s6', 4, 1020, '2026-09-01', '2026-12-17'], ['s3', 4, 930, '2026-10-01', '2026-12-17']];
  const add = (sid, iso, t, recurring) => { const b = c.blocks.find(x => x.days.includes(dowOf(iso)) && t >= x.sod && t + x.len <= x.eod);
    const l = { id: 'ben' + (++n), coach: 'ben', sid, iso, t, len: b.len, price: b.price, status: 'BOOKED', pay: 'UNPAID', recurring };
    if (isPast(l)) { l.status = 'CHECKED_IN'; l.pay = 'PAID'; }
    out.push(l); };
  for (let iso = '2026-09-01'; iso <= '2026-12-31'; iso = addDays(iso, 1)) {
    if (c.specials.some(s => iso >= s.sd && iso <= s.ed)) continue;
    for (const [sid, dow, t, a, b] of rec) if (dowOf(iso) === dow && iso >= a && iso <= b) add(sid, iso, t, true);
  }
  add('s2', '2026-11-04', 510, false);
  return out;
}

function freshState(who = 'grace') {
  const students = freshStudents();
  const f = FAMILIES[who];
  // Mia and Noah are approved with Coach Ben too; Noah is waiting for Coach Lauren.
  Object.assign(students.find(s => s.id === 's1'), { links: { ben: 'ACTIVE' } });
  Object.assign(students.find(s => s.id === 's2'), { links: { ben: 'ACTIVE', lauren: 'PENDING' } });
  const lessons = [...freshLessons(students), ...benLessons()].sort((a, b) => (a.iso + String(a.t).padStart(4, '0')).localeCompare(b.iso + String(b.t).padStart(4, '0')));
  return {
    screen: 'home', authed: true, modal: null, flash: '', who,
    students, lessons, profile: freshProfile(), invites: freshInvites(),   // profile = Coach Dana's profile
    coaches: freshCoaches(),                                               // the family's other coaches (ADR-025)
    me: { name: f.client, rel: f.rel, email: f.email, phone: f.phone, sms: f.sms },
    ui: {},          // per-screen UI state; each screen group owns its own keys
    auth: { email: f.email },
  };
}
let state = freshState();

/* ---------- lookups for the signed-in family ---------- */
const myKids = () => state.students.filter(s => s.client === state.me.name);
/** Skaters approved by at least one coach. */
const myActiveKids = () => myKids().filter(k => myCoachIds().some(cid => linkOf(k, cid) === 'ACTIVE'));
/* ADR-022 d6 with ADR-025 d3: a family no coach has approved yet sees only their own account. A family approved by one
   coach and waiting for another sees the whole site; the waiting coach's times, contact details and booking stay hidden. */
const isPendingFamily = () => myActiveKids().length === 0;
const myLessons = () => state.lessons.filter(l => l.sid && myKids().some(k => k.id === l.sid));
const coachName = () => `${state.profile.first} ${state.profile.last}`;
const coachFirst = () => state.profile.first;
const firstName = n => n.split(' ')[0];

/* ---------- coaches (ADR-025: each request is about one coach, d3) ---------- */
const lcoach = l => l.coach || DANA;
const coachById = cid => cid === DANA ? { id: DANA, ...state.profile } : state.coaches[cid] || freshCoaches()[cid] || COACH_DIRECTORY.find(c => c.id === cid);
const cName = c => `${c.first} ${c.last}`;
/** A skater's status with one coach: ACTIVE, PENDING, or undefined when they aren't that coach's student. */
const linkOf = (k, cid) => cid === DANA ? (k.status === 'ACTIVE' || k.status === 'PENDING' ? k.status : undefined) : (k.links || {})[cid];
/** Coaches with at least one of the family's skaters waiting for them, and which skaters: [{ cid, c, kids }]. */
const waitingByCoach = () => myCoachIds().map(cid => ({ cid, c: coachById(cid), kids: myKids().filter(k => linkOf(k, cid) === 'PENDING') })).filter(w => w.kids.length);
/** "Coach Dana", "Coach Dana or Coach Ben", "Coach Dana, Coach Ben or Coach Lauren". */
const coachOr = (cids, word = 'or') => { const n = cids.map(id => `Coach ${esc(coachById(id).first)}`); return n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} ${word} ${n[n.length - 1]}`; };
/** A shared-lesson invitation's coach: the coach of the lesson being shared (Coach Dana in the shared sample data). */
const invCoach = inv => coachById(inv.coach || DANA);
/** Every coach a coach code can find in the demo: Coach Dana, the family's coaches and the directory. */
const allCoaches = () => { const seen = {}; for (const c of [coachById(DANA), ...Object.values(freshCoaches()), ...Object.values(state.coaches), ...COACH_DIRECTORY]) seen[c.id] = seen[c.id] || c; return Object.values(seen); };
const findCoach = code => { const raw = String(code || '').replace(/[^a-z0-9]/gi, '').toUpperCase(); return raw.length < 8 ? null : allCoaches().find(c => c.code.replace(/[^A-Z0-9]/g, '') === raw) || false; };
/** Every coach any of the family's skaters is with or waiting for, Coach Dana first. */
const myCoachIds = () => [DANA, ...Object.keys(state.coaches)].filter(cid => myKids().some(k => linkOf(k, cid)));
const multiCoach = () => myCoachIds().length > 1;
/** A lesson's coach, labelled only when the family has more than one. */
const coachTag = l => multiCoach() ? ` · Coach ${esc(coachById(lcoach(l)).first)}` : '';
const specialFor = (cid, iso) => cid === DANA ? specialOn(iso) : coachById(cid).specials.find(s => iso >= s.sd && iso <= s.ed);
/** Every slot a coach's schedule produces on a date. Coach Dana's comes from the shared sample schedule. */
function slotsFor(cid, iso) {
  if (cid === DANA) return slotsOn(iso);
  const c = coachById(cid), out = [];
  if (specialFor(cid, iso)) return out;
  for (const b of c.blocks.filter(b => b.days.includes(dowOf(iso)))) for (let t = b.sod; t + b.len <= b.eod; t += b.len) out.push({ t, len: b.len, price: b.price, block: b.name, maxSkaters: 1 });
  return out;
}
/** One coach's lessons on a date. Another coach's lessons never make a time taken. */
const lessonsFor = (cid, iso) => state.lessons.filter(l => l.iso === iso && lcoach(l) === cid);
/** Open times on a date with one coach: slots the schedule produces, not taken by anyone (booked or held), not started. */
function openSlotsFor(cid, iso) {
  const taken = new Set(lessonsFor(cid, iso).map(l => l.t));
  return slotsFor(cid, iso).filter(s => !taken.has(s.t) && !(iso < TODAY || (iso === TODAY && s.t <= NOW_MIN)));
}
/** A family's own lesson with a coach at a date and time, if any. */
const myLessonAt = (cid, iso, t) => myLessons().find(l => lcoach(l) === cid && l.iso === iso && l.t === t);
/** Every skater pays the schedule's price. Personal prices are Phase 2 (owner, 2026-10-13). */
const priceAt = (cid, sid, slot) => slot.price;
/** The price this family pays for a lesson: the whole price, or their share of a shared lesson (owner, 2026-10-13). */
const myPrice = l => myKids().some(k => k.id === l.sid) ? l.price : ((l.with || []).find(w => myKids().some(k => k.id === w.sid)) || {}).price;

/* ---------- shared-lesson invitations (ADR-026 d5, d5a) ---------- */
/** The booking family's lessons an invitation covers: one lesson, or every lesson in the series. */
const invLessons = inv => state.lessons.filter(l => l.sid === inv.fromSkater && l.t === inv.t && (inv.series ? dowOf(l.iso) === inv.dow && l.iso >= inv.first && l.iso <= inv.last : l.iso === inv.iso));
const invWhen = inv => inv.series ? `${DOW_LONG[inv.dow]}s at ${fmtT(inv.t)}` : `${dDow(inv.iso)} at ${fmtT(inv.t)}`;
const invDates = inv => { const ls = invLessons(inv); return inv.series && ls.length ? `${dShort(ls[0].iso)} – ${dShort(ls[ls.length - 1].iso)} · ${plural(ls.length, 'lesson')}` : ''; };
/** The red home banner shows from the warning time until the coach acts or the lesson starts (ADR-026 d5a). The nightly
    sweep sends the warning early, so a warning already sent (warnedAt) shows the banner too. */
const invWarned = inv => inviteWarned(inv) || (inv.status === 'AWAITING_COACH' && !!inv.warnedAt && !!inv.iso && !isStarted({ iso: inv.iso, t: inv.t }));
/** Invitations for this family's skaters (Family B), and invitations this family sent (Family A). */
const invsToMe = () => state.invites.filter(i => myKids().some(k => k.id === i.skater));
const invsFromMe = () => state.invites.filter(i => i.from === state.me.name);
const invLink = (id, label, v = 'primary') => `<a class="btn btn--${v} btn--sm" href="${href('invite')}"${actAttr('invOpen', [id])}><span>${label}</span></a>`;

/* ---------- shells ---------- */
const NAV_ACTIVE = [['Home', 'home'], ['Book a lesson', 'book'], ['My bookings', 'bookings'], ['Profile', 'profile']];
const NAV_PENDING = [['Home', 'home'], ['Profile', 'profile']];
const CLIENT_SECTION = s => ({
  home: 'Home', book: 'Book a lesson', 'book-times': 'Book a lesson', 'book-result': 'Book a lesson',
  bookings: 'My bookings', recurrence: 'My bookings', payments: 'My bookings',
  profile: 'Profile', invite: 'Home',
}[s] || 'Home');

function shell(body, o = {}) {
  const cur = CLIENT_SECTION(state.screen);
  const nav = isPendingFamily() ? NAV_PENDING : NAV_ACTIVE;
  const items = nav.map(([l, s]) => `<a class="nav__item${l === cur ? ' is-active' : ''}" href="${href(s)}"${l === cur ? ' aria-current="page"' : ''}><span>${l}</span></a>`).join('');
  return `<div class="app app--family">
    <header class="nav"><a class="brand" href="${href('home')}"><span class="brand__mark">${ic('logo', 18)}</span><span class="brand__name">BladeBook</span></a>
      <nav class="nav__items" aria-label="Main">${items}</nav>
      <a class="nav__user" href="${href('profile')}"><span class="avatar avatar--sm">${initials(state.me.name)}</span><span class="nav__user-text"><b>${esc(state.me.name)}</b><small>${state.me.rel === 'Self' ? 'Skater' : state.me.rel} · ${multiCoach() ? plural(myCoachIds().length, 'coach', 'coaches') : `Coach ${esc(coachFirst())}`}</small></span></a></header>
    <main class="main"><div class="page page--${o.width || 'narrow'}">${state.flash ? banner('success', state.flash) : ''}${body}</div></main></div>`;
}
/** Signed-out frame for families: brand bar, optional family sign-up stepper, centred card, optional aside. */
function authShell(main, aside = '', o = {}) {
  return `<div class="app app--wizard">
    <header class="wbar"><span class="brand"><span class="brand__mark">${ic('logo', 18)}</span><span class="brand__name">BladeBook</span></span><span class="wbar__ctx">${o.ctx || 'For families'}</span><span class="wbar__right">${o.right ?? `New here? <a class="link" href="${href('signup')}">Sign up with a coach code</a>`}</span></header>
    <main class="wmain">${o.steps != null ? stepper(FAM_STEPS, o.steps) : ''}<div class="wgrid${aside ? '' : ' wgrid--solo'}"><div class="wcol">${main}</div>${aside}</div></main></div>`;
}

/* ---------- demo controls (in the demo bar) ---------- */
Object.assign(ACTIONS, {
  /** Switch which family is signed in: 'grace' (approved), 'sarah' (waiting for approval) or 'tom' (invited to share). */
  asFamily(who) { state = freshState(who); state.screen = 'home'; },
});
