# BladeBook's state machines in TLA+

TLA+ (Temporal Logic of Actions) models of the state machines hidden in BladeBook's code: status fields,
email guards, queues and counters that several actors change at once (two tabs, a retried event, a
scheduled job, the stream consumers). TLC, TLA+'s model checker, tries every interleaving of the
actors and reports the first one that breaks a rule.

Each model has a `Version` constant:

- **`current`**: the code as found on 2026-11-21. TLC finds the bug and prints the interleaving that
  causes it.
- **`fixed`**: the fix made on branch `fix/state-machines-tla`. TLC checks every interleaving and finds
  no error.

Some fixes changed while being modelled: TLC found a gap in the first fix for `LessonTime`,
`Payment` and `Series`. Each model's header comment says what the simpler fix missed.

## Running them

Needs Java 17 and `tla2tools.jar` (v1.7.4, from https://github.com/tlaplus/tlaplus/releases). The jar
isn't kept in the repository.

```
TLA2TOOLS=/path/to/tla2tools.jar docs/tla/check-all.sh          # every model, one line each
TLA2TOOLS=/path/to/tla2tools.jar docs/tla/tlc.sh Series fixed   # one model, with TLC's full output
```

`check-all.sh` reads `models.txt` and prints `pass` when TLC finds what it should: the named
invariant broken for a `current` model, no error for a `fixed` one.

## The models

| Model | What it covers | Code | The bug (`current`) | The rule (`fixed` holds it) |
|---|---|---|---|---|
| `EmailGuard` | The once-only guard on a seat or invitation email, claimed before sending | `NotifyRepository.claim`, `NotificationService` | The claim's condition `g <> :v` with a fresh timestamp lets a second run claim too, so two copies of an event both send. A failed send gives the guard back but the event succeeds, so nothing sends it again | `AtMostOnce`, `NeverLost` (unless SES refused the address for good) |
| `ChangeNotifier` | One email per family per change batch | `NotificationService.stamped`, `NotifyRepository.markLines` | Sends before marking, with no claim: two runs both send, and a retry after a part-marked family resends | `OneEmailPerFamily`, `EmailSent` |
| `LessonTime` | A lesson time and its seat during a schedule change | `ScheduleChangeService`, `ChangeBatchRepository.cancel` | Deletes a checked-in seat with no record; leaves an OPEN time the schedule no longer makes when the family cancels mid-change; leaves another family booked on a dropped block, never told, when they book the freed time mid-change | `AttendanceKept`, `NoOrphanOpen`, `NoOrphanBooked` |
| `SharedLeave` | The no-answer sweep after one family leaves a shared lesson | `ShareRepository.cancelNoAnswer` | A sweep that catches up after about a day down cancels a lesson already started, deleting a checked-in seat (notice is at least 24 hours, so a sweep on time can't) | `SweepSafe` |
| `Invitation` | Answering a shared-lesson invitation from two tabs | `ShareService.answer`, `ShareRepository.decline` | Says "declined" when the other tab joined; declines after the start | `TruthfulAnswer`, `NoDeclineAfterStart` |
| `Series` | A repeating series' header and its lessons, changed from two tabs | `RecurrenceService.change`, `RecurrenceRepository.save` | Unconditional header save: an ENDED series keeps a lesson after a failed cancel; two tabs leave an ACTIVE header with no lessons | `EndedHasNoSeats`, `HeaderMatchesSeats` |
| `StudentLink` | The coach's skater record and the family's link, after a decline | `EventConsumers`, `SyncRepository.deleteLink` | A redelivered decline sends the email twice and deletes the family's newer link | `OneEmailPerDecline`, `LinkFollowsRecord` |
| `Payment` | A seat's UNPAID / PAID / WAIVED status from two tabs | `PaymentService`, `PaymentRepository.update` | The write checks a status the server read, not the one the tab showed, so a stale tab overwrites | `NoBlindWrite` |
| `RinksideQueue` | The rinkside page's offline capture queue | `web/src/rinkside/App.tsx`, `offline.ts` | A server error leaves the page "offline" for good; an old tap's answer deletes a newer re-tap | `NoTapLost`, `NotStuckOffline` |
| `WrongPasswords` | Ruling I33's three wrong passwords before a save | `web/src/coach/pages/Schedule.tsx` | A reload or another editor resets the count | `ThirdWrongSignsOut` |

The models are small on purpose: one lesson time, two tabs, two copies of an event. Each bug needs
only that many actors to show, and TLC checks every interleaving of them.
