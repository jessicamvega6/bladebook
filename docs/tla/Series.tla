-------------------------------- MODULE Series --------------------------------
(***************************************************************************)
(* A family's repeating series: its header (ACTIVE with an end, or ENDED)  *)
(* and its future seats, changed from two tabs (RecurrenceService.change). *)
(* STOP cancels every future seat and ends the series; END_EARLIER cancels *)
(* the seats after a new end.  A seat's cancel can fail (an invitee        *)
(* accepted, a stale index read).                                          *)
(*                                                                         *)
(* "current": the header is saved with an unconditional put, after the     *)
(*   cancels, even if some failed.                                         *)
(* "fixed": the tab first claims the header with a conditional write (as  *)
(*   read, and no change in progress -> "changing" = this tab), so a       *)
(*   second tab fails before it cancels anything; failed dates are         *)
(*   retried; then the new end and status are written, conditional on its *)
(*   own claim.  TLC showed both simpler fixes fail: a conditional save at *)
(*   the end is too late (the losing tab has already cancelled lessons),   *)
(*   and a bare version bump lets a tab that reads after the claim claim   *)
(*   too.                                                                  *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Version, Dates

VARIABLES header,   \* [status, end, ver]
          seats,    \* the dates still booked
          tab,      \* tab -> [pc, op, read]
          stuck     \* dates whose cancel fails once

vars == <<header, seats, tab, stuck>>
Tabs == {1, 2}
Ops == {"STOP", "END_EARLIER"}
NewEnd(op) == IF op = "STOP" THEN 0 ELSE Dates - 1

Init == /\ header = [status |-> "ACTIVE", end |-> Dates, ver |-> 0, changing |-> 0]
        /\ seats = 1..Dates
        /\ tab = [t \in Tabs |-> [pc |-> "idle", op |-> "none", read |-> header]]
        /\ stuck \in SUBSET (1..Dates)

Start(t, op) == /\ tab[t].pc = "idle" /\ header.status = "ACTIVE"
                /\ tab' = [tab EXCEPT ![t] = [pc |-> IF Version = "fixed" THEN "claim" ELSE "cancel",
                                               op |-> op, read |-> header]]
                /\ UNCHANGED <<header, seats, stuck>>

Claim(t) == /\ tab[t].pc = "claim"
            /\ IF header = tab[t].read /\ header.changing = 0
               THEN /\ header' = [header EXCEPT !.ver = @ + 1, !.changing = t]
                    /\ tab' = [tab EXCEPT ![t].pc = "cancel", ![t].read = header']
               ELSE UNCHANGED header /\ tab' = [tab EXCEPT ![t].pc = "done"]   \* "changed": reload
            /\ UNCHANGED <<seats, stuck>>

\* One pass over the dates after the new end; a stuck date fails this time.
Cancel(t) == /\ tab[t].pc = "cancel"
             /\ LET drop == {d \in seats : d > NewEnd(tab[t].op)}
                    ok   == drop \ stuck
                IN /\ seats' = seats \ ok
                   /\ stuck' = {}      \* a retry finds them free
                   /\ tab' = [tab EXCEPT ![t].pc =
                         IF Version = "fixed" /\ drop \cap stuck # {} THEN "cancel" ELSE "save"]
             /\ UNCHANGED header

Save(t) == /\ tab[t].pc = "save"
           /\ IF Version = "current" \/ header.changing = t
              THEN header' = [status |-> IF tab[t].op = "STOP" THEN "ENDED" ELSE "ACTIVE",
                              end |-> NewEnd(tab[t].op), ver |-> header.ver + 1, changing |-> 0]
              ELSE UNCHANGED header          \* "changed": the tab reloads
           /\ tab' = [tab EXCEPT ![t].pc = "done"]
           /\ UNCHANGED <<seats, stuck>>

Next == \E t \in Tabs : Claim(t) \/ Cancel(t) \/ Save(t) \/ \E op \in Ops : Start(t, op)

Settled == \A t \in Tabs : tab[t].pc \in {"idle", "done"}
\* An ENDED series has no booked lessons left.
EndedHasNoSeats == header.status = "ENDED" => seats = {}
\* The header says where the lessons stop: none booked after its end.
NoSeatAfterEnd == Settled => \A d \in seats : d <= header.end
\* Once both tabs are done, the header describes exactly the lessons booked.
HeaderMatchesSeats == Settled => seats = IF header.status = "ENDED" THEN {} ELSE 1..header.end
==============================================================================
