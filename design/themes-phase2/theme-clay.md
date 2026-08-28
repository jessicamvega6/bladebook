# BladeBook — theme "Clay"

Measurement script: `design/themes-phase2/contrast-check-clay.py` (no dependencies, `python3 design/themes-phase2/contrast-check-clay.py`).
Sanity check printed on every run: **white / black = 21.0000**. All numbers below are its output, not estimates.

---

## 1. Direction

**Clay** is a warm, single-family palette: the whole interface is built on one arc of hue running from
plum (H≈5–15) through rose (H≈11) to bronze and peach (H≈40–58), with a temporary-schedule accent pushed
just off the end into magenta (H=345). Because everything is warm, **hue can never be the thing doing the
work** — so the theme is engineered as a *luminance ladder* instead, and the aesthetic follows from the
compliance decision rather than fighting it. For a coach at 6am in a cold car park, that means the screen
is a warm paper ground (`#FAF5F1`) rather than a blue-white glare, body text sits at 15.2:1, and the one
thing they are touching — the block being edited — is a solid, saturated terracotta chip that is **darker
than every surface around it**, so it survives a low, raking sun on a phone held at arm's length in a
glove. The commit button is near-black plum: the heaviest, darkest object on the screen, so "the button
I press to finish" is identifiable by weight alone in peripheral vision. At 10pm at a kitchen table the
same warm ground reads as low-glare rather than dim.

---

## 2. What happened to the five source colours

Measured in OKLCH: the five occupy L 0.430 → 0.856, and their relative luminances (Y) run 0.077 → 0.614.
As the brief predicted, none can be a page background (all too dark) and only the darkest could carry body
text. So the ramp was extended downward — a near-black plum for ink and the action fill — and upward — warm
near-whites for grounds. Four of the five are used **at their exact given values**, doing structural work.

| Source | Given value | OKLCH | Verdict | Where it lives |
|---|---|---|---|---|
| **Chocolate Plum** | `#63474D` | `oklch(0.430 0.039 4.7)` | **As given** | `--ink-3` — supporting text / micro-labels. Measures **8.08:1** on `--panel` (AAA). The darkest supplied colour turns out to be an excellent tertiary text tone, exactly at its given value. |
| **Dusty Rose** | `#AA767C` | `oklch(0.621 0.066 11.5)` | **As given** | `--other-line` — the border on every not-being-edited block. **3.30:1** against `--other-wash` and **3.67:1** against `--panel`: it clears WCAG 1.4.11 unmodified, and it is the border that carries the whole "other block" state. |
| **Tangerine Dream** | `#FFA686` | `oklch(0.806 0.115 40.5)` | **As given** | `--edit-wash-2` — the strong tint band across the header of the day column being edited, and the summary callout card. Carries `--ink` at **8.17:1** (AAA). The most saturated of the five, used at full strength as the loudest surface on the screen. |
| **Peach Glow** | `#FEC196` | `oklch(0.856 0.090 56.4)` | **As given** | `--on-temp` — the label colour on temporary-schedule chips. **8.10:1** on `--temp` (AAA). Also does semantic work: temp chips read peach-on-plum while the action button reads white-on-plum, which is a second, non-luminance cue separating them. |
| **Light Bronze** | `#D6A184` | `oklch(0.752 0.075 49.9)` | **Adjusted: L −0.092, C +0.033, hue unchanged** → `oklch(0.660 0.108 49.9)` | `--edit` — the solid fill behind the chips the coach is currently editing, i.e. the single most-touched colour in the app. At its given L=0.752 it measures only **2.26:1** against a white card and cannot be a component boundary; darkened to L=0.660 it hits **3.15:1** vs `--panel` and takes `--on-edit` at **5.29:1**. Its hue is preserved to the decimal, so it still reads as the client's bronze. `--edit-line` (`L 0.628`) and `--edit-ink` (`L 0.430`) are the same hue family. |

**Nothing was relegated to decoration.** All five appear on the primary screen, and four appear at the
exact hex the client supplied.

---

## 3. Tokens

All 34. Every value verified in sRGB gamut — **`outside sRGB: none`**.

