------------------------------ MODULE Invitation ------------------------------
(***************************************************************************)
(* An invited seat on a shared lesson, answered from two of the invited    *)
(* family's tabs, while the lesson's start comes and the hourly sweep can  *)
(* expire it.  Each tab reads the invited seat, then writes its answer     *)
(* (ShareService.answer -> ShareRepository.accept / decline).              *)
(*                                                                         *)
(* "current": a decline whose condition failed reports "declined" (200,    *)
(*   done = []); decline has no start-time condition.                      *)
(* "fixed": an answer that changed nothing reports GONE; decline, like     *)
(*   accept, needs startsAtUtc > now.                                      *)
(***************************************************************************)
CONSTANT Version

VARIABLES seat,      \* "INVITED" | "BOOKED" | "DECLINED" | "EXPIRED"
          started,
          tab,       \* tab -> [pc, said]: said = what the page told the family
          bad

vars == <<seat, started, tab, bad>>
Tabs == {1, 2}

Init == /\ seat = "INVITED" /\ started = FALSE /\ bad = "none"
        /\ tab = [t \in Tabs |-> [pc |-> "idle", said |-> "nothing"]]

Open(t) == /\ tab[t].pc = "idle" /\ seat = "INVITED"
           /\ tab' = [tab EXCEPT ![t].pc = "read"] /\ UNCHANGED <<seat, started, bad>>

Accept(t) == /\ tab[t].pc = "read"
             /\ IF seat = "INVITED" /\ ~started
                THEN seat' = "BOOKED" /\ tab' = [tab EXCEPT ![t] = [pc |-> "done", said |-> "joined"]]
                ELSE UNCHANGED seat /\ tab' = [tab EXCEPT ![t] = [pc |-> "done", said |-> "gone"]]
             /\ UNCHANGED <<started, bad>>

Decline(t) == /\ tab[t].pc = "read"
              /\ LET ok == seat = "INVITED" /\ (Version = "fixed" => ~started) IN
                 /\ seat' = IF ok THEN "DECLINED" ELSE seat
                 /\ tab' = [tab EXCEPT ![t] = [pc |-> "done",
                              said |-> IF ok \/ Version = "current" THEN "declined" ELSE "gone"]]
                 /\ bad' = IF ok /\ started THEN "declinedAfterStart" ELSE bad
              /\ UNCHANGED started

Start == ~started /\ started' = TRUE /\ UNCHANGED <<seat, tab, bad>>
Sweep == started /\ seat = "INVITED" /\ seat' = "EXPIRED" /\ UNCHANGED <<started, tab, bad>>

Next == Start \/ Sweep \/ \E t \in Tabs : Open(t) \/ Accept(t) \/ Decline(t)

\* The page never says "declined, nothing was booked" when the skater joined.
TruthfulAnswer == \A t \in Tabs : tab[t].said = "declined" => seat # "BOOKED"
\* An invitation still open at the start ends EXPIRED, not DECLINED.
NoDeclineAfterStart == bad = "none"
==============================================================================
