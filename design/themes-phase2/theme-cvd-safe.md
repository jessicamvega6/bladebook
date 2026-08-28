# BladeBook — CVD-verified palette

> **Revision 2.** Replaces the amber/cobalt pairing, then answers the client note that the
> block states blended together. Every number below was re-measured from scratch by the
> script in Appendix A: `oklch → Oklab → linear sRGB → 8-bit sRGB → WCAG relative luminance →
> contrast ratio`, with dichromat simulation by Brettel/Viénot/Mollon (1997). Nothing was
> carried forward from revision 1. No token sits in hue 45–100.

---

## 0. What changed in revision 2, and why

The client was right, and the fix was bigger than a hue swap.

**The complaint.** In revision 1 `--edit` and `--other*` were both cobalt — one dark, one
mid — so the week grid read as one blue system at a glance. Correct diagnosis.

**The trap.** The obvious fix is to give `--other` a third hue at roughly its existing
lightness. I swept every hue from 140° to 360° at mid lightness and measured post-simulation
separation from the coral `--action` (Appendix B reproduces the sweep). The result is
unambiguous: **at mid lightness, no hue at all separates from coral by luminance** — every
candidate landed between 1.00:1 and 1.50:1 — and every hue far enough from `--edit` to satisfy
a trichromat (teal and green, 140–200°) collapsed *chromatically* onto coral for a protanope,
with ΔE_ok as low as **0.013**. A teal `--other` at L 0.635 measured **1.01:1 contrast and
ΔE_ok 0.070** against `--action` under protanopia: for roughly 1% of men those two would have
been the same colour. The only hues that held chromatic distance from coral (250–300°) were
the ones already occupied by `--edit`. So the naive fix was unavailable.

**The theorem that forced the rebuild.** Chaining the 3:1 requirement upward from black gives
minimum luminances of Y = 0.00 → 0.10 → 0.40 → **1.30**. The fourth rung exceeds white.
**At most three fills can be mutually ≥3:1 in sRGB**, full stop. Worse, with `--action` fixed
at Y 0.379, anything 3:1 from it must be Y ≤ 0.093 or Y ≥ 1.238 — so *nothing but a very dark
colour can ever be luminance-separated from the action button.*

**The rebuild.** Roles were reassigned to put each one on a rung of that three-step ladder,
and each hue was then chosen to survive against coral:

| | Rev 1 | Rev 2 | Rung |
|---|---|---|---|
| `--edit` | cobalt 252, L 0.380 | **violet 300, L 0.270** | dark |
| `--other` | cobalt 252, L 0.655 | **cyan 215, L 0.896** | light |
| `--temp` | violet 305, L 0.550 | **blue 262, L 0.555** | mid |
| `--action` | coral 36, L 0.740 | coral 36, L 0.740 (unchanged) | — |

