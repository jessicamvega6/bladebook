------------------------------ MODULE SharedLeave ------------------------------
(***************************************************************************)
(* A shared lesson after one family left in time: the staying family must  *)
(* answer "keep or cancel" by answerBy = min(start - notice, leave + 7d).  *)
(* The hourly sweep (ShareRepository.cancelNoAnswer) cancels an unanswered *)
(* lesson with no charge.  Notice is at least 24 hours (owner, 2026-11-23),*)
(* so answerBy is a day before the lesson and check-in opens an hour       *)
(* before it.  The model squeezes that day into one step: "deadline" then  *)
(* "started" stands for a sweep that fails for about a day (a bad deploy,  *)
(* a permissions error, an outage) and then catches up on everything       *)
(* overdue, including a lesson that has started or is checked in.         *)
(*                                                                         *)
(* "current": the sweep's condition is leaveId and answerBy <= now; the    *)
(*   seat is deleted with the status it was read with.                     *)
(* "fixed": it also needs startsAtUtc > now and the seat BOOKED.           *)
(***************************************************************************)
CONSTANT Version

VARIABLES now,       \* "before" answerBy, "deadline" (answerBy = start), "started"
          seat,      \* "BOOKED" | "CHECKED_IN" | "none"
          pending,   \* the leave is unanswered
          sweepRead, \* what the sweep read, or "none"
          bad        \* "none" | "cancelledAfterStart" | "attendanceDeleted"

vars == <<now, seat, pending, sweepRead, bad>>

Init == now = "before" /\ seat = "BOOKED" /\ pending = TRUE /\ sweepRead = "none" /\ bad = "none"

Tick == /\ now' = CASE now = "before" -> "deadline" [] OTHER -> "started"
        /\ now # "started" /\ UNCHANGED <<seat, pending, sweepRead, bad>>

CheckIn == /\ seat = "BOOKED" /\ seat' = "CHECKED_IN" /\ UNCHANGED <<now, pending, sweepRead, bad>>

SweepRead == /\ pending /\ now # "before" /\ sweepRead = "none"
             /\ sweepRead' = seat /\ UNCHANGED <<now, seat, pending, bad>>

SweepWrite == /\ sweepRead # "none"
              /\ IF /\ pending /\ seat = sweepRead
                    /\ (Version = "fixed" => (now # "started" /\ seat = "BOOKED"))
                 THEN /\ seat' = "none" /\ pending' = FALSE
                      /\ bad' = CASE seat = "CHECKED_IN" -> "attendanceDeleted"
                                   [] now = "started"     -> "cancelledAfterStart"
                                   [] OTHER               -> bad
                 ELSE UNCHANGED <<seat, pending, bad>>
              /\ sweepRead' = "none" /\ UNCHANGED now

Next == Tick \/ CheckIn \/ SweepRead \/ SweepWrite

\* No lesson is cancelled once it has started, and no attendance is deleted.
SweepSafe == bad = "none"
=============================================================================