| Token | `oklch(L C H)` | Hex | Use |
|---|---|---|---|
| `--ground` | `oklch(0.973 0.008 58)` | `#FAF5F1` | Page background — warm paper, not white |
| `--panel` | `oklch(0.992 0.003 58)` | `#FEFCFA` | Raised cards, the form panel |
| `--ground-2` | `oklch(0.945 0.010 58)` | `#F2EBE6` | Secondary panels; the untouched day columns |
| `--sunk` | `oklch(0.922 0.012 55)` | `#ECE3DE` | Inset wells, disabled button ground |
| `--line` | `oklch(0.620 0.024 40)` | `#94827B` | Default border on cards and columns |
| `--line-soft` | `oklch(0.655 0.020 40)` | `#9C8D88` | Text-field and input borders |
| `--line-dash` | `oklch(0.598 0.026 40)` | `#8E7B74` | Dashed outline on empty day columns |
| `--ink` | `oklch(0.264 0.032 15)` | `#331F20` | Primary text |
| `--ink-2` | `oklch(0.355 0.034 15)` | `#4C3536` | Secondary text, field labels |
| `--ink-3` | `oklch(0.430 0.039 4.7)` | `#63474D` | Supporting text, micro-labels — **Chocolate Plum, as given** |
| `--ink-4` | `oklch(0.550 0.028 15)` | `#816B6C` | Placeholder, disabled label |
| `--edit` | `oklch(0.660 0.108 49.9)` | `#C77E53` | **Solid** fill of the chip being edited — Light Bronze darkened |
| `--on-edit` | `oklch(0.230 0.030 15)` | `#291718` | Text on `--edit` |
| `--edit-wash` | `oklch(0.955 0.022 55)` | `#FDEDE3` | Tint over the whole edited day column |
| `--edit-wash-2` | `oklch(0.806 0.115 40.5)` | `#FFA686` | Strong band: edited column header, summary card — **Tangerine Dream, as given** |
| `--edit-line` | `oklch(0.628 0.108 49.9)` | `#BC744A` | Border on edited chips and the edited column |
| `--edit-ink` | `oklch(0.430 0.090 48)` | `#773F1F` | The edit accent as text on a light surface |
| `--other` | `oklch(0.397 0.085 11.5)` | `#6D313B` | Base accent for other blocks: 3–4px left rule, icon strokes |
| `--other-wash` | `oklch(0.958 0.018 11.5)` | `#FDECEE` | Fill of chips belonging to blocks not being edited |
| `--other-line` | `oklch(0.621 0.066 11.5)` | `#AA767C` | Border on other-block chips — **Dusty Rose, as given** |
| `--other-ink` | `oklch(0.375 0.078 11.5)` | `#632E36` | Text inside other-block chips |
| `--other-band` | `oklch(0.885 0.045 11.5)` | `#F5CED1` | "ALSO IN THIS SCHEDULE" pill background |
| `--action` | `oklch(0.270 0.055 10)` | `#3D1A20` | The one commit button per screen |
| `--action-ink` | `oklch(0.990 0.004 58)` | `#FEFBF9` | Label on the commit button |
| `--off-fill` | `oklch(0.898 0.006 58)` | `#E0DCD9` | Fill of a slot the coach switched off — desaturated on purpose |
| `--off-line` | `oklch(0.592 0.010 58)` | `#837C78` | **Dashed** border on an off slot |
| `--off-ink` | `oklch(0.392 0.010 58)` | `#4A4440` | Struck-through label on an off slot |
| `--warn-wash` | `oklch(0.952 0.020 30)` | `#FCEBE7` | Validation-error and REQUIRED-badge ground |
| `--warn-line` | `oklch(0.610 0.170 28)` | `#D65145` | Error border, invalid field outline |
| `--warn-ink` | `oklch(0.448 0.162 28)` | `#9B1D19` | Error text, REQUIRED badge text |
| `--temp` | `oklch(0.330 0.095 345)` | `#551D40` | Solid accent for temporary (dated) schedules |
| `--temp-wash` | `oklch(0.955 0.024 345)` | `#FDEAF4` | Temporary-mode panel tint |
| `--temp-line` | `oklch(0.610 0.090 345)` | `#AA6D90` | Border on temporary-mode panels |
| `--on-temp` | `oklch(0.856 0.090 56.4)` | `#FEC196` | Label on `--temp` — **Peach Glow, as given** |

