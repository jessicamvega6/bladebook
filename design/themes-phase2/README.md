# Phase 2 — coach-selectable themes

**Harbor is the shipped theme** (`design/harbor/`, chosen 2026-10-01). Forest, which these
four were written against, moved to `design/DecidedAgainst/forest-theme/`. **The four below
still implement Forest's 34-token contract** and need mapping onto Harbor's tokens before
they can be swapped in.

These four are not rejected work — they are the **catalogue for a Phase 2 feature**: a
coach picks the look of their own booking pages. They live here rather than in
`DecidedAgainst/` because they are all intended to ship eventually.

| Theme | Character | Notes |
|---|---|---|
| `theme-timeline-amber.md` | **Timeline** — ice paper, amber for the block you are editing, cobalt for the commit button. | The original. Its inverted convention is deliberate and worth preserving: blue is what you *press*, amber is what you're *touching*. |
| `theme-monochrome.md` | **Monochrome Ice** — every role on one hue (252), separated by lightness and chroma alone. | The most restrained. `--warn` is the sole hue break, at 27, because a same-hue warning measured 0.083 OKLab from `--edit` — it read as another block state rather than a problem. |
| `theme-cvd-safe.md` | **Deep Ice / Coral** — chosen by verifying it under simulated colour blindness rather than by eye. | Deep violet-indigo edit, ice-cyan other blocks, coral commit, separated by inverted lightness polarity so the pair survives protanopia. |
| `theme-clay.md` | **Clay** — the warm palette: plum, dusty rose, bronze, peach. | Four of the five client-supplied colours survive at their exact hex. Built as a luminance ladder rather than a hue wheel. |

`contrast-check-clay.py` is a dependency-free oklch → sRGB → WCAG contrast tool. It
holds Clay's palette but works for any of them.

## What a theme has to satisfy

All four implement the **same 34-token contract** as Forest, which is what makes them
swappable at runtime — see the live switcher in `design/DecidedAgainst/forest-theme/schedule-creator-poc.html`.

Two rules every theme has to hold, learned the hard way across six palettes:

- **A theme is not just colours, it is polarities.** Forest's `--action` is a *light*
  amber taking dark text; Timeline's is a *dark* cobalt taking white. Swapping palettes
  without swapping text colour produced 1.84:1 accent-on-white more than once.
- **At most three solid fills can be mutually separable in sRGB at accessible contrast.**
  `--edit`, `--other`, `--action` and `--temp` are four roles competing for that budget.
  Every palette here gives one of them up; each README section says which.

## Scope: a theme runs throughout

**A coach's theme is what their clients see.** One choice colours everything under that
coach — their own schedule editor and week view, and the client-facing booking flow for
every family they teach. It is the coach's brand, not a personal display preference.

Three things follow, and they are the reason this is worth writing down:

- **The theme is a property of the coach, not of the viewer.** It resolves from the
  `coachId` on the page being rendered, not from the signed-in user. A client booking
  with two coaches would see two different-looking booking flows — correct under this
  decision, and worth confirming when a client is finally allowed more than one coach
  (ADR-002 decision 5 currently forbids it).

- **It has to load before first paint, for an unauthenticated visitor.** A client
  reaching a booking page has a `coachId` from the URL but no session yet, so the theme
  cannot come from a logged-in profile fetch. Either it is served with the page or the
  first render flashes the default.

- **Every accessibility guarantee now applies to clients too.** The contrast measurements
  in these specs were made against coach-facing screens. A coach choosing a theme is
  choosing it *on behalf of families they have never met*, which is why each palette here
  had to clear WCAG on its own rather than merely look good — none of them can be allowed
  to fail for someone the coach cannot see.
