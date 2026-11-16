# Spec: End-of-day report (Phase 2)

**Status:** Draft — 2026-11-16
**Sources:** ADR-014 decision 7, Consequences, Revisit if, amendment 2026-11-11; ADR-010 decisions 1, 2,
2a and amendment 2026-11-11; ADR-001 (amendment 2026-11-11; `sched-daily-report` role); ADR-017
(reports bucket); ADR-012 decision 5; ADR-023 (amendments 2026-10-13, 2026-10-15); ADR-031 decision 7;
ADR-MASTER §2, §13, §14, §24; `docs/architecture.md` §6.4, §7 ("Least privilege", "Data protection"),
§8, §9, event catalog (`DailyReportDue`), §10 Phase 2+; `FeatureDecriptions/Email templates Needed:`
("Daily report"); `FeatureDecriptions/C_Coach Email Templates.md`; design
`design/harbor/coach/screens-money-profile.js` (`report`); `docs/glossary.md` (**PENDING**)
**Depends on:** Minimum Viable Product (MVP) attendance (check-in and no-show, including the rinkside page's offline queue and
replay); GSI2 (by date); the reports bucket (already built in MVP for the cancellation archive)
**Out of scope:** the coach analytics dashboard that reads the archived reports (Phase 2+, separate);
the morning email (MVP) and its switch (see `morning-email-switch.md`); the weekly unpaid reminder (MVP)

## Summary
Every evening at about 9:00 PM a scheduled job, `sched-daily-report`, sends each coach an email splitting
the day's lessons into checked in, no-show and pending (no outcome recorded), naming each pending skater
and lesson and saying what to do. It archives the same report as `report.json` in the private reports
bucket. It writes nothing to the table, and it is a snapshot of what the server knew at 9:00 PM. It is
the coach's nightly prompt for a phone that never reconnected and for a lesson nobody recorded.

## Assumed in every example
- Coach Dana Whitfield, time zone America/New_York, login email dana.whitfield@gmail.com, business
  email lessons@danawhitfieldskating.com.
- The target date is Wednesday 2027-01-13. Coach Dana's lessons that day, at Pelham Civic Center:
  - 6:00 AM, shared: Sam R. and Leo M., both `CHECKED_IN`
  - 6:30 AM: Mia C., `CHECKED_IN`
  - 8:30 AM: Owen B., `NO_SHOW`
  - 10:00 AM: Leo M., still `BOOKED` (no outcome recorded)
- Scheduled jobs run on one Scheduler rule in the launch time zone, America/New_York.

## 1. The nightly report

**1.1 The report splits the day into three buckets**
- **Given** the seats above on `GSI2PK = DATE#2027-01-13`
- **When** the ~9:00 PM Scheduler rule fires `DailyReportDue` carrying the target date 2027-01-13
- **Then** `sched-daily-report` reads the day's `BOOKED`, `CHECKED_IN` and `NO_SHOW` seats from GSI2
- **And** places Sam R., Leo M. (6:00 AM), Mia C. and their lessons under checked in, Owen B. under
  no-show, and Leo M. (10:00 AM) under pending
*(source: ADR-014 d7; architecture.md §6.4, §8)*

**1.2 A lesson with no recorded outcome is pending, never a no-show**
- **Given** Leo M.'s 10:00 AM seat is still `BOOKED` at 9:00 PM
- **When** the report runs for 2027-01-13
- **Then** Leo M.'s 10:00 AM lesson is listed as pending, not as a no-show
- **And** nothing is written to Leo M.'s seat: no status and no amount
*(source: ADR-014 d7 — "`PENDING` is a report bucket derived from `seatStatus`, not a stored state";
ADR-031 d7; ADR-MASTER §24 — "Writes nothing to the table")*

**1.3 The email goes to the coach's login email and names each pending lesson**
- **Given** the buckets of 1.1
- **When** the report email is sent
- **Then** it goes to dana.whitfield@gmail.com, the login email, not the business email
- **And** it lists the pending skater and lesson, Leo M. at 10:00 AM, followed by: "No attendance
  recorded. If you recorded these on the rinkside app, open it with signal to send them; otherwise
  record them on the lesson list."