---

## 4. Measured contrast

### 4a. The pairs the brief asked for — text

| Pair | Ratio | 4.5:1 body | 3:1 large / non-text | Grade |
|---|---|---|---|---|
| `--ink` / `--panel` | **15.17:1** | PASS | PASS | **AAA** |
| `--ink` / `--ground` | **14.35:1** | PASS | PASS | **AAA** |
| `--ink-2` / `--panel` | **11.01:1** | PASS | PASS | **AAA** |
| `--ink-3` / `--panel` | **8.08:1** | PASS | PASS | **AAA** |
| `--ink-4` / `--panel` | **4.81:1** | PASS | PASS | **AA** |
| `--on-edit` / `--edit` | **5.29:1** | PASS | PASS | **AA** |
| `--action-ink` / `--action` | **14.95:1** | PASS | PASS | **AAA** |
| `--edit-ink` / `--edit-wash` | **7.33:1** | PASS | PASS | **AAA** |
| `--other-ink` / `--other-wash` | **9.35:1** | PASS | PASS | **AAA** |
| `--off-ink` / `--off-fill` | **7.03:1** | PASS | PASS | **AAA** |
| `--warn-ink` / `--warn-wash` | **7.05:1** | PASS | PASS | **AAA** |
| `--on-temp` / `--temp` | **8.10:1** | PASS | PASS | **AAA** |
| `--edit` / `--other` | **3.03:1** | n/a | **PASS** (state pair) | — |
| `--edit` / `--action` | **4.78:1** | n/a | **PASS** (state pair) | — |
| `--edit` / `--temp` | **3.97:1** | n/a | **PASS** (state pair) | — |

**Every required text pair passes AA. Ten of twelve reach AAA.**
The last three are the four-roles-three-fills problem from earlier rounds. The previous palette failed
`--edit`/`--temp` at 1.78:1; this one measures **3.97:1**, and `--edit`/`--other` clears 3:1 at **3.03:1**
with no margin to spare — that pair is pinned exactly against its target and should not be re-tuned
without re-running the script.

### 4b. The non-text pairs the brief asked for (WCAG 1.4.11, target 3:1)

| Pair | Ratio | Result |
|---|---|---|
| `--line` / `--panel` | **3.59:1** | PASS |
| `--edit` / `--panel` | **3.15:1** | PASS |
| `--off-line` / `--off-fill` | **3.01:1** | PASS |
| `--other-line` / `--other-wash` | **3.30:1** | PASS |

### 4c. Additional text pairs (all measured, target 4.5:1)

| Pair | Ratio | Result |
|---|---|---|
| `--ink` / `--ground-2` | 13.20:1 | AAA |
| `--ink` / `--sunk` | 12.31:1 | AAA |
| `--ink` / `--edit-wash` | 13.57:1 | AAA |
| `--ink` / `--other-wash` | 13.66:1 | AAA |
| `--ink` / `--off-fill` | 11.44:1 | AAA |
| `--ink` / `--edit-wash-2` (Tangerine) | 8.17:1 | AAA |
| `--ink` / `--other-band` | 10.80:1 | AAA |
| `--ink` / `--temp-wash` | 13.50:1 | AAA |
| `--ink` / `--warn-wash` | 13.42:1 | AAA |
| `--ink-3` / `--ground` | 7.64:1 | AAA |
| `--ink-4` / `--ground` | 4.55:1 | AA |
| `--edit-ink` / `--panel` | 8.20:1 | AAA |
| `--other-ink` / `--panel` | 10.39:1 | AAA |
| `--warn-ink` / `--panel` | 7.97:1 | AAA |
| `--on-edit` / `--edit-wash-2` | 8.97:1 | AAA |
| `--other-ink` / `--other-band` | 7.40:1 | AAA |

No text pair anywhere in the theme falls below 4.5:1.

### 4d. Additional non-text pairs (target 3:1)

