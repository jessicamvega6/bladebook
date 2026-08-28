# BladeBook — Visual Theme

> Extracted from the **Timeline** schedule-creator design (`design/SchedTimeline.dc.html`)
> and generalised into a system. Colours are stated in `oklch()` because the ramps were
> built by varying lightness and chroma at a fixed hue — hex would hide the structure that
> makes the palette extensible.
>
> This is a design document, not a decision record. It describes how the product looks;
> `docs/adr/` describes what it does.

---

## 1. The one rule that explains the palette

**Two accents, and they mean different things.**

| Accent | Hue | Means |
|---|---|---|
| **Amber** | 62–80 | *The thing you are working on right now.* The block being edited, the slots it owns, the tab that has focus. |
| **Cobalt** | 262 | *The action that commits*, and *everything else that is real but not yours to edit* — other blocks, reference information, the primary button. |

Everything else is ice-paper neutral. Two accents is the budget; a third means one of these
two has stopped carrying its meaning.

This is worth stating because the obvious assignment is the opposite one. Blue reads as
"selected" in most software, so the instinct is to make blue the active thing. Here blue is
what you *press*, and amber is what you're *touching*. Getting this backwards makes the
primary button compete with the editing state for the same meaning.

---

## 2. Paper and ink

The ground is a very slightly cool white — not pure — and the ink is a blued near-black
rather than grey. Both carry a trace of the cobalt hue, which is what stops the neutrals
reading as dead grey next to the accents.

### Surfaces

| Token | Value | Use |
|---|---|---|
| `--paper` | `oklch(0.995 0.002 250)` | Cards, fields, anything raised |
| `--ground` | `oklch(0.962 0.006 250)` | The page behind everything |
| `--ground-2` | `oklch(0.978 0.004 250)` | Secondary panels, inactive columns |
| `--sunk` | `oklch(0.968 0.006 250)` | Inset wells — segmented controls, legend bars |

### Lines

| Token | Value | Use |
|---|---|---|
| `--line` | `oklch(0.90 0.012 250)` | The default border. Most rules on the page are this. |
| `--line-soft` | `oklch(0.88 0.012 250)` | Field borders, secondary dividers |
| `--line-dash` | `oklch(0.86 0.015 250)` | Dashed outlines — "add" affordances, switched-off slots |

### Switched off

A slot the coach has turned off, and the empty space between blocks, share one treatment.

| Token | Value | Use |
|---|---|---|
| `--off-fill` | `oklch(0.898 0.008 250)` | Fill of a switched-off slot |
| `--off-line` | `oklch(0.72 0.016 250)` | Its dashed border; the "no lessons" rule |
| `--off-ink` | `oklch(0.47 0.022 258)` | Its struck-through label |

These are deliberately **darker than the paper ramp**, not lighter. The instinct on a light
ground is to make "off" fainter, but faint reads as *the system disabled this* — and after a
point it reads as nothing at all. Off is a state the coach chose, so it has to be as visible
as the thing it replaced. It recedes through the dashed edge and the strike-through, not
through low contrast.

### Ink ramp

Fixed hue 258, dropping chroma as it lightens. Five steps is enough; a sixth encourages
using contrast where hierarchy is what's needed.

| Token | Value | Use |
|---|---|---|
| `--ink` | `oklch(0.24 0.04 258)` | Body text, headings, anything that must be read |
| `--ink-2` | `oklch(0.42 0.03 258)` | Secondary text, labels with weight |
| `--ink-3` | `oklch(0.55 0.025 258)` | Supporting copy, uppercase field labels |
| `--ink-4` | `oklch(0.68 0.02 258)` | Placeholders, disabled, "no lessons" |
| `--ink-5` | `oklch(0.80 0.015 250)` | Decorative only. Never for text a user must read. |

---

## 3. Amber — what you are editing

| Token | Value | Use |
|---|---|---|
| `--edit` | `oklch(0.58 0.125 62)` | Solid fill: the active block's slots, its badge |
| `--edit-line` | `oklch(0.72 0.11 70)` | Border on amber-tinted surfaces |
| `--edit-wash` | `oklch(0.978 0.022 80)` | The faintest tint — a column containing the active block |
| `--edit-wash-2` | `oklch(0.958 0.038 78)` | A step up: confirmation panels, active cards |
| `--edit-ink` | `oklch(0.34 0.08 62)` | Amber text on a light ground |
| `--on-edit` | `oklch(0.995 0.002 250)` | Text **on** solid amber |

