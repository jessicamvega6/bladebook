/* BladeBook client website — Harbor. A family books lessons with their coach.
   One source for the interactive demo and the static page designs (PRESETS), built by ../build-app.mjs.
   Uses ../library.js (component vocabulary) and ../shared.js (sample data, controls, runtime).
   Screen groups live in screens-*.js and register into SCREENS, ACTIONS, MODALS, PRESETS.

   Sample families (the same world as the coach demo: Coach Dana Whitfield, Wed Oct 14, 2026, 8:15 AM):
     - Grace Chen, guardian of Mia and Noah — approved (ACTIVE). The default.
     - Sarah Park, guardian of Ava and Jack — waiting for approval (PENDING). A pending family sees only
       their own account: no schedule, no open times, no coach contact details (ADR-022 d6). */

const APP_TITLE = 'Grace Chen · BladeBook family demo';
const FAMILIES = {
  grace: { client: 'Grace Chen', rel: 'Guardian', email: 'grace.chen@example.com', phone: '(205) 555-0110', sms: true, kids: ['s1', 's2'] },
  sarah: { client: 'Sarah Park', rel: 'Guardian', email: 'sarah.park@example.com', phone: '(205) 555-0196', sms: true, kids: ['p1', 'p2'] },
};

function freshState(who = 'grace') {
  const students = freshStudents();
  const f = FAMILIES[who];
  return {
    screen: 'home', authed: true, modal: null, flash: '', who,
    students, lessons: freshLessons(students), profile: freshProfile(),   // profile = the coach's profile
    me: { name: f.client, rel: f.rel, email: f.email, phone: f.phone, sms: f.sms },
    ui: {},          // per-screen UI state; each screen group owns its own keys
    auth: { email: f.email },
  };
}
let state = freshState();

/* ---------- lookups for the signed-in family ---------- */
const myKids = () => state.students.filter(s => s.client === state.me.name);
const myActiveKids = () => myKids().filter(s => s.status === 'ACTIVE');
const isPendingFamily = () => myActiveKids().length === 0;            // ADR-022 d6: no ACTIVE skater → sees only their own account
const myLessons = () => state.lessons.filter(l => l.sid && myKids().some(k => k.id === l.sid));
const coachName = () => `${state.profile.first} ${state.profile.last}`;
const coachFirst = () => state.profile.first;
const firstName = n => n.split(' ')[0];
/** Open times on a date: slots the schedule produces, not taken by anyone (booked or held), not started. */
function openSlots(iso) {
  const taken = new Set(lessonsOn(iso).map(l => l.t));
  return slotsOn(iso).filter(s => !taken.has(s.t) && !(iso < TODAY || (iso === TODAY && s.t <= NOW_MIN)));
}
/** A family's own lesson at a date and time, if any. */
const myLessonAt = (iso, t) => myLessons().find(l => l.iso === iso && l.t === t);
const priceFor = (sid, slot) => student(sid).override || slot.price;

/* ---------- shells ---------- */
const NAV_ACTIVE = [['Home', 'home'], ['Book a lesson', 'book'], ['My bookings', 'bookings'], ['Profile', 'profile']];
const NAV_PENDING = [['Home', 'home'], ['Profile', 'profile']];
const CLIENT_SECTION = s => ({
  home: 'Home', book: 'Book a lesson', 'book-times': 'Book a lesson', 'book-result': 'Book a lesson',
  bookings: 'My bookings', recurrence: 'My bookings', payments: 'My bookings',
  profile: 'Profile',
}[s] || 'Home');

function shell(body, o = {}) {
  const cur = CLIENT_SECTION(state.screen);
  const nav = isPendingFamily() ? NAV_PENDING : NAV_ACTIVE;
  const items = nav.map(([l, s]) => `<a class="nav__item${l === cur ? ' is-active' : ''}" href="${href(s)}"${l === cur ? ' aria-current="page"' : ''}><span>${l}</span></a>`).join('');
  return `<div class="app app--family">
    <header class="nav"><a class="brand" href="${href('home')}"><span class="brand__mark">${ic('logo', 18)}</span><span class="brand__name">BladeBook</span></a>
      <nav class="nav__items" aria-label="Main">${items}</nav>
      <a class="nav__user" href="${href('profile')}"><span class="avatar avatar--sm">${initials(state.me.name)}</span><span class="nav__user-text"><b>${esc(state.me.name)}</b><small>${state.me.rel === 'Self' ? 'Skater' : state.me.rel} · Coach ${esc(coachFirst())}</small></span></a></header>
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
  /** Switch which family is signed in: 'grace' (approved) or 'sarah' (waiting for approval). */
  asFamily(who) { state = freshState(who); state.screen = 'home'; },
});