| Pair | Ratio | Result |
|---|---|---|
| `--line-soft` / `--panel` | 3.12:1 | PASS |
| `--line-dash` / `--panel` | 3.93:1 | PASS |
| `--line` / `--ground` | 3.39:1 | PASS |
| `--other-line` / `--panel` | 3.67:1 | PASS |
| `--other-line` / `--ground-2` | 3.19:1 | PASS |
| `--off-line` / `--panel` | 3.99:1 | PASS |
| `--off-line` / `--ground-2` | 3.47:1 | PASS |
| `--off-line` / `--other-wash` | 3.59:1 | PASS |
| `--edit-line` / `--panel` | 3.57:1 | PASS |
| `--edit-line` / `--edit-wash` | 3.20:1 | PASS |
| `--edit-line` / `--ground-2` | 3.11:1 | PASS |
| `--edit-line` / `--other-wash` | 3.22:1 | PASS |
| `--warn-line` / `--panel` | 4.01:1 | PASS |
| `--warn-line` / `--warn-wash` | 3.55:1 | PASS |
| `--temp-line` / `--panel` | 3.88:1 | PASS |
| `--temp-line` / `--temp-wash` | 3.45:1 | PASS |
| `--temp` / `--panel` | 12.51:1 | PASS |
| `--action` / `--panel` | 15.04:1 | PASS |
| `--action` / `--ground` | 14.22:1 | PASS |
| `--other` / `--panel` | 9.53:1 | PASS |
| `--other` / `--other-wash` | 8.58:1 | PASS |
| `--edit` / `--edit-wash` | **2.82:1** | **FAIL** — see below |
| `--edit` / `--other-wash` | **2.83:1** | **FAIL** — see below |
| `--edit` / `--ground-2` | **2.74:1** | **FAIL** — see below |
| `--edit` / `--off-fill` | **2.37:1** | **FAIL** — see below |
| `--edit-line` / `--off-fill` | **2.69:1** | **FAIL** — see below |
| `--temp` / `--action` | **1.20:1** | **FAIL** — see §7 |
| `--temp` / `--other` | **1.31:1** | **FAIL** — see §7 |

**On the five `--edit` fill-vs-surface failures.** These are the edit chip's *fill* against the surfaces
it sits on. They cannot all reach 3:1 — `--edit` is pinned between two hard floors (it must stay light
enough that `--on-edit` clears 4.5:1, and dark enough that `--edit`/`--panel` clears 3:1), which leaves
Y ∈ [0.25, 0.29], and no light wash can be more than ~2.9× brighter than that without becoming brighter
than `--panel` itself. **WCAG 1.4.11 is satisfied by the boundary, not the fill**: the edit chip carries a
1px `--edit-line` border, which measures **3.20:1** vs `--edit-wash`, **3.11:1** vs `--ground-2`,
**3.22:1** vs `--other-wash` and **3.57:1** vs `--panel` — every surface it actually appears on. The one
exception is `--edit-line` / `--off-fill` at 2.69:1; an edit chip and an off chip never share an edge in
the grid (an off chip replaces the chip it turned off), and if they are ever placed adjacent the off chip's
dashed border and strikethrough carry the distinction. This was a deliberate trade: pushing the washes up
to Y≈0.93 would have bought the 3:1 fill ratios but made the day-column tints invisible — worse UX for a
worse-founded compliance claim.

### 4e. Surface-to-surface (informational — 1.4.11 exempt)

WCAG 1.4.11 governs user-interface components and state indicators, not adjacent decorative backgrounds.
These are reported for completeness, not as failures.

| Pair | Ratio |
|---|---|
| `--ground` / `--panel` | 1.06:1 |
| `--ground-2` / `--ground` | 1.09:1 |
| `--edit-wash` / `--panel` | 1.12:1 |
| `--other-wash` / `--panel` | 1.11:1 |
| `--other-wash` / `--ground-2` | 1.03:1 |
| `--sunk` / `--panel` | 1.23:1 |
| `--off-fill` / `--panel` | 1.33:1 |
| `--off-fill` / `--ground-2` | 1.15:1 |
| `--other-band` / `--panel` | 1.40:1 |
| `--edit-wash-2` / `--panel` | 1.86:1 |

Note the honest consequence: **`--other-wash` and `--ground-2` differ by 1.03:1** — an other-block column
tint and an untouched column tint are near-identical in luminance and differ mainly in hue. That is why
the other-block state leans entirely on its Dusty Rose border (3.19:1 against `--ground-2`) and its label,
never on the tint.

