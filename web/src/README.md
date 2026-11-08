# web/src

| Folder | What goes there |
|---|---|
| `coach/` | The coach website: `pages/` (one per route: Today, Week, Schedule, Students, Payments, Profile) and `components/` used only by the coach site. |
| `rinkside/` | The rinkside page at `/coach/rinkside` (ADR-023). `offline/` holds the cached lessons and the check-in queue (ADR-014). Never imports the schedule editor. |
| `family/` | The family website: sign-up with coach codes, booking, cancellation, account. |
| `shared/api/` | Typed fetch calls to `/api/coach` and `/api/client`, with the one retry on a server error (ADR-MASTER section 1). |
| `shared/auth/` | Cognito sign-in, token refresh, the "sign in again" flow. |
| `shared/components/` | Harbor components used by more than one site (`design/harbor/`). |
| `shared/logic/` | Logic that also exists in Java (slot expansion, price totals, week arithmetic), tested from the shared fixture at the repo root (ADR-013). |
