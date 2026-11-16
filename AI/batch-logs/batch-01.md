# Batch 1: Walking skeleton, coach profile and coach code

**Built:** 2026-11-08 · merged by PR #6 · back to the [implementation plan](../implementation-plan.md)

This file is a finished record, kept as it was written at the time. What's still open lives in the root
`README.md` (gaps and shortcuts) and `AI/implementation-plan.md` (what's left to build). A section number such as §4
or §6 below means the plan as it was then: its conflicts (§4) and decisions (§6) are now in `AI/plan-history.md`,
and §7 meant these batch logs.

## The plan, as written before it was built

- **Foundation, smallest possible:**
  - DynamoDB Local in Docker, and the one table created by a test helper.
  - Local sign-in stand-in (Question 3).
  - `shared/api` fetch client with the single retry on a server error.
  - Harbor CSS loaded.
  - ~~The "Gaps & shortcuts" panel component.~~ Built, then removed by the owner on 2026-11-08; the list is in the root `README.md`.
  - `GET /health`.
- **Core (TDD):**
  - `CoachCode`: generate 8 characters from the set with no look-alikes, shown as 4-4. Normalise case and dash. Reject the wrong length or characters.
  - Collision retry on the `attribute_not_exists` write.
  - `PaymentTypes`: a type can't be switched on without a handle; switching off keeps the handle.
- **Slice:** a coach (already signed in through the stand-in) completes the business-details step. This writes `PROFILE` and `CODE#`.
  - Profile → Details: name, phone, time zone, currency read-only.
  - Profile → Payments.
  - Coach code: show, copy, rotate.
- **Left out:** photo (A1) and the SMS switch at sign-up (A3), both ruled out. **Built from the rulings:** the business-email banner and the code's "Not working yet" state (A2). **Also left out (owner, 2026-11-08):** the business-email confirmation email and link. Batch 1 fully builds the *Use my login email* path, which writes `CODE#` at once. A different address leaves the code "Not working yet", and a **local-only "mark confirmed" action** stands in for clicking the link. That action is **listed as a shortcut** on screen and in `README.md` until batch 14 replaces it.
- **Settled by Claude (owner may override):** time-zone labels are stored as IANA names (e.g. "Central — Chicago" → `America/Chicago`). The Cognito-owned sign-up steps (create account, verify code) aren't built; the slice starts at step 3 behind the local token stub.

## Log

The full list, with what closes each one, is in the root `README.md`.

- **Shortcuts:** SC-1 local token stub for Cognito; SC-2 “I’ve clicked the link” confirms the
  business email locally; SC-3 DynamoDB Local with one unscoped client (no `coach-tenant` gate);
  SC-4 nothing deployed.
- **Gaps:** A1 photo and A3 sign-up texts switch (both ruled out); G-1 Resend link / Change
  address; G-2 Business email tab; G-3 Visibility & texts tab (contact switches moved to Batch 16 on 2026-11-09); G-4 Account tab; G-5 sign-up steps
  1–2; G-6 every other coach page; G-7 no warning before the 60-minute sign-in ends.
- **Settled while building (owner may override):**
  - *(Replaced in Batch 14 by `pendingBusinessEmails`, ADR-016's 2026-11-12 shape; an old `pendingBusinessEmail`
    reads as an address whose link has expired.)* An unconfirmed business email is stored as `pendingBusinessEmail`; `businessEmail` stays
    empty until it is confirmed, and the code works exactly when `businessEmail` is set. The
    attribute name isn't in the ADRs.
  - Time zones: the seven on the Profile → Details design are offered at sign-up too (step 3's
    design shows five).
  - Rotating a code that isn't working yet only changes the profile; its `CODE#` item is
    written when the business email is confirmed, with a new code if that one was taken
    meanwhile.
  - `api-coach` accepts Cognito **ID** tokens (`token_use = id`, app client in `aud`), since the
    login email is read from the token's `email` claim, which access tokens don't carry.
  - Field limits: names 50 characters, handles 60, payment instructions 1,000, phone 10–15
    digits.
- **Owner's changes, 2026-11-08** (these differ from the Harbor designs, which aren't redrawn):
  - Sign-up's time zone defaults to **Central — Chicago**.
  - A payment type's handle box shows **only while its switch is on**. Switching on no longer
    waits for a handle; Save refuses a type that is on with no handle (the ADR-016 d7 rule
    now applies when saving). Switching off hides the box and keeps the handle.
  - Handles carry a **prefix**, shown in front of the box and stored with the handle: `$` Cash
    App, `@` Venmo, `paypal.me/` PayPal. `core` adds it if it's missing and never doubles it.
- **Found while building:** `aws-serverless-java-container` brings
  `spring-cloud-function-serverless-web`, whose auto-configuration replaces Tomcat with a
  Lambda-only server, so `api-coach` and `api-client` never listened on :8080 / :8081 locally.
  The `local` profile now excludes it (`application-local.properties` in each API).
