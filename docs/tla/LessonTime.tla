------------------------------ MODULE LessonTime ------------------------------
(***************************************************************************)
(* One lesson time T and its one seat, while the coach saves a schedule    *)
(* that no longer makes T (consumer-schedule-change), the family can       *)
(* cancel, the coach can check the skater in from an hour before the       *)
(* start, the lesson starts, and the hourly no-answer sweep can run.       *)
(*                                                                         *)
(* The schedule change (ScheduleChangeService.apply) runs in steps:        *)
(*   remove pass:  an OPEN T the schedule no longer makes is deleted;      *)
(*   read:         T and its seat are read;                                *)
(*   cancel:       one transaction deletes T and the seat "as read".       *)
(* "current": the plan ignores the seat's status, the cancel deletes the   *)
(*   seat whatever status it was read with, and a failed cancel is just    *)
(*   skipped (BOOKING_GONE).                                               *)
(* "fixed": a T with a CHECKED_IN or NO_SHOW seat is skipped; the cancel   *)
(*   requires the seat to be BOOKED; a T the read finds OPEN, or that a    *)
(*   failed cancel's re-read finds OPEN, is removed.  (TLC found the       *)
(*   read-finds-OPEN case: the family cancels after the remove pass.)  A   *)
(*   cancel refused because another family booked the time since is       *)
(*   planned again for them, a few rounds at most (owner, 2026-11-21).     *)
(*   With MaxBooks < Rounds the fix holds; a time re-booked in every round *)
(*   is left for the nightly drift check, which pages on it.               *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS Version, Rounds, MaxBooks

VARIABLES lesson,     \* "OPEN" | "BOOKED" | "ABSENT"
          seat,       \* "none" | "BOOKED" | "CHECKED_IN"
          makes,      \* the coach's schedule still makes T
          started,    \* T's start time has passed
          sc,         \* the schedule change's step
          seen,       \* what it read: [lesson, seat]
          recorded,   \* attendance once recorded (never forgotten)
          round,      \* the schedule change's batches so far
          books       \* bookings made after the first

vars == <<lesson, seat, makes, started, sc, seen, recorded, round, books>>

Init == /\ lesson = "BOOKED" /\ seat = "BOOKED"
        /\ makes = TRUE /\ started = FALSE
        /\ sc = "idle" /\ seen = [lesson |-> "none", seat |-> "none"]
        /\ recorded = FALSE /\ round = 1 /\ books = 0

\* The coach saves a schedule without T; the stream starts the consumer.
SaveSchedule == /\ makes /\ makes' = FALSE /\ sc' = "remove"
                /\ UNCHANGED <<lesson, seat, started, seen, recorded, round, books>>

RemovePass == /\ sc = "remove"
              /\ IF lesson = "OPEN" THEN lesson' = "ABSENT" ELSE UNCHANGED lesson
              /\ sc' = "read"
              /\ UNCHANGED <<seat, makes, started, seen, recorded, round, books>>

\* fixed: a T found OPEN here (the family cancelled after the remove pass)
\* is removed as the remove pass would have.
ReadT == /\ sc = "read"
         /\ seen' = [lesson |-> lesson, seat |-> seat]
         /\ sc' = IF lesson # "BOOKED" THEN "done"
                  ELSE IF Version = "fixed" /\ seat = "CHECKED_IN" THEN "done"
                  ELSE "cancel"
         /\ lesson' = IF Version = "fixed" /\ lesson = "OPEN" THEN "ABSENT" ELSE lesson
         /\ UNCHANGED <<seat, makes, started, recorded, round, books>>

CancelCondition ==
    /\ lesson = "BOOKED" /\ ~started
    /\ seat = seen.seat                                   \* the seat as read
    /\ (Version = "fixed" => seat = "BOOKED")

Cancel == /\ sc = "cancel"
          /\ IF CancelCondition
             THEN lesson' = "ABSENT" /\ seat' = "none" /\ sc' = "done"
             ELSE UNCHANGED <<lesson, seat>> /\ sc' = IF Version = "fixed" THEN "reread" ELSE "done"
          /\ UNCHANGED <<makes, started, seen, recorded, round, books>>

\* fixed only: after a failed cancel, read again. An OPEN T the schedule
\* doesn't make goes; a T booked again (by another family) is planned again,
\* as a new batch, while rounds are left.
Reread == /\ sc = "reread"
          /\ IF lesson = "OPEN" /\ ~makes THEN lesson' = "ABSENT" ELSE UNCHANGED lesson
          /\ IF lesson = "BOOKED" /\ round < Rounds
             THEN sc' = "read" /\ round' = round + 1
             ELSE sc' = "done" /\ UNCHANGED round
          /\ UNCHANGED <<seat, makes, started, seen, recorded, books>>

\* The family cancels before the start: T goes back to OPEN.
FamilyCancel == /\ seat = "BOOKED" /\ lesson = "BOOKED" /\ ~started
                /\ seat' = "none" /\ lesson' = "OPEN"
                /\ UNCHANGED <<makes, started, sc, seen, recorded, round, books>>

\* Another family books the freed time before the start (it exists, OPEN).
FamilyBook == /\ lesson = "OPEN" /\ seat = "none" /\ ~started /\ books < MaxBooks
              /\ lesson' = "BOOKED" /\ seat' = "BOOKED" /\ books' = books + 1
              /\ UNCHANGED <<makes, started, sc, seen, recorded, round>>

\* Check-in is allowed from an hour before the start.
CheckIn == /\ seat = "BOOKED"
           /\ seat' = "CHECKED_IN" /\ recorded' = TRUE
           /\ UNCHANGED <<lesson, makes, started, sc, seen, round, books>>

Start == /\ ~started /\ started' = TRUE
         /\ UNCHANGED <<lesson, seat, makes, sc, seen, recorded, round, books>>

Next == SaveSchedule \/ RemovePass \/ ReadT \/ Cancel \/ Reread
        \/ FamilyCancel \/ FamilyBook \/ CheckIn \/ Start

\* Attendance, once recorded, is never deleted.
AttendanceKept == recorded => seat = "CHECKED_IN"

\* After the schedule change, no OPEN lesson time is left that the schedule
\* doesn't make (families could book it).
NoOrphanOpen == (sc = "done" /\ ~makes) => lesson # "OPEN"

\* After the schedule change, no family is left booked on a time the schedule
\* doesn't make (never cancelled, never told), unless someone is checked in,
\* or the lesson started first.
NoOrphanBooked == (sc = "done" /\ ~makes /\ ~started /\ lesson = "BOOKED") => seat = "CHECKED_IN"
==============================================================================
