# Spec: Rink-number download (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-029 (amendment 2026-10-16, Open); ADR-012; ADR-021; ADR-MASTER §5 ("Registration
number"), §16, §18, §24; `FeatureDecriptions/Coach Dashboard on website.md` (Student List, "Rink
download", decided by the owner 2026-11-09); `docs/architecture.md` data model (`STUDENT#`) and the
"rink-number download" note; `README.md` gap G-19
**Depends on:** Minimum Viable Product (MVP) registration numbers (every skater gives one; `consumer-family-sync` copies
`skatingOrg` and `registrationNumber` to each coach's `STUDENT#` record) and the coach's Students tab
**Out of scope:** Skate Canada and Hockey Canada numbers (Phase 2, separate); checking whether a
number is valid or current (BladeBook checks shape only; a renewal reminder is Phase 3); rink
selection in the schedule builder

## Summary
Rinks require each skater's registration number; the coach passes the numbers on and the rinks
validate them. In Phase 2 the coach can download, from her Students tab, a file with each skater's
first name, last name and number. The skater's one full name is split into first and last name only
when the file is made. Because the file holds personal data about skaters, many of them minors, each
download is logged as a personal-data read.

## Assumed in every example
- Coach Dana Lee's Students tab lists two `ACTIVE` skaters:
  - Mia Rossi — `skatingOrg = USFS` (US Figure Skating), `registrationNumber = 1234567`
  - Leo Chen — `skatingOrg = LEARN_TO_SKATE_USA`, `registrationNumber = LTS20481`
- Coach Sam Ortiz has one `ACTIVE` skater, Ava Brooks, who is not with Coach Dana.
- Now is Monday 2027-01-11, 10:00 AM.

## 1. The download

**1.1 The coach downloads her skaters' numbers**
- **Given** Coach Dana's Students tab as above
- **When** Coach Dana downloads the rink-number file from her Students tab
- **Then** she receives a file with three columns, *Student First Name*, *Student Last Name* and
  *Skater Number*
- **And** it has one row for Mia (Mia, Rossi, 1234567) and one for Leo (Leo, Chen, LTS20481)
*(source: `FeatureDecriptions/Coach Dashboard on website.md`, "Rink download (owner, 2026-10-16)"
and "Decided by the owner 2026-11-09"; ADR-MASTER §5, "Coaches can download a file of Student First
Name, Student Last Name, Skater Number")*

**1.2 The name is split only in the file**
- **Given** Mia's `STUDENT#` record has `studentName = "Mia Rossi"`
- **When** Coach Dana downloads the rink-number file
- **Then** Mia's row has *Student First Name* "Mia" and *Student Last Name* "Rossi"
- **And** `studentName` on the record is still the one value "Mia Rossi"; nothing is written back
*(source: ADR-029 Open, "Decided by the owner 2026-11-09: split when the file is made. Sign-up keeps
one full-name box and one `studentName` field"; ADR-MASTER §5)*

**1.3 The download is a logged personal-data read**
- **When** Coach Dana downloads the rink-number file
- **Then** the access log records Coach Dana as actor, her role, the `studentId` of every record
  returned (Mia's and Leo's), the names of the personal-data fields returned (`studentName`,
  `registrationNumber`), the operation, the time, the request ID and the source address
- **And** it records none of the names or numbers
*(source: ADR-029 amendment 2026-10-16; ADR-012; ADR-MASTER §18, "Also logged: … the rink-number
download")*

**1.4 Only the coach's own skaters**
- **Given** Ava Brooks is Coach Sam's skater and not Coach Dana's
- **When** Coach Dana downloads the rink-number file
- **Then** the file has no row for Ava
- **And** the database refuses any read Coach Dana's session makes of Coach Sam's partition
*(source: ADR-021; ADR-MASTER §16, `coach-tenant` policy)*

**1.5 The number is the cleaned, stored form**
- **Given** the Chen family typed Leo's number as `" lts20481 "` at sign-up, and it was stored as
  `LTS20481`
- **When** Coach Dana downloads the rink-number file
- **Then** Leo's row shows `LTS20481`
*(source: ADR-MASTER §5, "trim, uppercase, match the organisation's pattern, cap the length, store the
cleaned form")*

**1.6 A family's change of number reaches the next download**
- **Given** Laura Rossi, Mia's guardian, changed Mia's number on her profile from `1234567` to `7654321`, and
  `consumer-family-sync` has copied it to Coach Dana's `STUDENT#` record for Mia
- **When** Coach Dana downloads the rink-number file
- **Then** Mia's row shows `7654321`
*(source: ADR-MASTER §5, "Stored on `SKATER#`; `consumer-family-sync` copies it to every coach's
`STUDENT#` record")*

## 2. Rules that must always hold

- **Every downloaded file is logged; the log never holds a name or number.** *(ADR-012; ADR-MASTER §18)*
- **A coach downloads only her own skaters.** *(ADR-021; ADR-MASTER §16)*
- **`studentName` stays one field.** The split happens only when the file is made.
  *(ADR-029 Open, decided 2026-11-09)*
- **Every skater has a number,** so no row is ever without one. *(ADR-MASTER §5; ADR-029 amendment
  2026-10-16, "Every skater must have one")*
- **The number is never a key and never in an index.** The download reads the coach's `STUDENT#`
  records. *(ADR-MASTER §5)*

## Open questions

1. **The file's format and name** (for example, comma-separated values (CSV), as the financial
   page's summary download is). The sources say only "a file".
2. **Which skaters are in it:** only `ACTIVE` ones, or those on *Waiting for approval* too?
3. **How a name that isn't two words is split:** one word, three or more words, hyphens, particles
   such as "de la". The decision fixes only *when* the split happens.
4. **Does the file include the organization?** The Students list shows the number with its
   organization; the file's column is *Skater Number* only. And if a skater may one day hold more
   than one number, what does the file hold? (`docs/Items to ask Kim About.md` §12)
5. **Per rink:** once rink selection ships, is the file for one rink's skaters or all? (ADR-MASTER §24)
6. **Row order:** the Students tab's order (family contact's name, then skater's name), or another?
7. **Cells that a spreadsheet would read as a formula.** Names are typed by families; the sources
   don't say whether a value starting with `=`, `+`, `-` or `@` is neutralised when the file is made.
8. **Does the download need a recent sign-in?** (ADR-MASTER §25, "Whether other actions need a recent
   sign-in")
9. **How long registration numbers are kept**, for the legal review. (ADR-029 Open, "Retention")
10. **US Figure Skating and Learn to Skate USA number formats**, still to come from Kim; until then
    the shape check is loose. (ADR-029 Open; ADR-MASTER §25)
