----------------------------- MODULE StudentLink ------------------------------
(***************************************************************************)
(* A skater and a coach: the coach's record COACH#c/STUDENT#s and the      *)
(* family's link CLIENT#f/STUDENT#c#s.  The family adds the coach (both    *)
(* written PENDING in one transaction); the coach declines (the record is  *)
(* deleted) and consumer-student-link, run at least once per stream        *)
(* record, deletes the link and emails the family.  Each add is a new      *)
(* "generation" (signedUpAt).  A send SES doesn't accept fails the run,    *)
(* which is retried from the start; a run can also stop part-way (a       *)
(* Lambda timeout) and be retried.                                         *)
(*                                                                         *)
(* "current": the consumer deletes the link unconditionally and always     *)
(*   sends the decline email.                                              *)
(* "first-fix": it deletes the link only if it is the generation the       *)
(*   declined record had, and emails only when its own delete removed it.  *)
(*   TLC: a send that fails is retried, but the retry finds the link gone  *)
(*   and sends nothing, so the email is lost.                              *)
(* "fixed": the link is the email's guard and is deleted last.  The run    *)
(*   claims the email on the link (declineEmail = SENDING, only on the     *)
(*   declined generation and only if unclaimed), sends, gives the claim    *)
(*   back if the send fails, and then deletes the link.  A run that finds  *)
(*   a claim in progress fails and is retried (it waits); a claim older    *)
(*   than any run can last is abandoned, and a run that finds one only     *)
(*   deletes.  Lost only if a run stops between its claim and SES's        *)
(*   answer, as for every guard (ADR-MASTER section 19).                   *)
(*   TLC: deleting when another copy holds the claim (rather than waiting) *)
(*   loses the email when that copy's send then fails.                     *)
(***************************************************************************)
EXTENDS Naturals, Sequences

CONSTANTS Version, MaxAdds, MaxCopies, MaxFailures, MaxCrashes

VARIABLES record,   \* 0 = none, else the generation
          link,     \* 0 = none, else the generation
          claimed,  \* the link's declineEmail: "none", "sending", "abandoned"
          gen,      \* generations used so far
          events,   \* pending runs: [g |-> generation declined, pc |-> step]
          copies, failures, crashes,
          midSend,  \* a run stopped between its claim and SES's answer
          declined, emails

vars == <<record, link, claimed, gen, events, copies, failures, crashes, midSend, declined, emails>>

Init == /\ record = 0 /\ link = 0 /\ claimed = "none" /\ gen = 0 /\ events = <<>>
        /\ copies = 0 /\ failures = 0 /\ crashes = 0 /\ midSend = FALSE
        /\ declined = 0 /\ emails = 0

Drop(i) == [j \in 1..Len(events) - 1 |-> IF j < i THEN events[j] ELSE events[j + 1]]
Goto(i, pc) == [events EXCEPT ![i].pc = pc]

AddCoach == /\ record = 0 /\ link = 0 /\ gen < MaxAdds
            /\ gen' = gen + 1 /\ record' = gen + 1 /\ link' = gen + 1
            /\ UNCHANGED <<claimed, events, copies, failures, crashes, midSend, declined, emails>>

Decline == /\ record # 0
           /\ events' = Append(events, [g |-> record, pc |-> "start"]) /\ record' = 0
           /\ declined' = declined + 1
           /\ UNCHANGED <<link, claimed, gen, copies, failures, crashes, midSend, emails>>

\* EventBridge delivers the same event once more.
Duplicate == /\ Len(events) > 0 /\ copies < MaxCopies
             /\ events' = Append(events, [g |-> Head(events).g, pc |-> "start"]) /\ copies' = copies + 1
             /\ UNCHANGED <<record, link, claimed, gen, failures, crashes, midSend, declined, emails>>

\* current and first-fix: delete, then perhaps send.  fixed: claim.
Start(i) ==
    LET g == events[i].g IN
    /\ events[i].pc = "start"
    /\ CASE Version = "current" ->
              /\ link' = 0 /\ events' = Goto(i, "send") /\ UNCHANGED claimed
         [] Version = "first-fix" ->
              /\ link' = IF link = g THEN 0 ELSE link
              /\ events' = IF link = g THEN Goto(i, "send") ELSE Drop(i)
              /\ UNCHANGED claimed
         [] Version = "fixed" ->
              /\ claimed # "sending"                 \* in progress: fail and retry later
              /\ CASE link # g            -> events' = Drop(i) /\ UNCHANGED claimed
                   [] claimed = "none"     -> events' = Goto(i, "send") /\ claimed' = "sending"
                   [] claimed = "abandoned" -> events' = Goto(i, "delete") /\ UNCHANGED claimed
              /\ UNCHANGED link
    /\ UNCHANGED <<record, gen, copies, failures, crashes, midSend, declined, emails>>

Sent(i) == /\ events[i].pc = "send"
           /\ emails' = emails + 1
           /\ events' = IF Version = "fixed" THEN Goto(i, "delete") ELSE Drop(i)
           /\ UNCHANGED <<record, link, claimed, gen, copies, failures, crashes, midSend, declined>>

\* SES didn't accept it: the claim is given back and the run fails, to be retried.
SendFailed(i) == /\ events[i].pc = "send" /\ failures < MaxFailures
                 /\ failures' = failures + 1
                 /\ claimed' = IF Version = "fixed" THEN "none" ELSE claimed
                 /\ events' = Goto(i, "start")
                 /\ UNCHANGED <<record, link, gen, copies, crashes, midSend, declined, emails>>

\* fixed: the link goes last, only if it is still the declined generation.
Delete(i) == /\ events[i].pc = "delete"
             /\ IF link = events[i].g THEN link' = 0 /\ claimed' = "none" ELSE UNCHANGED <<link, claimed>>
             /\ events' = Drop(i)
             /\ UNCHANGED <<record, gen, copies, failures, crashes, midSend, declined, emails>>

\* The run stops part-way (a timeout) and is retried from the start.  Its claim,
\* if it held one, is abandoned by the time anything finds it (2 minutes > the
\* 1-minute timeout).
Crash(i) == /\ events[i].pc # "start" /\ crashes < MaxCrashes
            /\ crashes' = crashes + 1
            /\ midSend' = (midSend \/ events[i].pc = "send")
            /\ claimed' = IF claimed = "sending" /\ link = events[i].g THEN "abandoned" ELSE claimed
            /\ events' = Goto(i, "start")
            /\ UNCHANGED <<record, link, gen, copies, failures, declined, emails>>

Next == AddCoach \/ Decline \/ Duplicate
        \/ \E i \in 1..Len(events) : Start(i) \/ Sent(i) \/ SendFailed(i) \/ Delete(i) \/ Crash(i)

Quiescent == events = <<>>
\* Once the consumers are done, a skater has a link exactly when the coach has its record.
LinkFollowsRecord == Quiescent => ((record = 0) = (link = 0))
\* One decline email per decline.
OneEmailPerDecline == emails <= declined
\* Once the consumers are done, every decline was emailed, unless a run stopped mid-send.
NeverLost == Quiescent => (emails = declined \/ midSend)
==============================================================================
