------------------------------- MODULE Payment --------------------------------
(***************************************************************************)
(* One seat's payment (UNPAID, PAID with a paidAt, WAIVED) and two of the  *)
(* coach's tabs, each showing what it last loaded.  A tab marks paid       *)
(* (cash or Venmo), undoes or waives.                                      *)
(*                                                                         *)
(* "current": the server reads the status fresh and conditions the write   *)
(*   on that, so a tab's click applies to a state it never showed.         *)
(* "fixed": the click carries the status, paidAt and paidVia the tab       *)
(*   showed; the write conditions on all three, and a mismatch reloads the *)
(*   tab.  (TLC showed status + paidAt isn't enough: a PAID->PAID change   *)
(*   of method keeps paidAt.)                                              *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS Version, MaxWrites

VARIABLES pay,      \* [status, via, at]: at counts mark-paid writes (paidAt)
          shown,    \* tab -> the pay it shows
          writes,
          blind     \* a write applied to a state its tab wasn't showing

vars == <<pay, shown, writes, blind>>
Tabs == {1, 2}
Unpaid == [status |-> "UNPAID", via |-> "none", at |-> 0]

Init == /\ pay = Unpaid /\ shown = [t \in Tabs |-> Unpaid]
        /\ writes = 0 /\ blind = FALSE

Reload(t) == /\ shown' = [shown EXCEPT ![t] = pay] /\ UNCHANGED <<pay, writes, blind>>

Allowed(op, s) == CASE op = "paid"  -> s # "WAIVED"
                    [] op = "undo"  -> s = "PAID"
                    [] op = "waive" -> s = "UNPAID"

After(op, via) == CASE op = "paid"  -> [status |-> "PAID", via |-> via,
                                        at |-> IF pay.status = "PAID" THEN pay.at ELSE writes + 1]
                    [] op = "undo"  -> Unpaid
                    [] op = "waive" -> [status |-> "WAIVED", via |-> "none", at |-> 0]

\* The tab only offers what its own view allows.
Click(t, op, via) ==
    /\ writes < MaxWrites /\ Allowed(op, shown[t].status)
    /\ LET base == IF Version = "current" THEN pay ELSE shown[t]
           ok   == Allowed(op, pay.status)
                   /\ pay = base             \* status, paidAt and paidVia as shown
       IN IF ok
          THEN /\ pay' = After(op, via) /\ writes' = writes + 1
               /\ blind' = (blind \/ shown[t] # pay)
               /\ shown' = [shown EXCEPT ![t] = After(op, via)]
          ELSE /\ shown' = [shown EXCEPT ![t] = pay]     \* "changed": reload
               /\ UNCHANGED <<pay, writes, blind>>

Next == \E t \in Tabs : Reload(t) \/ \E op \in {"paid", "undo", "waive"}, via \in {"cash", "venmo"} :
            Click(t, op, via)

\* No click changes a payment its tab wasn't showing (no lost update).
NoBlindWrite == ~blind
==============================================================================
