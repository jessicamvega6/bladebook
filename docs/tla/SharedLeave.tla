------------------------------ MODULE SharedLeave ------------------------------
(***************************************************************************)
(* A shared lesson after one family left in time: the staying family must  *)
(* answer "keep or cancel" by answerBy = min(start - notice, leave + 7d).  *)
(* The hourly sweep (ShareRepository.cancelNoAnswer) cancels an unanswered *)
(* lesson with no charge.  With notice 0, answerBy is the start; check-in  *)
(* opens an hour before it; a sweep can also run late after an outage.     *)
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
