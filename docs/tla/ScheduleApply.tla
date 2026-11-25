---------------------------- MODULE ScheduleApply -----------------------------
(***************************************************************************)
(* One family's lessons through a coach's schedule saves.  A save writes   *)
(* its dates in one transaction; each date item sets off its own run of    *)
(* consumer-schedule-change, so one save starts several runs.  A run reads *)
(* what the schedule no longer makes, cancels each such lesson under a     *)
(* condition (only one run can cancel a lesson), and its batch emails the  *)
(* family once, listing the lessons that run cancelled.  A second save can *)
(* come while a run works.  A run can stop part-way (a timeout); its event *)
(* is retried under the same event id, and its half-done batch is settled  *)
(* later by the drift check, which sends its email.                        *)
(*                                                                         *)
(* "current": runs overlap, so one save's lessons can be split across two  *)
(*   batches and the family gets two emails.                               *)
(* "fixed": a run first takes the coach's lease (SCHEDULE#APPLYING): free, *)
(*   its own (a retry of the same event), or abandoned by a run that       *)
(*   stopped.  A run that finds it held sets "run again" and ends; the     *)
(*   holder, before letting go, makes another pass from a fresh read if    *)
(*   asked.  TLC: without "run again", a second save that comes while a    *)
(*   run holds the lease is never applied.  "Abandoned" stands for 6       *)
(*   minutes passing (the consumer times out after 5); a retry of the same *)
(*   event takes its own lease back at once.                               *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Version, MaxCrashes

Lessons == {1, 2, 3}
Runs == {1, 2, 3}           \* 1 and 2: the first save's two dates; 3: the second save

VARIABLES want,     \* lessons the schedule no longer makes
          booked,   \* lessons still booked
          pc, plan, mine,
          holder,   \* the lease: 0 = free, else the run (event) holding it
          abandoned,\* its holder stopped
          rerun,    \* "run again", set by a run that found the lease held
          saves, emails, crashes, crashed

vars == <<want, booked, pc, plan, mine, holder, abandoned, rerun, saves, emails, crashes, crashed>>

Init == /\ want = {1, 2} /\ booked = Lessons
        /\ pc = [r \in Runs |-> IF r = 3 THEN "idle" ELSE "start"]
        /\ plan = [r \in Runs |-> {}] /\ mine = [r \in Runs |-> {}]
        /\ holder = 0 /\ abandoned = FALSE /\ rerun = FALSE
        /\ saves = 1 /\ emails = 0 /\ crashes = 0 /\ crashed = FALSE

\* The second save drops lesson 3 and sets off run 3.
Save2 == /\ pc[3] = "idle"
         /\ want' = want \cup {3} /\ saves' = 2 /\ pc' = [pc EXCEPT ![3] = "start"]
         /\ UNCHANGED <<booked, plan, mine, holder, abandoned, rerun, emails, crashes, crashed>>

Read(r) == /\ plan' = [plan EXCEPT ![r] = want \cap booked] /\ mine' = [mine EXCEPT ![r] = {}]
           /\ pc' = [pc EXCEPT ![r] = "cancel"]

Start(r) ==
    /\ pc[r] = "start"
    /\ IF Version = "current"
       THEN Read(r) /\ UNCHANGED <<holder, abandoned, rerun>>
       ELSE IF holder \in {0, r} \/ abandoned
            THEN Read(r) /\ holder' = r /\ abandoned' = FALSE /\ UNCHANGED rerun
            ELSE /\ rerun' = TRUE /\ pc' = [pc EXCEPT ![r] = "done"]
                 /\ UNCHANGED <<plan, mine, holder, abandoned>>
    /\ UNCHANGED <<want, booked, saves, emails, crashes, crashed>>

\* A conditional cancel: only while the lesson is still booked.
Cancel(r, l) ==
    /\ pc[r] = "cancel" /\ l \in plan[r]
    /\ plan' = [plan EXCEPT ![r] = @ \ {l}]
    /\ IF l \in booked
       THEN booked' = booked \ {l} /\ mine' = [mine EXCEPT ![r] = @ \cup {l}]
       ELSE UNCHANGED <<booked, mine>>
    /\ UNCHANGED <<want, pc, holder, abandoned, rerun, saves, emails, crashes, crashed>>

\* The batch is done and emails the family; then the lease goes, or another pass if asked.
Finish(r) ==
    /\ pc[r] = "cancel" /\ plan[r] = {}
    /\ emails' = emails + (IF mine[r] # {} THEN 1 ELSE 0)
    /\ mine' = [mine EXCEPT ![r] = {}]
    /\ IF Version = "fixed" /\ rerun
       THEN rerun' = FALSE /\ pc' = [pc EXCEPT ![r] = "start"] /\ UNCHANGED holder
       ELSE /\ pc' = [pc EXCEPT ![r] = "done"]
            /\ holder' = IF holder = r THEN 0 ELSE holder
            /\ UNCHANGED rerun
    /\ UNCHANGED <<want, booked, plan, abandoned, saves, crashes, crashed>>

\* The run stops mid-pass; its event is retried.  The drift check settles its batch,
\* which then sends its email.
Crash(r) == /\ pc[r] = "cancel" /\ crashes < MaxCrashes
            /\ crashes' = crashes + 1 /\ crashed' = TRUE
            /\ emails' = emails + (IF mine[r] # {} THEN 1 ELSE 0)
            /\ abandoned' = (holder = r)
            /\ pc' = [pc EXCEPT ![r] = "start"]
            /\ plan' = [plan EXCEPT ![r] = {}] /\ mine' = [mine EXCEPT ![r] = {}]
            /\ UNCHANGED <<want, booked, holder, rerun, saves>>

Next == Save2 \/ \E r \in Runs : Start(r) \/ Finish(r) \/ Crash(r) \/ \E l \in Lessons : Cancel(r, l)

Quiescent == \A r \in Runs : pc[r] \in {"idle", "done"}
\* Once the runs are done, every lesson the schedule dropped is cancelled.
AllCancelled == Quiescent => (want \cap booked = {})
\* One email per save, unless a run stopped part-way.
OneEmailPerSave == emails <= saves \/ crashed
==============================================================================
