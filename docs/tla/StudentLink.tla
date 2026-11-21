----------------------------- MODULE StudentLink ------------------------------
(***************************************************************************)
(* A skater and a coach: the coach's record COACH#c/STUDENT#s and the      *)
(* family's link CLIENT#f/STUDENT#c#s.  The family adds the coach (both    *)
(* written PENDING in one transaction); the coach declines (the record is  *)
(* deleted) and consumer-student-link, run at least once per stream        *)
(* record, deletes the link and emails the family.  Each add is a new      *)
(* "generation" (signedUpAt).                                              *)
(*                                                                         *)
(* "current": the consumer deletes the link unconditionally and always     *)
(*   sends the decline email.                                              *)
(* "fixed": it deletes the link only if it is the generation the declined  *)
(*   record had, and emails only when its own delete removed it.           *)
(***************************************************************************)
EXTENDS Naturals, Sequences

CONSTANTS Version, MaxAdds, MaxCopies

VARIABLES record,   \* 0 = none, else the generation
          link,     \* 0 = none, else the generation
          gen,      \* generations used so far
          events,   \* pending deliveries: generation of each declined record
          copies,   \* extra deliveries used (at-least-once)
          declined, emails

vars == <<record, link, gen, events, copies, declined, emails>>

Init == /\ record = 0 /\ link = 0 /\ gen = 0 /\ events = <<>>
        /\ copies = 0 /\ declined = 0 /\ emails = 0

AddCoach == /\ record = 0 /\ link = 0 /\ gen < MaxAdds
            /\ gen' = gen + 1 /\ record' = gen + 1 /\ link' = gen + 1
            /\ UNCHANGED <<events, copies, declined, emails>>

Decline == /\ record # 0
           /\ events' = Append(events, record) /\ record' = 0
           /\ declined' = declined + 1
           /\ UNCHANGED <<link, gen, copies, emails>>

\* EventBridge delivers the same event once more.
Duplicate == /\ Len(events) > 0 /\ copies < MaxCopies
             /\ events' = Append(events, Head(events)) /\ copies' = copies + 1
             /\ UNCHANGED <<record, link, gen, declined, emails>>

Consume(i) ==
    LET g == events[i]
        deletes == IF Version = "current" THEN link # 0 ELSE link = g
    IN /\ link' = IF deletes THEN 0 ELSE link
       /\ emails' = IF Version = "current" \/ deletes THEN emails + 1 ELSE emails
       /\ events' = [j \in 1..Len(events) - 1 |-> IF j < i THEN events[j] ELSE events[j + 1]]
       /\ UNCHANGED <<record, gen, copies, declined>>

Next == AddCoach \/ Decline \/ Duplicate \/ \E i \in 1..Len(events) : Consume(i)

Quiescent == events = <<>>
\* Once the consumers are done, a skater has a link exactly when the coach has its record.
LinkFollowsRecord == Quiescent => ((record = 0) = (link = 0))
\* One decline email per decline.
OneEmailPerDecline == emails <= declined
==============================================================================
