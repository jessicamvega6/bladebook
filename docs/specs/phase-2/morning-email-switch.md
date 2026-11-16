# Spec: Switch to turn off the coach's morning email (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-023 (amendments 2026-10-13 and 2026-10-15); ADR-010 decision 3; ADR-MASTER §13 ("Per
message"), §14, §24; `docs/architecture.md` §6.2, §8, §10 Phase 2+; `FeatureDecriptions/Email templates
Needed:` ("Morning email"); `FeatureDecriptions/C_Coach Email Templates.md`; `FeatureDecriptions/Coach
Dashboard on website.md` ("Email template list page"); design
`design/harbor/coach/static/email-templates-morning.html` and `design/harbor/coach/screens-money-profile.js`
**Depends on:** the Minimum Viable Product (MVP) morning email, sent by `sched-day-reminder` at ~7:00 AM, guarded by
`morningEmailSentOn`; the Phase 2 email templates page
**Out of scope:** the family day-of reminder and its own switch; the rinkside link on the Today page (MVP);
the end-of-day report (see `end-of-day-report.md`)

## Summary
In MVP every coach with lessons gets a morning email at about 7:00 AM: the rinkside link first, then the
day's lessons. It has no off switch. In Phase 2 the email templates page, reached from Profile, gives
the morning email an on/off switch, so a coach who doesn't want it can stop it. The families' emails are
not affected, and the coach can still reach the rinkside page from the Today page.

## Assumed in every example
- Coach Dana Whitfield, login email dana.whitfield@gmail.com.
- Coach Dana has five lessons on Wednesday 2027-01-13, the first at 6:00 AM.
- Now is Tuesday 2027-01-12, 3:00 PM in the coach's time zone.

## 1. The switch

**1.1 The email templates page shows the morning email with a switch**
- **Given** Coach Dana's morning email switch is on
- **When** Coach Dana opens Profile, then "Email templates"
- **Then** "Morning email — Around 7 AM on days you have lessons" is listed under "Emails you get" with
  an on/off switch, shown on
- **And** selecting it previews the email: From "Dana Whitfield via BladeBook", To
  dana.whitfield@gmail.com, the "Open the rinkside app" link first, then the day's lessons
*(source: `FeatureDecriptions/C_Coach Email Templates.md`; ADR-MASTER §24; design `email-templates-morning.html`)*

**1.2 Turning the switch off**
- **Given** the morning email switch is on
- **When** Coach Dana turns it off
- **Then** the switch shows off and the preview says "Switched off. This email won't be sent."
*(source: `FeatureDecriptions/C_Coach Email Templates.md` — "A switched-off email says it won't be sent";
design `screens-money-profile.js`)*

**1.3 With the switch off, no morning email is sent**
- **Given** Coach Dana turned the switch off on Tuesday 2027-01-12
- **When** the ~7:00 AM day-of reminder job runs for Wednesday 2027-01-13
- **Then** no morning email is sent to Coach Dana
- **And** each family with a lesson that day still gets its day-of reminder
*(source: ADR-MASTER §24 — "A switch to turn off the coach's morning email"; architecture.md §10 Phase 2+;
`FeatureDecriptions/Email templates Needed:`, "Morning email")*

**1.4 With the switch on, the email is sent as in MVP**
- **Given** the switch is on
- **When** the job runs for Wednesday 2027-01-13
- **Then** Coach Dana gets one morning email at dana.whitfield@gmail.com listing her five lessons, with
  the rinkside link first
- **And** `morningEmailSentOn = 2027-01-13` is stamped on her profile, so a retry doesn't send it again
*(source: ADR-023 amendments 2026-10-13, 2026-10-15; ADR-MASTER §13; architecture.md §6.2)*

**1.5 Turning it off doesn't remove the other way to the rinkside page**
- **Given** the switch is off
- **When** Coach Dana opens the coach website's Today page on 2027-01-13
- **Then** the large rinkside link is still there
*(source: ADR-023 amendment 2026-10-13 — "The coach reaches the rinkside page two ways")*

**1.6 One coach's switch affects only that coach**
- **Given** Coach Dana's switch is off and Coach Ben Ross's is on, and both have lessons on 2027-01-13
- **When** the job runs for 2027-01-13
- **Then** Coach Ben gets his morning email and Coach Dana gets none
*(source: `FeatureDecriptions/C_Coach Email Templates.md` — the coach "chooses which ones go out")*

## 2. Rules that must always hold
- A coach with no lessons that day gets no morning email, whatever the switch says. *(ADR-MASTER §13;
  `FeatureDecriptions/Email templates Needed:`, "Morning email")*
- The morning email goes to the coach's `loginEmail`, never the business email. *(ADR-023 amendment
  2026-10-15)*
- The link in it is a plain address with no sign-in token. *(ADR-023 amendment 2026-10-13)*
- The switch never stops a family's email. *(ADR-MASTER §13: the day-of reminder and the morning email are
  separate messages)*

## Open questions
1. **Where the switch is stored**: a field on the coach profile, and its name. The data model has none yet.
2. **Turning it back on after 7:00 AM.** If Coach Dana switches it on at 9:00 AM on a lesson day, is that
   day's email sent, or does it start the next day?
3. **The page's other switches.** ADR-MASTER §24 names only the morning email's switch, but the page gives
   every email that isn't "Always sent" a switch (booking confirmation, day-of reminder, payment reminder,
   unpaid lessons, daily report). Are they part of the same Phase 2 piece, and does each work the same way?
4. **Should the page warn** that without the morning email the coach must reach rinkside from the Today
   page? Nothing says so.
5. **The starting state.** Kim asked for a "configurable daily email about lessons scheduled"
   (`docs/Talking with Kim:.md.md`); the owner made it the morning email (ADR-023, 2026-10-13). MVP sends it
   to every coach, and the design shows the switch on, but no source says a new Phase 2 coach starts with
   it on.
