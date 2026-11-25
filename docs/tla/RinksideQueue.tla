---------------------------- MODULE RinksideQueue -----------------------------
(***************************************************************************)
(* The rinkside page's capture queue for one seat (web/src/rinkside).  A   *)
(* tap is sent at once when the page thinks it is online, else queued; a   *)
(* re-tap of the same seat replaces the queued entry.  Sync sends the      *)
(* queue's head; its answer removes the entry.                             *)
(*                                                                         *)
(* "current": any error that isn't a 400 or 409 marks the page offline,    *)
(*   and only the browser's own "online" event marks it online again; the  *)
(*   answer removes whatever entry has the seat's identity.                *)
(* "fixed": only a network failure marks the page offline; the answer      *)
(*   removes only the exact entry that was sent.                           *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS Version, MaxTaps, MaxServerErrors

VARIABLES net,        \* the browser has a network
          pageOnline, \* what the page believes
          queue,      \* 0 = empty, else the tap number queued
          inflight,   \* 0 = nothing being sent, else the tap number
          taps, errors,
          lost        \* a tap vanished without being sent

vars == <<net, pageOnline, queue, inflight, taps, errors, lost>>

Init == /\ net = TRUE /\ pageOnline = TRUE /\ queue = 0 /\ inflight = 0
        /\ taps = 0 /\ errors = 0 /\ lost = FALSE

Tap == /\ taps < MaxTaps
       /\ taps' = taps + 1
       /\ queue' = taps + 1        \* replaces a queued tap of the same seat: the last tap wins
       /\ UNCHANGED <<net, pageOnline, inflight, errors, lost>>

\* Sync sends the queued entry (one at a time).
SendHead == /\ pageOnline /\ queue # 0 /\ inflight = 0
            /\ inflight' = queue
            /\ UNCHANGED <<net, pageOnline, queue, taps, errors, lost>>

Remove(sent) == IF Version = "current" THEN 0                 \* by the seat's identity
                ELSE IF queue = sent THEN 0 ELSE queue         \* only the exact entry

Answered == /\ inflight # 0 /\ net
            /\ lost' = (lost \/ (queue # 0 /\ queue # inflight /\ Remove(inflight) = 0))
            /\ queue' = Remove(inflight) /\ inflight' = 0
            /\ UNCHANGED <<net, pageOnline, taps, errors>>

NetworkFailure == /\ inflight # 0 /\ ~net
                  /\ pageOnline' = FALSE /\ inflight' = 0
                  /\ UNCHANGED <<net, queue, taps, errors, lost>>

\* A 5xx after the retry, a 403...: the entry stays queued.
ServerError == /\ inflight # 0 /\ net /\ errors < MaxServerErrors
               /\ errors' = errors + 1 /\ inflight' = 0
               /\ pageOnline' = IF Version = "current" THEN FALSE ELSE pageOnline
               /\ UNCHANGED <<net, queue, taps, lost>>

NetDown == /\ net /\ net' = FALSE /\ UNCHANGED <<pageOnline, queue, inflight, taps, errors, lost>>
\* The browser fires "online" only when the network comes back.
NetUp == /\ ~net /\ net' = TRUE /\ pageOnline' = TRUE
         /\ UNCHANGED <<queue, inflight, taps, errors, lost>>

Next == Tap \/ SendHead \/ Answered \/ NetworkFailure \/ ServerError \/ NetDown \/ NetUp

Spec == Init /\ [][Next]_vars /\ WF_vars(SendHead) /\ WF_vars(Answered) /\ WF_vars(NetUp)
            /\ WF_vars(NetworkFailure)

NoTapLost == ~lost
\* With the network up for good, the page doesn't stay "offline" for good.
NotStuckOffline == <>[]net => []<>pageOnline
==============================================================================