*(source: `FeatureDecriptions/Email templates Needed:`, "Daily report"; ADR-014 d7; ADR-MASTER §13, "Rules for
every email"; architecture.md §9)*

**1.4 Each skater in a shared lesson is reported on their own**
- **Given** the 6:00 AM lesson is shared by Sam R. and Leo M., each with their own seat
- **When** the report runs
- **Then** Sam R. and Leo M. each appear with their own outcome
*(source: architecture.md §6.4 — "the report reads seats"; ADR-MASTER §8, "Coaches see every skater")*

**1.5 The report is archived to the reports bucket**
- **Given** the buckets of 1.1
- **When** the report runs for 2027-01-13
- **Then** a machine-readable `report.json` with the per-skater checked-in, no-show and pending breakdown
  is written to `s3://bladebook-reports/coach=<Dana's coachId>/date=2027-01-13/report.json`
- **And** the bucket is private, Block Public Access on, encrypted with SSE-KMS, TLS-only, with
  CloudTrail data events
*(source: architecture.md §6.4 "Report archival (S3)", §7 "Data protection"; ADR-017; ADR-012 d5;
ADR-MASTER §24)*

**1.6 A late replay does not change or re-send the report**
- **Given** the 9:00 PM report for 2027-01-13 listed Leo M. at 10:00 AM as pending
- **When** Coach Dana's phone regains signal at 10:00 PM and replays Leo M.'s queued check-in
- **Then** Leo M.'s seat becomes `CHECKED_IN`
- **And** the report email is not re-sent and `report.json` is not rewritten
*(source: ADR-014 d7, "The report stays a snapshot"; architecture.md §6.4)*

**1.7 A failed run is re-run for its own date**
- **Given** the 2027-01-13 run failed and its message is in the job's dead-letter queue (DLQ)
- **When** the operator runs `redrive-dlq --function sched-daily-report` on Thursday 2027-01-14
- **Then** the report is produced for 2027-01-13, not for 2027-01-14
- **And** writing `report.json` again to the same `(coach, date)` key is harmless
*(source: ADR-010 d2, d2a — "Re-run for that date"; ADR-MASTER §14, "Each Scheduler trigger carries the
date it is for")*

**1.8 A failure doesn't page**
- **Given** the 2027-01-13 report did not send
- **When** the alarms are evaluated
- **Then** no page goes to the owner; it is a morning-dashboard read, with a tolerance of a day
*(source: ADR-010 d1, "End-of-day report (9pm) … A day … No"; ADR-010 d2a)*

**1.9 The coach can switch it off on the email templates page**
- **Given** the Phase 2 email templates page lists "Daily report — Every evening at 9 PM" under emails
  the coach gets
- **When** Coach Dana turns its switch off
- **Then** the preview says "Switched off. This email won't be sent."
*(source: `FeatureDecriptions/C_Coach Email Templates.md` — "Each email has an on/off switch. Emails marked
'Always sent' have no switch"; design `design/harbor/coach/screens-money-profile.js`, `report` (no `required`))*

## 2. Rules that must always hold
- Pending is the default for a seat with no recorded outcome; the report never turns missing data into a
  no-show. *(ADR-014 d7)*
- The job writes nothing to the table. *(ADR-014 d7; ADR-031 d7)*
- The report is a snapshot of what the server knew at 9:00 PM, never regenerated after a replay.
  *(ADR-014 d7)*
- It goes to the coach's `loginEmail`, never `businessEmail`. *(ADR-MASTER §13)*
- The job's trigger carries its target date; it never reads the clock for it. *(ADR-010 d2a; ADR-MASTER §14)*
- `sched-daily-report` is its own function with its own role: `GetItem` and `Query` on GSI2,
  `ses:SendEmail`, and `s3:PutObject` only on `coach=*/date=*/` in the reports bucket. *(ADR-001 role
  table; architecture.md §7 "Least privilege"; ADR-MASTER §24)*
- Only `BOOKED`, `CHECKED_IN` and `NO_SHOW` seats are read; cancelled lessons are not on GSI2.
  *(ADR-MASTER §14; architecture.md §6.4)*

## Open questions
1. **The guard against a second email.** ADR-010 d2 marks it "To build": the S3 key is idempotent, the
   email is not. What field, keyed on (coach, date), stops a retry sending twice (like the morning email's
   `morningEmailSentOn`)?
2. **A coach with no lessons that day**: no email (like the morning email), or a "nothing today" report?
   Is `report.json` still written?
3. **What switching it off stops.** The email only, or the archive too? The analytics dashboard depends on
   the archive (architecture.md §10).
4. **Subject line and layout.** The Harbor sample uses "Today: 5 lessons, 4 checked in, 1 not recorded" and
   labels the bucket "Not recorded", while the decided wording says "pending students" and "No attendance
   recorded". Which label does the email use? The glossary's **PENDING** shows as *Not recorded* elsewhere.
5. **Retention of the reports.** The bucket has "versioning + a retention lifecycle policy" (architecture.md
   §7); the window is for the legal review (ADR-MASTER §20, §25). Some of the data is about minors.
6. **Lessons in a time zone other than the launch one.** Phase 2 lists multi-timezone scheduling separately;
   until then one 9:00 PM rule in the launch time zone (ADR-001 decision 4).
7. **Its event name and function count.** `DailyReportDue` is in the event catalog; the seventeenth
   function, its role row and its use of GSI2 return with it (ADR-MASTER §24).
8. **Does the archive answer "storing daily schedules in long-term storage"?** Open-Pending §12.
9. **Staleness after a replay.** If it draws complaints, regenerate on a late arrival (ADR-014 Revisit if).
