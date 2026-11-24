------------------------------ MODULE EmailGuard ------------------------------
(***************************************************************************)
(* One email's guard on one item (a seat's confirmationSent,               *)
(* paymentReminderSent, inviteEmailSent, joinedEmailSent,                  *)
(* joinedHostEmailSent; remindedOn; settleReminderSentOn;                  *)
(* morningEmailSentOn; SEATEND emailSent; pendingLeave.emailSent).         *)
(*                                                                         *)
(* The event that asks for the email is delivered at least once, and two   *)
(* copies can run at the same time (EventBridge -> async Lambda, with      *)
(* retries).  Each run: reads the item, skips it if the guard is set,      *)
(* claims the guard with a conditional write, sends, and on a failed send  *)
(* gives the guard back.  A run can also stop part-way (a timeout) and is  *)
(* then run again.                                                         *)
(*                                                                         *)
(* Version = "current": the code as found (2026-11-21).                    *)
(*   - claim's condition is  attribute_not_exists(g) OR g <> :v  with a    *)
(*     fresh timestamp as :v, so a second claimer always succeeds;         *)
(*   - every send failure is swallowed: the guard is given back but the    *)
(*     event succeeds, so nothing ever runs it again.                      *)
(* Version = "first-fix" (2026-11-21):                                     *)
(*   - a once-only guard is claimed with  attribute_not_exists(g);         *)
(*   - a refusal (SES MessageRejected) is final (owner, 2026-11-17); any   *)
(*     other failure gives the guard back and fails the event, so the      *)
(*     at-least-once delivery runs it again.                               *)
(*   TLC: a run that stops between its claim and SES's answer leaves the   *)
(*   guard set for good, so the email is never sent.                       *)
(* Version = "fixed" (2026-11-23): as first-fix, but the claim is written  *)
(*   PENDING with its time and becomes the sent value only once SES       *)
(*   accepted.  A run that finds a fresh PENDING claim fails and is        *)
(*   retried (it waits); one left over 2 minutes (the runs time out after  *)
(*   1) is abandoned and taken again.  So a stopped run never loses the    *)
(*   email; one that stopped after SES took it can mean a second copy.     *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Version,      \* "current", "first-fix" or "fixed"
          Copies,       \* how many copies of the event are delivered at first
          MaxFailures,  \* how many transient send failures can happen in all
          MaxCrashes    \* how many runs can stop part-way in all

ASSUME Version \in {"current", "first-fix", "fixed"} /\ Copies \in Nat \ {0}

NONE == 0

VARIABLES
    guard,      \* NONE, or the run that holds it
    gstate,     \* "none" | "pending" | "sent" (only "fixed" tells pending from sent)
    abandoned,  \* the pending claim's run stopped, and 2 minutes have passed
    runs,       \* run id -> "read" | "claim" | "send" | "confirm" | "done"
    nextId,     \* the next run id (each run's claim stamp is unique)
    accepted,   \* emails SES accepted
    refused,    \* TRUE once SES refused the address for good
    failures,   \* transient failures so far
    crashes,    \* runs that stopped so far
    afterSend   \* a run stopped after SES accepted, before marking it sent

vars == <<guard, gstate, abandoned, runs, nextId, accepted, refused, failures, crashes, afterSend>>

Init ==
    /\ guard = NONE /\ gstate = "none" /\ abandoned = FALSE
    /\ runs = [r \in 1..Copies |-> "read"]
    /\ nextId = Copies + 1
    /\ accepted = 0 /\ refused = FALSE /\ failures = 0 /\ crashes = 0 /\ afterSend = FALSE

SetRun(r, s) == runs' = [runs EXCEPT ![r] = s]
\* The event fails: Lambda delivers it again as a new run.
Retry(r) == /\ runs' = [x \in DOMAIN runs \cup {nextId} |->
                          IF x = nextId THEN "read" ELSE IF x = r THEN "done" ELSE runs[x]]
            /\ nextId' = nextId + 1

\* Reads the item; a run that sees the guard set does nothing more.  "fixed" goes on
\* to the claim unless it was sent: the claim tells a run still sending from one that stopped.
Read(r) ==
    /\ runs[r] = "read"
    /\ SetRun(r, IF Version = "fixed" THEN (IF gstate = "sent" THEN "done" ELSE "claim")
                 ELSE IF guard = NONE THEN "claim" ELSE "done")
    /\ UNCHANGED <<guard, gstate, abandoned, nextId, accepted, refused, failures, crashes, afterSend>>

Claim(r) ==
    /\ runs[r] = "claim"
    /\ CASE Version = "current" ->
              IF guard # r      \* g <> :v, and :v is this run's own fresh stamp
              THEN guard' = r /\ gstate' = "pending" /\ SetRun(r, "send")
              ELSE UNCHANGED <<guard, gstate>> /\ SetRun(r, "done")
         [] Version = "first-fix" ->
              IF guard = NONE   \* attribute_not_exists(g)
              THEN guard' = r /\ gstate' = "pending" /\ SetRun(r, "send")
              ELSE UNCHANGED <<guard, gstate>> /\ SetRun(r, "done")
         [] Version = "fixed" ->
              \* a fresh PENDING claim: this run fails and is retried, so it waits
              /\ ~(gstate = "pending" /\ ~abandoned)
              /\ IF gstate = "none" \/ (gstate = "pending" /\ abandoned)
                 THEN guard' = r /\ gstate' = "pending" /\ SetRun(r, "send")
                 ELSE UNCHANGED <<guard, gstate>> /\ SetRun(r, "done")
    /\ abandoned' = FALSE
    /\ UNCHANGED <<nextId, accepted, refused, failures, crashes, afterSend>>

SendAccepted(r) ==
    /\ runs[r] = "send"
    /\ accepted' = accepted + 1
    /\ SetRun(r, IF Version = "fixed" THEN "confirm" ELSE "done")
    /\ gstate' = IF Version = "fixed" THEN gstate ELSE "sent"
    /\ UNCHANGED <<guard, abandoned, nextId, refused, failures, crashes, afterSend>>

\* fixed: the claim becomes the sent value, if it is still this run's.
Confirm(r) ==
    /\ runs[r] = "confirm"
    /\ gstate' = IF guard = r THEN "sent" ELSE gstate
    /\ SetRun(r, "done")
    /\ UNCHANGED <<guard, abandoned, nextId, accepted, refused, failures, crashes, afterSend>>

\* MessageRejected: final in every version.
SendRefused(r) ==
    /\ runs[r] = "send"
    /\ refused' = TRUE
    /\ IF Version = "current" /\ guard = r
       THEN guard' = NONE /\ gstate' = "none"
       ELSE UNCHANGED guard /\ gstate' = "sent"
    /\ SetRun(r, "done")
    /\ UNCHANGED <<abandoned, nextId, accepted, failures, crashes, afterSend>>

\* Throttling, a timeout, SES unavailable...
SendFailed(r) ==
    /\ runs[r] = "send"
    /\ failures < MaxFailures
    /\ failures' = failures + 1
    /\ IF guard = r THEN guard' = NONE /\ gstate' = "none" ELSE UNCHANGED <<guard, gstate>>   \* release: g = :v
    /\ IF Version = "current" THEN SetRun(r, "done") /\ UNCHANGED nextId ELSE Retry(r)
    /\ UNCHANGED <<abandoned, accepted, refused, crashes, afterSend>>

\* The run stops (a timeout) after claiming; its event is run again.  Its claim stays,
\* and by the time anything finds it, it is over 2 minutes old.
Stop(r) ==
    /\ runs[r] \in {"send", "confirm"}
    /\ crashes < MaxCrashes
    /\ crashes' = crashes + 1
    /\ afterSend' = (afterSend \/ runs[r] = "confirm")
    /\ abandoned' = (guard = r /\ gstate = "pending")
    /\ Retry(r)
    /\ UNCHANGED <<guard, gstate, accepted, refused, failures>>

Next == \E r \in DOMAIN runs :
    Read(r) \/ Claim(r) \/ SendAccepted(r) \/ Confirm(r) \/ SendRefused(r) \/ SendFailed(r) \/ Stop(r)

Spec == Init /\ [][Next]_vars

-------------------------------------------------------------------------------
TypeOK ==
    /\ accepted \in Nat /\ refused \in BOOLEAN /\ failures \in 0..MaxFailures /\ crashes \in 0..MaxCrashes
    /\ gstate \in {"none", "pending", "sent"}
    /\ \A r \in DOMAIN runs : runs[r] \in {"read", "claim", "send", "confirm", "done"}

\* The family gets the email at most once, unless a run stopped after SES took it.
AtMostOnce == accepted <= 1 \/ afterSend

\* Once every run has finished, the email went out, unless SES refused the
\* address for good.
Quiescent == \A r \in DOMAIN runs : runs[r] = "done"
NeverLost == Quiescent => (accepted >= 1 \/ refused)
===============================================================================
