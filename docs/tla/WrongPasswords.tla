---------------------------- MODULE WrongPasswords ----------------------------
(***************************************************************************)
(* Signing in again before a schedule save (ADR-023 d4).  Ruling I33: the  *)
(* third wrong password in a row in the box signs the coach out.  Someone  *)
(* at an unlocked computer guesses, reloads, and moves between editors     *)
(* (the sign-in survives both, in the tab's sessionStorage).               *)
(*                                                                         *)
(* "current": the count is each editor's React state, so a reload or a     *)
(*   different editor starts it at 0.                                      *)
(* "fixed": the count lives in the tab's sessionStorage with the sign-in.  *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS Version, MaxGuesses

VARIABLES signedIn, count, inRow, guesses

vars == <<signedIn, count, inRow, guesses>>

Init == signedIn = TRUE /\ count = 0 /\ inRow = 0 /\ guesses = 0

Wrong == /\ signedIn /\ guesses < MaxGuesses
         /\ guesses' = guesses + 1 /\ inRow' = inRow + 1
         /\ IF count + 1 >= 3
            THEN signedIn' = FALSE /\ count' = 0
            ELSE signedIn' = TRUE /\ count' = count + 1

Right == /\ signedIn /\ count' = 0 /\ inRow' = 0 /\ UNCHANGED <<signedIn, guesses>>

\* A reload, or opening another editor.
Reload == /\ signedIn
          /\ count' = IF Version = "current" THEN 0 ELSE count
          /\ UNCHANGED <<signedIn, inRow, guesses>>

Next == Wrong \/ Right \/ Reload

\* Nobody stays signed in after three wrong passwords in a row.
ThirdWrongSignsOut == signedIn => inRow < 3
==============================================================================
