---------------------------- MODULE ChangeNotifier ----------------------------
(***************************************************************************)
(* consumer-change-notifier: one email per family per change batch         *)
(* (ADR-MASTER s13).  A family's lines (CANCELLED#, REPRICED#) carry       *)
(* notificationStatus.  The event (the batch header becoming EXECUTED) is  *)
(* delivered at least once; copies can run at the same time.               *)
(*                                                                         *)
(* "current": a run reads the lines, skips the family if every line is     *)
(* SENT, sends, then marks the lines one at a time (no claim first).  A    *)
(* failure while marking fails the event and Lambda runs it again.         *)
(* "fixed": a run first claims the family's lead line                      *)
(* (attribute_not_exists -> PENDING); only the claimer sends, then marks   *)
(* every line SENT.  A failed send gives the claim back and fails the      *)
(* event.                                                                  *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS Version, Copies, Lines, MaxCrashes

VARIABLES status,    \* line -> "none" | "PENDING" | "SENT"
          runs,      \* run -> [pc, marked]
          nextId, emails, crashes

vars == <<status, runs, nextId, emails, crashes>>
Lead == 1

Init == /\ status = [l \in 1..Lines |-> "none"]
        /\ runs = [r \in 1..Copies |-> [pc |-> "read", marked |-> 0]]
        /\ nextId = Copies + 1 /\ emails = 0 /\ crashes = 0

Set(r, f) == runs' = [runs EXCEPT ![r] = f]
AllSent == \A l \in 1..Lines : status[l] = "SENT"

Read(r) == /\ runs[r].pc = "read"
           /\ IF Version = "current"
              THEN Set(r, [runs[r] EXCEPT !.pc = IF AllSent THEN "done" ELSE "send"])
              ELSE Set(r, [runs[r] EXCEPT !.pc = "claim"])
           /\ UNCHANGED <<status, nextId, emails, crashes>>

Claim(r) == /\ runs[r].pc = "claim"
            /\ IF status[Lead] = "none"
               THEN status' = [status EXCEPT ![Lead] = "PENDING"] /\ Set(r, [runs[r] EXCEPT !.pc = "send"])
               ELSE UNCHANGED status /\ Set(r, [runs[r] EXCEPT !.pc = "done"])
            /\ UNCHANGED <<nextId, emails, crashes>>

Send(r) == /\ runs[r].pc = "send"
           /\ emails' = emails + 1
           /\ Set(r, [runs[r] EXCEPT !.pc = "mark"])
           /\ UNCHANGED <<status, nextId, crashes>>

Mark(r) == /\ runs[r].pc = "mark"
           /\ IF runs[r].marked < Lines
              THEN /\ status' = [status EXCEPT ![runs[r].marked + 1] = "SENT"]
                   /\ Set(r, [runs[r] EXCEPT !.marked = @ + 1])
              ELSE UNCHANGED status /\ Set(r, [runs[r] EXCEPT !.pc = "done"])
           /\ UNCHANGED <<nextId, emails, crashes>>

\* A DynamoDB error or a timeout part-way through marking: the event fails
\* and is delivered again.
CrashWhileMarking(r) ==
    /\ runs[r].pc = "mark" /\ crashes < MaxCrashes
    /\ crashes' = crashes + 1
    /\ runs' = [x \in DOMAIN runs \cup {nextId} |->
                  IF x = nextId THEN [pc |-> "read", marked |-> 0]
                  ELSE IF x = r THEN [runs[r] EXCEPT !.pc = "done"] ELSE runs[x]]
    /\ nextId' = nextId + 1
    /\ UNCHANGED <<status, emails>>

Next == \E r \in DOMAIN runs : Read(r) \/ Claim(r) \/ Send(r) \/ Mark(r) \/ CrashWhileMarking(r)

OneEmailPerFamily == emails <= 1
Quiescent == \A r \in DOMAIN runs : runs[r].pc = "done"
EmailSent == Quiescent => emails = 1
==============================================================================
