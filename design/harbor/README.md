# Harbor

**Harbor is the BladeBook theme.** Chosen 2026-10-01 from the five directions in
`design/redesign/`. Forest, the theme every earlier screen was drawn in, now lives in
`DecidedAgainst/forest-theme/`.

Figtree, deep teal (`#0E6C68`) for every action and selection, coral (`#C2513A`) for small
moments, warm sand neutrals, pill buttons and a centred pill navigation. Light-only by design.

## Files

| Path | What it is |
|---|---|
| `harbor.css` | The whole stylesheet: Harbor tokens on `:root` (WCAG AA checked), the shared component layer, form controls and phone-width rules. Wrap a page in `<div class="bb" data-layout="top">`. Taken from the schedule demo, which carries the contrast-checked tokens. |
| `shared.js` | What the three apps share: sample data (Coach Dana Whitfield; today is Wed, Oct 14, 2026), date and money helpers, controls bound to state, the modal overlay and the browser runtime. |
| `build-app.mjs` | Builds the client website or the rinkside app: `node design/harbor/build-app.mjs client` (or `rinkside`). |
| `library.js` | The component vocabulary (`card`, `row`, `badge`, `banner`, `stat`, `monthGrid`, …) and the 41 redesigned screens, extracted unchanged from `redesign/option-5-harbor.html`. |
| `coach/` | The coach website: 53 pages, as an interactive demo and as static designs. |
| `client/` | The family website: 54 pages. |
| `rinkside/` | The rinkside check-in app: 16 phone screens. |

## Coach website — `coach/`

**Open `coach/static/index.html`** for the gallery of every page, or **`coach/demo/index.html`**
for the clickable demo. Both are generated. Edit the sources and rebuild:

```
node design/harbor/coach/build.mjs
```

| Source | Covers |
|---|---|
| `app.js`, `app.css` | Sample data (coach Dana Whitfield; today is Wed, Oct 14, 2026, 8:15 AM), the shell and navigation, interactive helpers, log in, forgot password, sign-up, and the Today dashboard |
| `screens-calendar.*` | Month, week and day views, and the cancel preview (release or hold per lesson) |
| `screens-students.*` | Student list (each skater's organization and number from sign-up, ADR-029; edit contact, remove) and the pending list (each skater's number; approve, decline) |
| `screens-money-profile.*` | Lessons (attendance corrections), Payments, Profile (five tabs) and Email templates (Phase 2) |
| `schedule.html` | The schedule section: weekly editor, time off, special schedules, review and save status. A copy of `redesign/harbor-schedule-creator-demo.html` with the shared navigation and October sample dates |
| `build.mjs` | Writes `demo/` and `static/`. Static pages are rendered from each screen file's `PRESETS` and from fixed states of `schedule.html` |

Navigation: **Today · Calendar · Schedule · Students · Lessons · Payments · Profile**.

### Pages

53 static pages. New means no design existed before; redesigned means a Forest screen existed.

| Group | Pages |
|---|---|
| Sign in | Log in, forgot password (email a code; code and new password) — new |
| Sign up | Account, verify login email, business details (different / same email), confirm business email, all set — redesigned |
| Dashboard | Today — new (the Forest "dashboard" was the schedule hub) |
| Calendar | Month — new; week — redesigned; day — new; day with a shared-lesson invitation — new; cancel preview — redesigned; cancelling a shared lesson — new; week after cancelling — new |
| Schedule | Hub, weekly editor (with skaters per lesson, rink and ice type on each block; a block with no ice type blocks review), editor with no ice type — new, editor with overlapping blocks, time off or special?, time off, time off overlap, review (schedule and time off), save status (applying, done) — redesigned; **special schedule dated form — new** |
| Students | Student list, edit contact, remove, pending list (an invited skater joins their shared lesson on approval), decline, nobody waiting, after approving an invited skater — new |
| Lessons | Pick a range, attendance corrections — redesigned |
| Payments | Pick a range, unpaid, all — redesigned; mark paid with how they paid, financial summary — new |
| Profile | Details and coach code, business email, visibility and texts — redesigned; payments, account — new |
| Phase 2 | Email templates, with the shared-lesson emails — new; personal price (moved to Phase 2, 2026-10-13) |

### What the demo does not do

- The schedule section (`schedule.html`) keeps its own sample data. A change saved there
  doesn't appear in the calendar, and the other way round.
- Sign-in, sign-up and password reset accept anything; there is no Cognito behind them.
- What removing a student means is still open (`docs/Open-Pending.md`). The remove dialog shows
  one reading: upcoming lessons are cancelled and past ones are kept.

## Client website — `client/`

`client/static/index.html` (gallery) and `client/demo/index.html` (demo). Sources: `app.js`
(families, shell), `screens-booking.*` (book, pick times, confirm and repeat, results,
My bookings, cancel, change a repeating lesson, sharing a lesson and withdrawing an invitation) and `screens-account.*`
(log in, forgot password, sign-up with a coach code, home, profile with share codes, the shared-lesson invitation page,
payments in Phase 2). Texts to families are Phase 2, so the SMS opt-ins show as Phase 2.

The demo bar switches between **Grace Chen** (approved; parent of Mia and Noah) and
**Sarah Park** (waiting for approval). A waiting family sees only Home and Profile: no
schedule, open times or coach contact details (ADR-022 d6). **Tom Okafor** is the invited family: Grace invited his
Zoe, who skates with another coach, to share Mia's Friday 8:30 lesson; Tom confirmed, so Zoe waits for Coach Dana's
approval and both homes show the red shared-lesson banner (ADR-026 d5a).

**More than one coach (ADR-025):** Grace's Mia and Noah also skate with **Coach Ben Ortiz** (power skating;
48-hour notice), and Noah is waiting for **Coach Lauren Hayes**. These coaches exist only in the family demo. The
booking pages have a Coach dropdown; picks are kept across coaches; clashes are warned about; the result has a
section per coach, including one where Coach Ben's booking didn't go through. The profile adds a coach with a code
(try `6P2D-NB4Y`), and adding a skater asks which coaches they join. Sign-up takes several coach codes
(`7K2Q-M9XT`, `4R8T-WH6C`, `3J9W-QZ7E`, `6P2D-NB4Y`). Home has one card per coach, and a family is "waiting" only
until any coach approves a skater.

The family profile has no Remove button and share codes can't be refreshed (owner, 2026-10-13). What removing a
skater means is still the open "delete a student" decision.

## Rinkside app — `rinkside/`

`rinkside/static/index.html` and `rinkside/demo/index.html`. A 390-pixel phone, centred on
wide screens and full-screen on a phone. Now is 6:35 AM at Pelham Civic Center. The demo bar
turns signal off and on, moves the clock to 5:45 or 8:40 AM, and opens the app with nothing loaded.
Today's 6:00 lesson is shared by Sam and Leo: one card, each skater with their own check-in, and cancelling it
cancels both (ADR-026 d6).
Entries made with no signal are saved on the phone and sent when signal returns; one is
rejected because the family cancelled meanwhile, and appears under "Couldn't be sent"
(ADR-014). Cancelling always confirms and asks release or hold per lesson (ADR-009 d5a).

## Rebuilding

```
node design/harbor/coach/build.mjs
node design/harbor/build-app.mjs client
node design/harbor/build-app.mjs rinkside
```