`--edit` took the dark rung because that rung is luminance-protected from *everything*, which
frees its hue completely — so it could take violet, the richest dark hue available in sRGB
(C 0.140 at L 0.270, against cobalt's 0.104). `--other` took the light rung, giving the
client's pair a **11.96:1** separation instead of 3.18:1. `--temp` took the mid rung, which is
what fixed its failure against `--edit`.

**Results of the rebuild:**

| Pair | Rev 1 | Rev 2 | Worst post-sim |
|---|---:|---:|---:|
| `--edit` / `--other` | 3.18:1 | **11.96:1** | 10.60:1 |
| `--edit` / `--action` | 4.11:1 | **6.52:1** | 5.54:1 |
| `--edit` / `--temp` | 1.78:1 **FAIL** | **3.19:1 PASS** | 3.19:1 |
| `--other` / `--temp` | n/a | **3.75:1** | 3.19:1 |
| `--other` / `--off-fill` | 1.25:1 | **1.76:1** | 1.71:1 |

The revision-1 `--edit`/`--temp` failure is **fixed**, and every one of the four block-state
pairs now clears 3:1 under normal vision *and* under all three dichromacies. `--off-fill` also
moved down (L 0.880 → 0.735) so the switched-off chip is a genuine mid grey rather than a pale
one, which was the only way to give it any luminance distance from the new light-cyan `--other`.

---

## 1. The direction — **Indigo / Ice / Signal Coral**

Three hues that a trichromat reads instantly as three different colours — a deep violet-indigo,
a pale ice cyan, and a coral — arranged so that the difference a colour-blind coach relies on is
never the hue. Each block state sits on a separate rung of a three-step luminance ladder, and
the ladder is the load-bearing structure: `--edit` is a near-black violet chip with white text,
`--other` is a pale cyan chip with dark text, `--temp` is a mid blue band, and every pair among
them is ≥3:1 apart in luminance *after* simulation, not merely before it. The hue is what makes
the grid legible at a glance for most people; the lightness is what makes it legible for
everyone else. **`--edit`/`--other` measures 11.96:1 and never drops below 10.60:1 under any
deficiency** — the coach's own block is simply the dark one, and that survives dichromacy,
greyscale, a monochrome printout and a phone with night-shift on. `--action` keeps the coral
that tested well and keeps its inverted polarity — dark text on a light warm fill, against
`--edit`'s white text on a dark cool fill — so the thing you *press* can never be mistaken for
the thing you are *touching*. The ground stays a light, near-achromatic ice-neutral (`--panel`
L 0.985, `--ground` L 0.945) rather than dark, because the failure mode at 6am is not brightness
but *washout*: a phone in a car park under a sodium lamp, or in a rink lobby with daylight off
snow, collects a film of reflected light across the glass, and reflected light destroys a dark
UI's contrast while it merely dilutes a light one's. Panels sit at L 0.985 rather than pure
white so the screen does not bloom when it is the only light source in the car, and body ink
lands at **15.97:1** — roughly double the AAA floor, with headroom to burn on glare, gloves and
arm's-length reading.

**Why these three hues and not others.** Deutan and protan vision collapses the red–green axis
onto a blue–yellow line, so the only hue contrast that survives is blue-pole against
yellow-pole. Coral (36°) is the yellow pole — the nearest legal point to it, since hue 45–100
is out. Violet (300°), blue (262°) and cyan (215°) are all blue-pole, which means **they cannot
be told apart from each other by hue** by a dichromat — and that is precisely why all three are
separated by luminance instead. Teal and green were tested and rejected: they sit near the
neutral point of the confusion line, so they lose their hue *and* have no luminance protection
against coral. The palette therefore makes exactly one hue claim that has to survive
simulation — blue-pole vs coral — and settles everything else with lightness.

---

## 2. Tokens

### Surfaces

| Token | oklch | sRGB | Use |
|---|---|---|---|
| `--ground` | `oklch(0.945 0.007 248)` | `#E9EDF1` | The page behind everything |
| `--panel` | `oklch(0.985 0.003 248)` | `#F8FAFC` | Raised cards, fields, the grid surface |
| `--ground-2` | `oklch(0.966 0.005 248)` | `#F1F4F7` | Secondary panels; an **empty** day column |
| `--sunk` | `oklch(0.922 0.009 248)` | `#E1E6EB` | Inset wells — segmented controls, legend bars |

### Lines

| Token | oklch | sRGB | Use |
|---|---|---|---|
| `--line` | `oklch(0.652 0.020 248)` | `#87919C` | Default border — card edges, dividers |
| `--line-soft` | `oklch(0.640 0.024 248)` | `#818E9A` | Field borders. *Marginally darker than `--line` despite the name — see §6.* |
| `--line-dash` | `oklch(0.650 0.022 248)` | `#85919C` | Dashed outlines — "add block" affordances |

### Ink

| Token | oklch | sRGB | Use |
|---|---|---|---|
| `--ink` | `oklch(0.235 0.033 256)` | `#141F2E` | Body text, headings, times on chips |
| `--ink-2` | `oklch(0.410 0.030 256)` | `#404B5B` | Secondary text, weighted labels |
| `--ink-3` | `oklch(0.515 0.027 256)` | `#5E6877` | Supporting copy, uppercase micro-labels |
| `--ink-4` | `oklch(0.615 0.023 256)` | `#7C8693` | **Disabled and decorative only** — not legal for body text (§6) |

### Edit — the block you are editing now · **deep violet-indigo, dark rung**

| Token | oklch | sRGB | Use |
|---|---|---|---|
| `--edit` | `oklch(0.270 0.140 300)` | `#33035E` | **Solid fill** behind the active block's slot chips |
| `--on-edit` | `oklch(0.990 0.002 248)` | `#FBFCFD` | Text on that solid fill |
| `--edit-wash` | `oklch(0.955 0.022 300)` | `#F2EDFD` | Faintest tint — a column containing the active block |
| `--edit-wash-2` | `oklch(0.918 0.044 300)` | `#E8DEFE` | A step up — active card, confirmation panel |
| `--edit-line` | `oklch(0.600 0.245 300)` | `#9A4AF9` | Border on edit-tinted surfaces |
| `--edit-ink` | `oklch(0.360 0.185 300)` | `#4F088D` | The accent as text on a light surface |

### Other — blocks that exist but aren't being edited · **ice cyan, light rung**

| Token | oklch | sRGB | Use |
|---|---|---|---|
| `--other` | `oklch(0.896 0.081 215)` | `#9DEBFE` | **Their slot chip fill** — pale cyan carrying dark text |
| `--other-wash` | `oklch(0.948 0.038 215)` | `#D2F5FE` | Their column tint, a step lighter than the chip |
| `--other-line` | `oklch(0.560 0.094 215)` | `#168297` | Their border (solid, 1px) — load-bearing, see §6 |
| `--other-ink` | `oklch(0.395 0.068 215)` | `#054F5D` | Their text |
| `--other-band` | `oklch(0.800 0.135 215)` | `#28D3F4` | Their header band (decorative fill, §6) |

### Action — the one thing that commits · **coral, unchanged**

| Token | oklch | sRGB | Use |
|---|---|---|---|
| `--action` | `oklch(0.740 0.152 36)` | `#FB8464` | Primary button fill. **One per screen.** |
| `--action-ink` | `oklch(0.215 0.060 36)` | `#300D04` | Its label — **and its 1px rim**, which is load-bearing (§6) |

### Off — a slot the coach switched off

| Token | oklch | sRGB | Use |
|---|---|---|---|
| `--off-fill` | `oklch(0.735 0.004 248)` | `#A7A9AC` | Fill of a switched-off slot — a true mid grey |
| `--off-line` | `oklch(0.455 0.008 248)` | `#53575B` | Its **dashed** border |
| `--off-ink` | `oklch(0.350 0.014 256)` | `#363B42` | Its **struck-through** label |

### Warn — validation and REQUIRED

| Token | oklch | sRGB | Use |
|---|---|---|---|
| `--warn-wash` | `oklch(0.950 0.024 22)` | `#FEE9E7` | Validation panel background |
| `--warn-line` | `oklch(0.610 0.180 22)` | `#DA4A50` | Its border |
| `--warn-ink` | `oklch(0.440 0.170 22)` | `#9B0D23` | Error text, REQUIRED badges |

### Temp — a temporary (dated) schedule · **blue, mid rung**

| Token | oklch | sRGB | Use |
|---|---|---|---|
| `--temp` | `oklch(0.555 0.232 262)` | `#1864F7` | Mode band, mode chip, dated-schedule marker |
| `--temp-wash` | `oklch(0.950 0.023 262)` | `#E6EFFF` | Temporary-mode panel tint |
| `--temp-line` | `oklch(0.600 0.205 262)` | `#3577F8` | Its border |
| `--on-temp` | `oklch(0.990 0.002 248)` | `#FBFCFD` | Text on solid `--temp` (large/bold only — §6) |

---

## 3. Measured contrast

### 3a. The twelve required pairs

| Pair | Ratio | Target | Result | Band |
|---|---:|---:|---|---|
| `--ink` / `--panel` | **15.97:1** | 4.5 | PASS | AAA |
| `--ink` / `--ground` | **14.20:1** | 4.5 | PASS | AAA |
| `--ink-2` / `--panel` | **8.45:1** | 4.5 | PASS | AAA |
| `--ink-3` / `--panel` | **5.38:1** | 4.5 | PASS | AA |
| `--ink-4` / `--panel` | **3.55:1** | 3.0 (non-text / disabled) | PASS | large-text & UI only — **fails 4.5 body** |
| `--on-edit` / `--edit` | **15.50:1** | 4.5 | PASS | AAA |
| `--action-ink` / `--action` | **7.27:1** | 4.5 | PASS | AAA |
| `--edit-ink` / `--edit-wash` | **10.45:1** | 4.5 | PASS | AAA |
| `--other-ink` / `--other-wash` | **7.96:1** | 4.5 | PASS | AAA |
| `--off-ink` / `--off-fill` | **4.81:1** | 4.5 | PASS | AA |
| `--warn-ink` / `--warn-wash` | **7.29:1** | 4.5 | PASS | AAA |
| `--on-temp` / `--temp` | **4.87:1** | 4.5 | PASS | AA |

**AAA (≥7:1):** `--ink`/`--panel`, `--ink`/`--ground`, `--ink-2`/`--panel`, `--on-edit`/`--edit`,
`--action-ink`/`--action`, `--edit-ink`/`--edit-wash`, `--other-ink`/`--other-wash`,
`--warn-ink`/`--warn-wash` — **8 of 12** (up from 7).
**AA (4.5–7:1):** `--ink-3`, `--off-ink`, `--on-temp` — 3 of 12.
**Below 4.5:** `--ink-4`/`--panel` at 3.55:1 only — intentional and scoped (§6).
**Failures against a stated target: none.**

### 3b. Additional text pairs the screen actually produces

| Pair | Ratio | Result |
|---|---:|---|
| `--ink-2` / `--ground` | 7.51:1 | AAA |
| `--ink` / `--ground-2` | 15.11:1 | AAA |
| `--ink` / `--sunk` | 13.25:1 | AAA |
| `--ink` / `--other` | 12.50:1 | AAA |
| `--ink` / `--other-wash` | 14.47:1 | AAA |
| `--ink` / `--edit-wash` | 14.55:1 | AAA |
| `--ink` / `--temp-wash` | 14.41:1 | AAA |
| `--ink` / `--off-fill` | 7.10:1 | AAA |
| `--other-ink` / `--other` | 6.88:1 | AA |
| `--other-ink` / `--other-band` | 5.11:1 | AA |
| `--other-ink` / `--panel` | 8.79:1 | AAA |
| `--edit-ink` / `--edit-wash-2` | 9.29:1 | AAA |
| `--edit-ink` / `--panel` | 11.47:1 | AAA |
| `--action-ink` / `--panel` | 17.03:1 | AAA |
| `--warn-ink` / `--panel` | 8.15:1 | AAA |
| `--off-ink` / `--panel` | 10.82:1 | AAA |

### 3c. Non-text contrast (WCAG 1.4.11, 3:1)

| Pair | Ratio | Result |
|---|---:|---|
| `--edit` / `--other` | **11.96:1** | PASS — *the client's pair* |
| `--edit` / `--action` | **6.52:1** | PASS |
| `--other` / `--temp` | **3.75:1** | PASS |
| `--edit` / `--temp` | **3.19:1** | PASS — *was 1.78:1 and failing in rev 1* |
| `--edit` / `--panel` | **15.28:1** | PASS |
| `--edit` / `--ground-2` | **14.46:1** | PASS |
| `--edit` / `--edit-wash` | **13.92:1** | PASS |
| `--edit` / `--off-fill` | **6.79:1** | PASS |
| `--temp` / `--panel` | **4.80:1** | PASS |
| `--line` / `--panel` | **3.07:1** | PASS |
| `--line-soft` / `--panel` | **3.21:1** | PASS |
| `--line-dash` / `--panel` | **3.09:1** | PASS |
| `--off-line` / `--off-fill` | **3.10:1** | PASS |
| `--off-line` / `--panel` | **6.97:1** | PASS |
| `--other-line` / `--other` | **3.37:1** | PASS |
| `--other-line` / `--other-wash` | **3.90:1** | PASS |
| `--other-line` / `--panel` | **4.31:1** | PASS |
| `--edit-line` / `--edit-wash` | **3.88:1** | PASS |
| `--edit-line` / `--edit-wash-2` | **3.45:1** | PASS |
| `--edit-line` / `--panel` | **4.26:1** | PASS |
| `--warn-line` / `--warn-wash` | **3.55:1** | PASS |
| `--temp-line` / `--temp-wash` | **3.53:1** | PASS |
| `--temp-line` / `--panel` | **3.91:1** | PASS |
| `--action-ink` / `--panel` | **17.03:1** | PASS (the button rim) |
| `--off-fill` / `--ground-2` | 2.13:1 | below 3 — boundary carried by `--off-line` (6.97:1 vs panel) |
| `--off-fill` / `--panel` | 2.25:1 | below 3 — same, boundary carried by `--off-line` |
| `--action` / `--panel` | 2.34:1 | below 3 — **mitigated by the mandatory 1px `--action-ink` rim** (§6) |
| `--temp` / `--action` | 2.05:1 | below 3 — hue-separated, ΔE_ok ≥ 0.313 post-sim (§5) |
| `--other` / `--action` | 1.83:1 | below 3 — hue-separated, ΔE_ok ≥ 0.206 post-sim (§5) |
| `--other` / `--off-fill` | 1.76:1 | below 3 — carried by dashed border + strike-through (§4, §6) |
| `--other-band` / `--other-wash` | 1.56:1 | below 3 — decorative header fill, not a boundary (§6) |
| `--other-band` / `--other` | 1.35:1 | below 3 — same |
| `--other` / `--panel` | 1.28:1 | below 3 — boundary carried by `--other-line` (4.31:1 vs panel) |

Every boundary a user needs in order to *identify a control or a state* clears 3:1. The items
below 3 are fill-on-fill decoration, or cases where the boundary work is done by a border token
that passes, or the two documented hue-only pairs against `--action`.

---

## 4. WCAG 1.4.1 — what distinguishes each slot state besides colour

| State | Non-colour signal |
|---|---|
| **Editing** | Reversed polarity — **white text on a near-black fill**, the only chip in the grid drawn that way — plus the block's letter badge (`A`) in the chip and a filled 3px bar under the column header. In greyscale it is the darkest thing on the screen by a factor of 25. |
| **Other block** | Normal polarity (**dark text on a pale fill**), a **solid 1px border** at 3.37:1 against its own fill, its own letter badge (`B`, `C`…), and a 3px left rule inside the chip. |
| **Switched off** | **Dashed 1px border and a strike-through on the time label**, plus a `✕` glyph. Never faded — off is a choice the coach made, so it stays as visible as what it replaced. |
| **Empty day** | **No chip exists at all.** The column is a dashed panel spanning its full height carrying the literal words "No lessons", and the column header count reads `0`. |

**Greyscale behaviour, measured.** Luminance-only separation of the four states:
`--edit` Y 0.0158 · `--off-fill` Y 0.3973 · `--other` Y 0.7375 · `--ground-2` (empty) Y 0.9019.

| Greyscale pair | Ratio |
|---|---:|
| editing vs off | **6.79:1** |
| editing vs other | **11.96:1** |
| editing vs empty | **14.46:1** |
| off vs empty | **2.13:1** |
| off vs other | **1.76:1** |
| other vs empty | **1.21:1** |

Revision 2 is markedly better here than revision 1, where off/other measured 1.25:1 and
off/empty 1.30:1. Editing is now unmistakable in pure greyscale against every other state. The
two weak rows remain: for a monochrome or achromatopsic viewer, **off vs other and other vs
empty are carried entirely by border style, strike-through and the presence or absence of a
chip.** Remove the dash or the strike and those states merge. Those signals are mandatory, not
decorative. No hue anywhere is a sole signal.

---

## 5. Colour vision findings

Simulation: **Brettel, Viénot & Mollon (1997)**, the two-half-plane LMS projection, applied in
linear sRGB using the precomputed plane coefficients from libDaltonLens. Verified against known
reference behaviour before use: `#FF0000` → `#A48B00` under deuteranopia and `#6A5B0E` under
protanopia; `#00FF00` → `#F2D12E` / `#FFEE00`; Okabe–Ito bluish-green `#009E73` → `#8B8575`, the
documented near-grey of that palette. The implementation behaves as published.

Two metrics, answering different questions. **Contrast** (WCAG luminance ratio) answers *can
these be told apart with no hue perception at all* — the metric 1.4.11 actually uses. **ΔE_ok**
(Euclidean distance in Oklab after simulation) answers *does any chromatic difference survive*.
A pair is safe if it holds on the first; the second tells you how much margin residual hue adds.

### `--edit` vs `--other` — the pair the client raised

| Vision | Contrast | ΔE_ok | 1.4.11 (3:1) |
|---|---:|---:|---|
| Normal | **11.96:1** | 0.645 | PASS |
| Deuteranopia | **10.60:1** | 0.613 | PASS |
| Protanopia | **12.99:1** | 0.677 | PASS |
| Tritanopia | **11.90:1** | 0.648 | PASS |

Worst case **10.60:1**, more than three times the required floor. Simulated appearance —
`--edit` `#33035E` goes to `#00275E` (deutan), `#00175E` (protan), `#222222` (tritan);
`--other` `#9DEBFE` goes to `#CEDCFF`, `#DBE5FE`, `#9FEAFF`. Near-black against near-white in
every case. This pair cannot fail for anyone, including a fully monochromatic viewer.

### `--edit` vs `--action` — the pair the direction stands on

| Vision | Contrast | ΔE_ok | 1.4.11 (3:1) |
|---|---:|---:|---|
| Normal | **6.52:1** | 0.518 | PASS |
| Deuteranopia | **6.41:1** | 0.503 | PASS |
| Protanopia | **5.54:1** | 0.465 | PASS |
| Tritanopia | **6.52:1** | 0.516 | PASS |

Improved from revision 1's 3.39:1 protan worst case to **5.54:1**, because `--edit` moved down
to the dark rung. Protanopia remains the worst case — protans lose luminance at the long-wave
end, dragging the coral down — but the margin is now 85% above the floor rather than 13%.

### `--edit` vs `--temp` — the revision-1 failure, now fixed

| Vision | Contrast | ΔE_ok | 1.4.11 (3:1) |
|---|---:|---:|---|
| Normal | **3.19:1** | 0.322 | PASS |
| Deuteranopia | **3.32:1** | 0.316 | PASS |
| Protanopia | **3.44:1** | 0.328 | PASS |
| Tritanopia | **3.48:1** | 0.324 | PASS |

Was 1.78:1 / 1.56:1 protan and failing. Normal vision is now the *worst* case at 3.19:1;
simulation improves it. The margin is thin (6% above the floor) and it is bounded on both
sides — `--temp` must stay within Y ∈ [0.147, 0.200] to keep 3:1 from both `--edit` below and
`--other` above. It has no room to move.

### `--other` vs `--temp`

| Vision | Contrast | ΔE_ok | 1.4.11 (3:1) |
|---|---:|---:|---|
| Normal | **3.75:1** | 0.389 | PASS |
| Deuteranopia | **3.19:1** | 0.354 | PASS |
| Protanopia | **3.78:1** | 0.406 | PASS |
| Tritanopia | **3.42:1** | 0.340 | PASS |

### Pairs carried by hue rather than luminance

`--action` sits at Y 0.379, and as shown in §0 nothing but a very dark colour can be 3:1 from
it. `--edit` is; `--other` and `--temp` are not, and rely on being blue-pole against coral.

| Pair | Normal | Deutan | Protan | Tritan | ΔE_ok (min) |
|---|---:|---:|---:|---:|---:|
| `--other` vs `--action` | 1.83 | 1.65 | 2.34 | 1.82 | **0.206** |
| `--temp` vs `--action` | 2.05 | 1.93 | 1.61 | 1.87 | **0.270** |
| `--action` vs `--warn-ink` | 3.48 | 3.32 | 4.02 | 3.48 | 0.298 — clears 3:1 everywhere |
| `--other` vs `--off-fill` | 1.76 | 1.71 | 1.86 | 1.75 | 0.154 — carried by dash + strike |
| `--edit-ink` vs `--other-ink` | 1.31 | 1.08 | 1.45 | 1.31 | 0.092 — carried by weight + badge |

For reference, the rejected teal `--other` measured ΔE_ok **0.070** against `--action` under
protanopia. The chosen cyan measures **0.206** — three times the separation — because it sits
firmly on the blue pole rather than near the confusion line's neutral point.

### Text legibility after simulation

| Pair | Normal | Deutan | Protan | Tritan |
|---|---:|---:|---:|---:|
| `--on-edit` / `--edit` | 15.50 | 14.12 | 15.90 | 15.50 |
| `--action-ink` / `--action` | 7.27 | 7.69 | 6.30 | 7.27 |
| `--edit-ink` / `--edit-wash` | 10.45 | 8.98 | 10.83 | 10.45 |
| `--other-ink` / `--other-wash` | 7.96 | 8.09 | 7.71 | 7.94 |
| `--warn-ink` / `--warn-wash` | 7.29 | 6.51 | 9.95 | 7.29 |
| `--off-ink` / `--off-fill` | 4.81 | 4.82 | 4.80 | 4.81 |
| `--on-temp` / `--temp` | 4.87 | **4.25** | 4.62 | 4.46 |

Only `--on-temp`/`--temp` drops below 4.5 after simulation — to **4.25:1 under deuteranopia**.
Mitigation in §6.

---

## 6. Compromises, stated plainly

1. **Only three fills can be mutually ≥3:1, and there are four block-state roles.** Chaining
   the requirement upward from black gives Y = 0.00 → 0.10 → 0.40 → 1.30, and the fourth rung
   exceeds white. Revision 2 puts `--edit`, `--temp` and `--other` on the three real rungs and
   accepts that **`--action` cannot be luminance-separated from `--other` or `--temp`** — it
   relies on being the only warm hue on screen. That is a structural limit of sRGB, not a
   choice, and no rearrangement removes it.
2. **`--other` vs `--action` is 1.65:1 under deuteranopia, and `--temp` vs `--action` is 1.61:1
   under protanopia.** Both are below the 3:1 floor and both are carried by hue (ΔE_ok 0.206
   and 0.270). This is the price of the client's third hue: revision 1 spent its one
   luminance-protected slot on `--other`, revision 2 spends it on `--edit`. Mitigating factors
   are real but not measurable — `--action` is a single 48px button with a label and a rim, in
   the form column, never a slot chip. It is still a hue-only distinction and should be stated
   to the client as such.
3. **`--edit` vs `--temp` passes at 3.19:1 with only 6% margin, and `--temp` is boxed in.** It
   must stay within Y ∈ [0.147, 0.200]. Any future adjustment to `--temp`'s lightness breaks
   3:1 against `--edit` below it or `--other` above it. Pin the value.
4. **`--on-temp` on `--temp` falls to 4.25:1 under deuteranopia** — 5% under AA. `--temp` text
   must be set at ≥18.7px bold or ≥24px (target 3:1), or use `--ink` on `--temp-wash` instead.
   Small white body copy on solid `--temp` is not permitted.
5. **`--action` alone does not bound against `--panel`: 2.34:1.** The primary button requires a
   1px `--action-ink` rim. That rim is not styling — without it the button's boundary fails
   1.4.11. Enforce it in the component. Likewise **`--other` does not bound against `--panel`
   (1.28:1)** and requires its `--other-line` border (4.31:1 vs panel); a borderless pale-cyan
   chip on a near-white panel is invisible.
6. **`--off-fill` moved from L 0.880 to L 0.735** — a much darker grey than before. This was
   forced: the light rung now belongs to `--other`, so "off" had to move down to retain any
   luminance distance from it. It still only reaches 1.76:1 against `--other`, so **dashed
   border and strike-through remain mandatory**, and the switched-off chip is now visually
   heavier than the client has seen. Show them this before it ships.
7. **`--other` vs empty day is 1.21:1 in greyscale.** A pale cyan chip on a near-white column.
   Distinguished only by the chip's border and its presence. Acceptable because "empty" means
   there is no chip to confuse, but it is a shape-only distinction.
8. **`--ink-4` is 3.55:1, not 4.5:1.** Scoped to disabled states and decoration, which 1.4.3
   exempts. Making it AA-legal would collapse it into `--ink-3`.
9. **`--other-band` sits at 1.56:1 on `--other-wash` and 1.35:1 on `--other`.** Decorative
   header fill; the text on it (`--other-ink`, 5.11:1) does the work.
10. **`--line-soft` (L 0.640) is fractionally darker than `--line` (L 0.652)**, contradicting
    its name. Field borders are the most functionally critical rule on the screen and had to
    clear 3:1 with margin; renaming the token was out of scope. Document it or the next person
    will "fix" it backwards.
11. **All three line tokens are heavier than the pre-revision palette** (L 0.65 vs L 0.88–0.90).
    That is the cost of 1.4.11 on a near-white panel. A UX gain in car-park lighting, but a
    visible aesthetic change.
12. **`--edit-ink` vs `--other-ink` is 1.08:1 under deuteranopia** (ΔE_ok 0.092). Two dark
    accent texts — "Block A (editing)" vs "Block B" — distinguished by weight and badge only.
    Mandatory signals.
13. **The three pale washes are near-identical after simulation.** `--edit-wash` (violet),
    `--other-wash` (cyan) and `--temp-wash` (blue) are all L ≈ 0.95 and all blue-pole; a
    dichromat cannot tell the tinted columns apart by tint. Each is always accompanied by its
    own border token and a labelled column header, which is what actually identifies it.
14. **Light theme only.** A dark theme would need its own verification pass — the rungs invert
    and every ratio in §3 has to be re-measured. Not delivered here.

---

## Appendix A — the verifier

Reproduces every number above. `python3 verify.py`.

```python
import math

M_OKLAB_TO_LMSp = [[1.0, 0.3963377774, 0.2158037573],
                   [1.0,-0.1055613458,-0.0638541728],
                   [1.0,-0.0894841775,-1.2914855480]]
M_LMS_TO_LRGB   = [[ 4.0767416621,-3.3077115913, 0.2309699292],
                   [-1.2684380046, 2.6097574011,-0.3413193965],
                   [-0.0041960863,-0.7034186147, 1.7076147010]]
M_LRGB_TO_LMS   = [[0.4122214708,0.5363325363,0.0514459929],
                   [0.2119034982,0.6806995451,0.1073969566],
                   [0.0883024619,0.2817188376,0.6299787005]]
M_LMSp_TO_OKLAB = [[0.2104542553, 0.7936177850,-0.0040720468],
                   [1.9779984951,-2.4285922050, 0.4505937099],
                   [0.0259040371, 0.7827717662,-0.8086757660]]

def mv(M, v): return [sum(M[i][j]*v[j] for j in range(3)) for i in range(3)]
def clamp(v): return [max(0.0, min(1.0, c)) for c in v]

def oklch_to_linear(L, C, H):
    h = math.radians(H)
    lms = [x**3 for x in mv(M_OKLAB_TO_LMSp, [L, C*math.cos(h), C*math.sin(h)])]
    return mv(M_LMS_TO_LRGB, lms)

def encode(c):
    c = max(0.0, min(1.0, c))
    return 12.92*c if c <= 0.0031308 else 1.055*(c**(1/2.4)) - 0.055
def decode(s):
    return s/12.92 if s <= 0.04045 else ((s+0.055)/1.055)**2.4

def in_gamut(L, C, H, tol=1e-4):
    return all(-tol <= c <= 1+tol for c in oklch_to_linear(L, C, H))

def Y_linear(lin):
    r, g, b = clamp(lin)
    return 0.2126*r + 0.7152*g + 0.0722*b

def Y(L, C, H):                       # WCAG luminance of the *painted* 8-bit colour
    srgb = [encode(c) for c in oklch_to_linear(L, C, H)]
    return Y_linear([decode(s) for s in srgb])

def ratio(ya, yb):
    hi, lo = max(ya, yb), min(ya, yb)
    return (hi + 0.05) / (lo + 0.05)

def contrast(a, b):        return ratio(Y(*a), Y(*b))
def contrast_lin(la, lb):  return ratio(Y_linear(la), Y_linear(lb))

# Brettel/Vienot/Mollon 1997, precomputed for sRGB primaries (libDaltonLens).
BRETTEL = {
 "protan": dict(m1=[0.14510,1.20165,-0.34675, 0.10447,0.85316,0.04237, 0.00429,-0.00603,1.00174],
                m2=[0.14115,1.16782,-0.30897, 0.10495,0.85730,0.03776, 0.00431,-0.00586,1.00155],
                n=[0.00048, 0.00416,-0.00464]),
 "deutan": dict(m1=[0.36198,0.86755,-0.22953, 0.26099,0.64512,0.09389,-0.01975, 0.02686,0.99289],
                m2=[0.37009,0.88540,-0.25549, 0.25767,0.63782,0.10451,-0.01950, 0.02741,0.99209],
                n=[-0.00293,-0.00645,0.00938]),
 "tritan": dict(m1=[1.01354,0.14268,-0.15622,-0.01181,0.87561,0.13619, 0.07707, 0.81208,0.11085],
                m2=[0.93337,0.19999,-0.13336, 0.05809,0.82565,0.11626,-0.37923, 1.13825,0.24098],
                n=[0.03960,-0.02831,-0.01129]),
}

def simulate(oklch, kind):
    p = BRETTEL[kind]
    v = clamp(oklch_to_linear(*oklch))
    m = p["m1"] if sum(v[i]*p["n"][i] for i in range(3)) >= 0 else p["m2"]
    return clamp(mv([m[0:3], m[3:6], m[6:9]], v))

def lin_to_oklab(lin):
    lms  = mv(M_LRGB_TO_LMS, clamp(lin))
    lmsp = [math.copysign(abs(x)**(1/3), x) for x in lms]
    return mv(M_LMSp_TO_OKLAB, lmsp)

def dE_ok(la, lb):
    a, b = lin_to_oklab(la), lin_to_oklab(lb)
    return math.sqrt(sum((a[i]-b[i])**2 for i in range(3)))

T = {
 "--ground":(0.945,0.007,248),   "--panel":(0.985,0.003,248),
 "--ground-2":(0.966,0.005,248), "--sunk":(0.922,0.009,248),
 "--line":(0.652,0.020,248), "--line-soft":(0.640,0.024,248), "--line-dash":(0.650,0.022,248),
 "--ink":(0.235,0.033,256),  "--ink-2":(0.410,0.030,256),
 "--ink-3":(0.515,0.027,256),"--ink-4":(0.615,0.023,256),
 "--edit":(0.270,0.140,300), "--on-edit":(0.990,0.002,248),
 "--edit-wash":(0.955,0.022,300), "--edit-wash-2":(0.918,0.044,300),
 "--edit-line":(0.600,0.245,300), "--edit-ink":(0.360,0.185,300),
 "--other":(0.896,0.081,215), "--other-wash":(0.948,0.038,215),
 "--other-line":(0.560,0.094,215), "--other-ink":(0.395,0.068,215),
 "--other-band":(0.800,0.135,215),
 "--action":(0.740,0.152,36), "--action-ink":(0.215,0.060,36),
 "--off-fill":(0.735,0.004,248), "--off-line":(0.455,0.008,248), "--off-ink":(0.350,0.014,256),
 "--warn-wash":(0.950,0.024,22), "--warn-line":(0.610,0.180,22), "--warn-ink":(0.440,0.170,22),
 "--temp":(0.555,0.232,262), "--temp-wash":(0.950,0.023,262),
 "--temp-line":(0.600,0.205,262), "--on-temp":(0.990,0.002,248),
}

if __name__ == "__main__":
    print("out of gamut:", [k for k, v in T.items() if not in_gamut(*v)] or "none")
    required = [("--ink","--panel",4.5),("--ink","--ground",4.5),("--ink-2","--panel",4.5),
                ("--ink-3","--panel",4.5),("--ink-4","--panel",3.0),("--on-edit","--edit",4.5),
                ("--action-ink","--action",4.5),("--edit-ink","--edit-wash",4.5),
                ("--other-ink","--other-wash",4.5),("--off-ink","--off-fill",4.5),
                ("--warn-ink","--warn-wash",4.5),("--on-temp","--temp",4.5)]
    for a, b, t in required:
        r = contrast(T[a], T[b])
        print(f"{a:>14}/{b:<14}{r:6.2f}:1 target {t}  "
              f"{'PASS' if r >= t else 'FAIL'}  "
              f"{'AAA' if r >= 7 else 'AA' if r >= 4.5 else 'UI/large' if r >= 3 else '-'}")
    for a, b in [("--edit","--other"), ("--edit","--action"),
                 ("--edit","--temp"), ("--other","--temp"), ("--other","--action")]:
        for k in ["normal","deutan","protan","tritan"]:
            la = oklch_to_linear(*T[a]) if k == "normal" else simulate(T[a], k)
            lb = oklch_to_linear(*T[b]) if k == "normal" else simulate(T[b], k)
            print(f"{a}/{b} {k:<7} {contrast_lin(la, lb):5.2f}:1  dEok {dE_ok(la, lb):.3f}")
```

## Appendix B — the hue sweep that drove the rebuild

Reproduces the finding in §0: at mid lightness, no hue separates from `--action` by luminance,
and the hues far enough from `--edit` to satisfy a trichromat collapse onto coral for a
dichromat. Requires Appendix A in the same directory as `verify.py`.

```python
from verify import *

ACTION = T["--action"]

def maxC(L, H):                      # binary-search the sRGB gamut boundary
    lo, hi = 0.0, 0.45
    for _ in range(40):
        mid = (lo + hi) / 2
        if in_gamut(L, mid, H): lo = mid
        else: hi = mid
    return lo * 0.97

print("hue   C      minContrast  minDEok   (worst of deutan/protan/tritan vs --action)")
for H in range(140, 366, 10):
    C = min(0.13, maxC(0.635, H)); O = (0.635, C, H)
    sims = [(contrast_lin(simulate(O, k), simulate(ACTION, k)),
             dE_ok(simulate(O, k), simulate(ACTION, k))) for k in ("deutan","protan","tritan")]
    print(f"{H:3d}  {C:.3f}    {min(s[0] for s in sims):5.2f}      {min(s[1] for s in sims):.3f}")

print("\n3:1 ladder from black — minimum luminance of each rung:")
y = 0.0
for i in range(5):
    print(f"  rung {i}: Y >= {y:.3f}" + ("   EXCEEDS WHITE" if y > 1.0 else ""))
    y = 3 * (y + 0.05) - 0.05
```