`--edit` at 0.58 lightness carries white text comfortably and dark text poorly. Use
`--on-edit`; don't reach for `--ink` on an amber fill.

---

## 4. Cobalt — commit, and everything not yours

| Token | Value | Use |
|---|---|---|
| `--action` | `oklch(0.52 0.185 262)` | The primary button. One per screen. |
| `--action-ink` | `oklch(0.995 0.002 250)` | Text on the primary button |
| `--action-shadow` | `oklch(0.52 0.185 262 / 0.28)` | The lift under it — the only shadow in the system |
| `--other` | `oklch(0.52 0.09 262)` | Other blocks' text and marks |
| `--other-line` | `oklch(0.80 0.075 262)` | Their borders |
| `--other-wash` | `oklch(0.955 0.025 262)` | Their fill |
| `--other-band` | `oklch(0.90 0.045 262)` | Their header bands |
| `--other-ink` | `oklch(0.40 0.15 262)` | Their strong text |
| `--ref-ink` | `oklch(0.38 0.09 262)` | Reference notes — "no clash with Block 1" |

**Only one element on a screen may use `--action`.** It is the thing that commits. If two
things are cobalt-solid, neither is the primary action any more.

---

## 5. States the source design didn't cover

Timeline had no error state and no second mode, so these are extensions built at the same
hue discipline rather than lifted. Flagged as such so nobody mistakes them for extracted
values.

### Error / required

| Token | Value | Use |
|---|---|---|
| `--warn-wash` | `oklch(0.965 0.022 25)` | Validation panel background |
| `--warn-line` | `oklch(0.84 0.07 25)` | Its border |
| `--warn-ink` | `oklch(0.45 0.16 25)` | Validation text, REQUIRED badges |

### Temporary schedules

A temporary schedule is a **different mode**, not a third thing on screen — so it does not
get its own hue. It is marked by **deep cobalt** `oklch(0.32 0.12 262)` on the header and
mode switch, and, far more importantly, by the preview columns carrying **real dates**
rather than weekday names. The colour is the confirmation; the dates are the signal.

Resisting a third accent here is deliberate. Violet would have read as a third kind of
*thing* rather than a different *mode* of the same screen.

---

## 6. Type

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Space+Grotesk:wght@400;500;600;700&display=swap">
```

| Role | Face | Notes |
|---|---|---|
| Display | **Instrument Serif** | Screen titles and large numbers only. Sparingly — it is a voice, not a workhorse. |
| Everything else | **Space Grotesk** | 400 body · 500 emphasis · 600 labels and controls · 700 headings |

Fallbacks: `'Instrument Serif', Georgia, serif` and `'Space Grotesk', 'Avenir Next', 'Segoe UI', system-ui, sans-serif`. Metrics are close enough that a font failure degrades rather than reflows.

**Uppercase micro-labels** — 10.5px, weight 600, `letter-spacing: .14em` — carry field
names and section headers. The tracking is doing the work; without it they read as shouting.

---

## 7. Geometry

| | |
|---|---|
| Panels | 20px radius |
| Fields, buttons | 12px radius, 48px tall |
| Chips, slots | 6–9px radius, scaling with size |
| Badges | 999px |
| Gaps | 5 · 7 · 10 · 14 · 22px — a loose scale, not a strict 4/8 grid |
| Hit targets | **44px minimum**, always |

**One shadow only**, under the primary action. Elevation is carried by borders and surface
lightness, not by stacking shadows.

---

## 8. Rules worth keeping

- **Never let cobalt and amber both go solid in the same region.** One is what you're
  editing, the other is what commits; side by side at full saturation they fight.
- **A switched-off slot is dashed and struck through, never just faded.** Faded reads as
  disabled-by-the-system; dashed reads as chosen-off-by-you.
- **Empty is a state, not an absence.** A day with no lessons gets a dashed panel and a
  label, not a blank column.
- **Colour never carries meaning alone.** Off slots have strike-through, the active block
  has a badge, other blocks have a different border. The palette should survive being
  printed in greyscale.