### 4f. Gamut

**All 34 tokens fall inside sRGB.** Three did not on the first pass — `--panel`, `--edit-wash` and
`--warn-wash` were clipping the red channel — and were corrected by trimming L and C
(`--panel` 0.996→0.992, `--edit-wash` C 0.030→0.022, `--warn-wash` C 0.028→0.020). The script reports
`outside sRGB: none`.

---

## 5. WCAG 1.4.1 — what identifies each slot state besides colour

| State | Non-colour signal |
|---|---|
| **Editing** | Solid filled chip (the only *filled* chip in the grid) with a bold, dark, non-italic label, a filled 4px left bar, and an "EDITING" pill in the block header; the day column carries a Tangerine header band and a 2px `--edit-line` rule down both sides. Fill-vs-outline is the primary cue. |
| **Other block** | Outlined chip: pale ground, 1px solid `--other-line` border, 3px left rule, regular-weight label, plus the literal words "ALSO IN THIS SCHEDULE" on its header pill. Distinguished from editing by *outline vs fill* and by the label text. |
| **Switched off** | 1px **dashed** border (the only dashed chip border in the grid), the label rendered with `text-decoration: line-through`, and a small slash glyph. Dashed-vs-solid and strikethrough both survive greyscale printing and total colour loss. |
| **Empty day** | **No chip at all.** The column shows a dashed `--line-dash` outline and centred "No slots" text. Absence of content plus explicit words — no colour involved. |

No state in this theme is distinguished by hue alone. In a full greyscale conversion the grid still reads:
filled / outlined / dashed-and-struck / empty.

---

## 6. Colour vision deficiency

Simulated with the Viénot–Brettel LMS dichromat projection (Hunt-Pointer-Estévez `RGB2LMS`, per-type
projection matrix, back to sRGB). Contrast is recomputed on the simulated colours; `dE` is Euclidean
distance in OKLab after simulation (< 0.055 = collapse, < 0.10 = tight).

### The three required accent pairs

| Pair | Normal | Deuteranopia | Protanopia | Tritanopia |
|---|---|---|---|---|
| `--edit` / `--action` | 4.78:1 | **4.93:1** (dE 0.399) | **4.45:1** (dE 0.380) | **5.38:1** (dE 0.421) |
| `--edit` / `--other` | 3.03:1 | **3.03:1** (dE 0.272) | **3.03:1** (dE 0.271) | **3.05:1** (dE 0.277) |
| `--edit` / `--temp` | 3.97:1 | **4.00:1** (dE 0.349) | **3.90:1** (dE 0.347) | **4.18:1** (dE 0.353) |

**All three hold above 3:1 under all three dichromacies**, and two of the three actually *improve* under
simulation. This is the payoff for building the theme as a luminance ladder rather than a hue wheel: there
is nothing for CVD to take away. Worked example — under protanopia `--edit` `#C77E53` becomes `#888854`
and `--action` `#3D1A20` becomes `#202020`; the hues are gone entirely but the 4.45:1 separation is intact.

### Supporting pairs

| Pair | Normal | Deuteranopia | Protanopia | Tritanopia |
|---|---|---|---|---|
| `--edit` / `--other-wash` | 2.83:1 | 2.69:1 | 3.17:1 | 2.27:1 |
| `--edit` / `--edit-wash` | 2.82:1 | 2.67:1 | 3.15:1 | 2.25:1 |
| `--edit` / `--off-fill` | 2.37:1 | 2.24:1 | 2.69:1 | 1.89:1 |
| `--action` / `--temp` | 1.20:1 | **1.23:1** (dE 0.069, tight) | **1.14:1** (dE 0.063, tight) | **1.29:1** (dE 0.068, tight) |
| `--edit-ink` / `--other-ink` | 1.27:1 | 1.27:1 (dE 0.077, tight) | 1.26:1 (dE 0.080, tight) | 1.31:1 (dE 0.063, tight) |
| `--warn-ink` / `--other-ink` | 1.30:1 | 1.41:1 (dE 0.106, ok) | **1.08:1 (dE 0.055, collapse)** | 1.70:1 (dE 0.127, ok) |

