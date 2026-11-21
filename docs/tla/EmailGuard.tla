------------------------------ MODULE EmailGuard ------------------------------
(***************************************************************************)
(* One email's guard on one item (a seat's confirmationSent,               *)
(* paymentReminderSent, inviteEmailSent, joinedEmailSent; remindedOn;      *)
(* morningEmailSentOn; SEATEND emailSent; pendingLeave.emailSent).         *)
(*                                                                         *)
(* The event that asks for the email is delivered at least once, and two   *)
(* copies can run at the same time (EventBridge -> async Lambda, with      *)
(* retries).  Each run: reads the item, skips it if the guard is set,      *)
(* claims the guard with a conditional write, sends, and on a failed send  *)
(* gives the guard back.                                                   *)
(*                                                                         *)
(* Version = "current": the code as found (2026-11-21).                    *)
(*   - claim's condition is  attribute_not_exists(g) OR g <> :v  with a    *)
(*     fresh timestamp as :v, so a second claimer always succeeds;         *)
(*   - every send failure is swallowed: the guard is given back but the    *)
(*     event succeeds, so nothing ever runs it again.                      *)
(* Version = "fixed":                                                      *)
(*   - a once-only guard is claimed with  attribute_not_exists(g);         *)
(*   - a refusal (SES MessageRejected) is final (owner, 2026-11-17); any   *)
(*     other failure gives the guard back and fails the event, so the      *)
(*     at-least-once delivery runs it again.                               *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Version,      \* "current" or "fixed"
          Copies,       \* how many copies of the event are delivered at first
          MaxFailures   \* how many transient send failures can happen in all

ASSUME Version \in {"current", "fixed"} /\ Copies \in Nat \ {0}

NONE == 0

VARIABLES
    guard,      \* NONE, or the run that holds it
    runs,       \* run id -> "read" | "claim" | "send" | "done"
    nextId,     \* the next run id (each run's claim stamp is unique)
    accepted,   \* emails SES accepted
    refused,    \* TRUE once SES refused the address for good
    failures    \* transient failures so far

vars == <<guard, runs, nextId, accepted, refused, failures>>

Init ==
    /\ guard = NONE
    /\ runs = [r \in 1..Copies |-> "read"]
    /\ nextId = Copies + 1
    /\ accepted = 0
    /\ refused = FALSE
    /\ failures = 0

SetRun(r, s) == runs' = [runs EXCEPT ![r] = s]

\* Reads the item; a run that sees the guard set does nothing more.
Read(r) ==
    /\ runs[r] = "read"
    /\ SetRun(r, IF guard = NONE THEN "claim" ELSE "done")
    /\ UNCHANGED <<guard, nextId, accepted, refused, failures>>

ClaimSucceeds(r) ==
    IF Version = "current"
    THEN guard # r              \* g <> :v, and :v is this run's own fresh stamp
    ELSE guard = NONE           \* attribute_not_exists(g)

Claim(r) ==
    /\ runs[r] = "claim"
    /\ IF ClaimSucceeds(r)
       THEN guard' = r /\ SetRun(r, "send")
       ELSE UNCHANGED guard /\ SetRun(r, "done")
    /\ UNCHANGED <<nextId, accepted, refused, failures>>

SendAccepted(r) ==
    /\ runs[r] = "send"
    /\ accepted' = accepted + 1
    /\ SetRun(r, "done")
    /\ UNCHANGED <<guard, nextId, refused, failures>>

\* MessageRejected: final in both versions.
SendRefused(r) ==
    /\ runs[r] = "send"
    /\ refused' = TRUE
    /\ guard' = IF Version = "current" /\ guard = r THEN NONE ELSE guard
    /\ SetRun(r, "done")
    /\ UNCHANGED <<nextId, accepted, failures>>

\* Throttling, a timeout, SES unavailable...
SendFailed(r) ==
    /\ runs[r] = "send"
    /\ failures < MaxFailures
    /\ failures' = failures + 1
    /\ guard' = IF guard = r THEN NONE ELSE guard          \* release: g = :v
    /\ IF Version = "fixed"
       THEN \* the event fails; Lambda delivers it again as a new run
            /\ runs' = [x \in DOMAIN runs \cup {nextId} |->
                          IF x = nextId THEN "read" ELSE IF x = r THEN "done" ELSE runs[x]]
            /\ nextId' = nextId + 1
       ELSE SetRun(r, "done") /\ UNCHANGED nextId
    /\ UNCHANGED <<accepted, refused>>

Next == \E r \in DOMAIN runs :
    Read(r) \/ Claim(r) \/ SendAccepted(r) \/ SendRefused(r) \/ SendFailed(r)

Spec == Init /\ [][Next]_vars

-------------------------------------------------------------------------------
TypeOK ==
    /\ accepted \in Nat /\ refused \in BOOLEAN /\ failures \in 0..MaxFailures
    /\ \A r \in DOMAIN runs : runs[r] \in {"read", "claim", "send", "done"}

\* The family gets the email at most once.
AtMostOnce == accepted <= 1

\* Once every run has finished, the email went out, unless SES refused the
\* address for good.
Quiescent == \A r \in DOMAIN runs : runs[r] = "done"
NeverLost == Quiescent => (accepted = 1 \/ refused)
===============================================================================