**Two genuine CVD findings, stated plainly:**

1. **`--warn-ink` vs `--other-ink` collapses under protanopia** (dE 0.055, 1.08:1). Deep red goes very dark
   for a protanope: `#9B1D19` simulates to `#3E3E1B`, while `--other-ink` `#632E36` simulates to `#373737`.
   Both are readable against their own washes (7.05:1 and 9.35:1), so no text becomes illegible — but
   error text and other-block text are the same colour to a protanope. **Mitigation, already required by
   §5:** every error carries a triangle-alert glyph and the literal word REQUIRED or an error sentence.
   Colour was never the signal here.
2. **`--edit-ink` vs `--other-ink` is tight in all three types** (dE 0.063–0.080). Same reasoning: these
   are two accent-text colours on two different washes, each identified by the words next to it.

---

## 7. Compromises, stated plainly

**1. The three-solid-fill budget: `--other` was spent to buy `--edit` / `--other` at 3:1.**
Four roles wanted solid, mutually separable fills. I gave the budget to `--edit`, `--action` and `--temp`,
and made `--other` a *wash-and-border* system instead of a solid — its `--other` token is now a deep
plum-rose used only for 3–4px left rules and icon strokes, never as a chip fill. This is what makes
`--edit`/`--other` reach 3.03:1: `--other` had to be darkened from a mid rose (L 0.52) down to L 0.397.
The cost is that "other block" is a quieter, less colourful state than it could be, and its identity rests
almost entirely on the Dusty Rose border.

**2. `--temp` / `--action` = 1.20:1. This is the lowest ratio anywhere in the palette, and it is a real
failure, not a rounding.** Two of my three solid fills — the temporary-schedule accent and the commit
button — are both near-black, at Y 0.032 and Y 0.018. They are nearly indistinguishable as fills, and
CVD does not make it worse or better (1.14–1.29:1 across all three types). I chose this knowingly: the
brief's hard requirement was that `--edit` must not be confusable with `--action`, and `--edit`/`--temp`
must be separable — both of which force `--temp` and `--action` down into the same dark band. What
separates them in practice is *not colour*: `--action` is a 56px full-width button carrying near-white
`--action-ink` at 14.95:1; `--temp` is a small badge and chip fill carrying **Peach Glow** `--on-temp` at
8.10:1. White-on-plum vs peach-on-plum, button vs badge, plus a calendar glyph on every temporary element.
If these two ever need to sit adjacent as bare swatches, this palette does not distinguish them and a
fourth luminance band would have to come from somewhere — most likely by giving up AAA on the ink ramp.

**3. `--temp` / `--other` = 1.31:1.** Same dark-band crowding. Mitigated by the fact that they are modal
alternates — the weekly-schedule accent and the dated-schedule accent are shown in different modes of the
editor, not side by side — but it is a real constraint on any future screen that shows both at once.

**4. `--on-edit` / `--edit` sits at 5.29:1, AA not AAA.** Reaching 7:1 would require `--edit` at Y ≥ 0.39
(roughly L 0.735), at which point `--edit`/`--panel` drops to ~2.4:1 and the chip loses its 1.4.11
boundary. I took the hard non-text requirement over the optional AAA text target. Edit-chip labels should
be set at 700 weight to compensate.

**5. Light Bronze is the one source colour that could not be used verbatim in the role it wanted.**
It is the natural "editing" colour — warm, friendly, the middle of the client's range — but at L 0.752
nothing it sits on can give it a 3:1 boundary. Darkening it by 0.092 L preserved the hue exactly (49.9°)
and kept it recognisably bronze, but it is a noticeably deeper terracotta than the swatch the client
supplied. This is the single most visible deviation from the source palette and should be shown to them
side by side.

**6. Whole-surface luminance is deliberately compressed.** `--ground`, `--panel`, `--ground-2`,
`--edit-wash` and `--other-wash` all sit within 1.2:1 of each other. That is intentional — a low-contrast
substrate is what lets the `--edit` chips and the `--action` button read as the only high-energy objects
on the screen — but it means the theme depends on borders (`--line` at 3.59:1) for structure, and it will
look flat if those borders are ever removed for aesthetic reasons.
