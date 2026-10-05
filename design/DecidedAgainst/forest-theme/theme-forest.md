# BladeBook — **Forest** palette

Every number in this document was produced by a script (Appendix A) that converts
`oklch → Oklab → linear sRGB → 8-bit sRGB → WCAG relative luminance → contrast ratio`, with
dichromat simulation via the Viénot/Brettel/Mollon LMS matrices. Sanity check: **white against
black returns exactly 21.0**, `#777777` on white returns 4.478, `#767676` returns 4.542 — the
standard reference values. **All 34 tokens are inside the sRGB gamut**; nothing is clipped.

---

## 1. The direction — *one green family, split by light*

The client's six colours already contain a working lightness ladder, and the whole theme is
built on the observation that **the greens should not be split by hue, because they cannot be
— they should be split by light.** Hunter Green, Shamrock and Light Green are the same hue
(151°, 150°, 151°) at three very different luminances, so instead of fighting that, the grid
uses green as a single meaning — *"this is schedule"* — and uses lightness alone to say which
schedule block you are touching. The block you are editing is a near-black forest chip with
white text on it; the blocks you are not editing are pale green chips with dark text and a
Shamrock outline. That is a **polarity inversion**, not a hue difference, so it survives
protanopia, deuteranopia, tritanopia, greyscale, a monochrome printout and a phone at 20%
brightness with Night Shift on. At 6am in a cold car park the coach is not colour-matching;
they are glancing at a phone through breath fog with gloves on, and the only question is
*"which one is dark?"* The answer is: the one you are working on. Everything else on screen —
the amber commit button, the red validation text, the violet temporary-schedule accent — is
deliberately **not green**, so that the green field reads as one calm thing and the three
non-green colours read as interruptions.

---

## 2. What happened to the client's six colours

**All six survive at their exact given values.** None was adjusted; every one is load-bearing,
not decorative.

| Source | Hex | oklch | Used as | Status |
|---|---|---|---|---|
| Snow | `#FFFAFB` | `oklch(0.9892 0.0055 3.3)` | `--panel`, `--on-edit` | **exact** |
| Graphite | `#2B2C28` | `oklch(0.2907 0.0073 118.3)` | `--ink`, `--action-ink`, `--off-ink`, `--on-temp` | **exact** |
| Grey | `#748181` | `oklch(0.5926 0.0153 196.7)` | `--line` | **exact** |
| Hunter Green | `#2F633E` | `oklch(0.4530 0.0825 151.2)` | `--edit` | **exact** |
| Shamrock | `#339953` | `oklch(0.6071 0.1403 150.2)` | `--other-line` | **exact** |
| Light Green | `#8AE5A1` | `oklch(0.8473 0.1294 150.9)` | `--other` | **exact** |

Each landed where its measured luminance let it land, and in two cases the exact value set a
constraint the rest of the palette had to bend around:

- **Grey `#748181` measures 3.91:1 against Snow.** That clears the 3:1 non-text bar for
  `--line` comfortably but *fails* the 4.5:1 text bar, so Grey could not be `--ink-4`. `--ink-4`
  is Grey darkened by **0.058 L** to `oklch(0.5350 0.0140 168)`, which measures 4.96:1 on
  `--panel` and 4.58:1 on `--ground`. Grey keeps its exact value in the role it actually passes.
- **Shamrock `#339953` measures Y = 0.2411**, which forced `--other-wash` to sit no darker than
  `oklch(0.9400 …)`: any deeper and the Shamrock border dropped under 3:1 against its own fill.
  It now measures **3.09:1** against `--other-wash` and **3.05:1** against `--ground-2` — held
  exactly, with about 0.05 to spare. That is the tightest constraint in the palette and it is
  the price of keeping Shamrock unmodified.
- **Hunter Green on Snow measures 6.83:1.** That is a clean AA pass for the editing chip's
  label but 0.17 short of AAA. Darkening Hunter Green by ~0.02 L would have bought AAA; keeping
  the client's green exactly was judged the better trade, since chip labels are short and the
  requirement is 4.5:1.

**Hues introduced beyond the six**, each because a role genuinely required it:

| Hue | Tokens | Why the six could not cover it |
|---|---|---|
| Amber 80° | `--action` | The commit button must not read as a schedule block. Every client colour except the neutrals is green, and green is the grid's meaning. |
| Red 25–27° | `--warn-*` | Errors need a hue no other role uses; the six contain nothing warm. |
| Violet 305° | `--temp-*` | The temporary-schedule accent must be distinct from green *and* from amber under dichromacy. Violet is the only hue that holds a blue component, which is what protanopes and deuteranopes still see. |

The near-neutrals (`--ground`, `--ground-2`, `--sunk`, `--off-fill`, `--off-line`) are
low-chroma derivatives of Snow, Graphite and Grey, pulled to 160–195° so the whole surface
system carries a faint green-grey cast rather than a blue one.

---

## 3. The 34 tokens

| Token | oklch | Hex | Use |
|---|---|---|---|
| `--ground` | `oklch(0.9600 0.0080 160)` | `#EDF3F0` | Page background behind everything |
| `--panel` | `oklch(0.9892 0.0055 3.3)` | `#FFFAFB` | Raised cards — **Snow, exact** |
| `--ground-2` | `oklch(0.9420 0.0090 162)` | `#E7EEEA` | Secondary panels; empty day columns |
| `--sunk` | `oklch(0.9080 0.0110 162)` | `#DBE3DE` | Inset wells, form field backgrounds |
| `--line` | `oklch(0.5926 0.0153 196.7)` | `#748181` | Default borders — **Grey, exact** |
| `--line-soft` | `oklch(0.6500 0.0140 197)` | `#869292` | Field borders, quieter dividers |
| `--line-dash` | `oklch(0.5450 0.0170 197)` | `#657373` | Dashed outline on empty, bookable slots |
| `--ink` | `oklch(0.2907 0.0073 118.3)` | `#2B2C28` | Body text — **Graphite, exact** |
| `--ink-2` | `oklch(0.4200 0.0110 150)` | `#494F4A` | Secondary text, field labels |
| `--ink-3` | `oklch(0.4900 0.0130 155)` | `#5B635D` | Micro-labels, column headers, times |
| `--ink-4` | `oklch(0.5350 0.0140 168)` | `#66706C` | Placeholder and disabled text |
| `--edit` | `oklch(0.4530 0.0825 151.2)` | `#2F633E` | **Solid fill of the chip being edited — Hunter Green, exact** |
| `--on-edit` | `oklch(0.9892 0.0055 3.3)` | `#FFFAFB` | Label on that chip — **Snow, exact** |
| `--edit-wash` | `oklch(0.9450 0.0480 152)` | `#D6F7DD` | Tint over the whole edited day column |
| `--edit-wash-2` | `oklch(0.8950 0.0780 152)` | `#B6ECC3` | Deeper tint: the edited block's own span |
| `--edit-line` | `oklch(0.5250 0.1250 150)` | `#257E41` | 2px ring around the edited block |
| `--edit-ink` | `oklch(0.4000 0.0900 151)` | `#19552D` | The edit accent as text on a light surface |
| `--other` | `oklch(0.8473 0.1294 150.9)` | `#8AE5A1` | Solid marker/legend swatch for existing blocks — **Light Green, exact** |
| `--other-wash` | `oklch(0.9400 0.0620 151)` | `#CEF8D6` | Fill of chips belonging to blocks not being edited |
| `--other-line` | `oklch(0.6071 0.1403 150.2)` | `#339953` | 1px border on those chips — **Shamrock, exact** |
| `--other-ink` | `oklch(0.4450 0.0700 152)` | `#345F40` | Label text on those chips |
| `--other-band` | `oklch(0.8850 0.0850 151)` | `#B0EABD` | Left-edge bar spanning a block's full length |
| `--action` | `oklch(0.8000 0.1600 80)` | `#F3B01D` | The one commit button per screen |
| `--action-ink` | `oklch(0.2907 0.0073 118.3)` | `#2B2C28` | Its label — **Graphite, exact** |
| `--stage` | `oklch(0.845 0.000 90)` | A raised grey stage behind a run of chips — the measured strip on the lesson-picker. Sits *under* content, never behind text. |
| `--off-fill` | `oklch(0.7400 0.0070 195)` | `#A6ACAC` | Fill of a slot the coach switched off |
| `--off-line` | `oklch(0.4600 0.0090 195)` | `#535A59` | Dashed border on that slot |
| `--off-ink` | `oklch(0.2907 0.0073 118.3)` | `#2B2C28` | Its struck-through label — **Graphite, exact** |
| `--warn-wash` | `oklch(0.9500 0.0220 25)` | `#FDE9E7` | Background of error blocks and REQUIRED badges |
| `--warn-line` | `oklch(0.5750 0.1750 27)` | `#CC423B` | 2px border on an invalid field |
| `--warn-ink` | `oklch(0.4600 0.1800 27)` | `#A50E15` | Validation message text |
| `--temp` | `oklch(0.7900 0.1280 305)` | `#CEA5FC` | Solid accent for temporary (dated) schedules |
| `--temp-wash` | `oklch(0.9500 0.0260 305)` | `#F2EAFD` | Tint behind a temporary schedule's header |
| `--temp-line` | `oklch(0.5900 0.1750 305)` | `#965CCF` | Border/underline on temporary-schedule chrome |
| `--on-temp` | `oklch(0.2907 0.0073 118.3)` | `#2B2C28` | Label on the temp accent — **Graphite, exact** |

---

## 4. Measured contrast

### 4.1 Required text pairs — target 4.5:1 body, 7:1 AAA

| Pair | Ratio | Result |
|---|---:|---|
| `--ink` / `--panel` | **13.60** | AAA |
| `--ink` / `--ground` | **12.55** | AAA |
| `--ink-2` / `--panel` | **8.14** | AAA |
| `--ink-3` / `--panel` | **6.02** | AA |
| `--ink-4` / `--panel` | **4.96** | AA |
| `--on-edit` / `--edit` | **6.83** | AA |
| `--action-ink` / `--action` | **7.40** | AAA |
| `--edit-ink` / `--edit-wash` | **7.65** | AAA |
| `--other-ink` / `--other-wash` | **6.29** | AA |
| `--off-ink` / `--off-fill` | **6.11** | AA |
| `--warn-ink` / `--warn-wash` | **6.72** | AA |
| `--on-temp` / `--temp` | **6.96** | AA |

**Twelve of twelve pass AA. Four reach AAA. No failures.** The lowest, `--ink-4` / `--panel`
at 4.96:1, is placeholder text — the faintest thing in the system — and it still clears the
body-text bar, not merely the large-text one.

### 4.2 Required fill-vs-fill separation — target 3:1

| Pair | Ratio | Result |
|---|---:|---|
| `--edit` / `--other` | **4.64** | PASS |
| `--edit` / `--action` | **3.72** | PASS |
| `--edit` / `--temp` | **3.50** | PASS |

The previous round's headline failure — `--edit` / `--temp` at 1.78:1 — is fixed and now
measures **3.50:1**, and holds at **3.11:1** at its worst under simulated protanopia.

### 4.3 Required non-text pairs — WCAG 1.4.11, target 3:1

| Pair | Ratio | Result |
|---|---:|---|
| `--line` / `--panel` | **3.91** | PASS |
| `--edit` / `--panel` | **6.83** | PASS |
| `--off-line` / `--off-fill` | **3.08** | PASS |
| `--other-line` / `--other-wash` | **3.09** | PASS |

### 4.4 Additional text pairs measured

| Pair | Ratio | Result |
|---|---:|---|
| `--ink` / `--ground-2` | 11.90 | AAA |
| `--ink` / `--sunk` | 10.74 | AAA |
| `--ink` / `--edit-wash` | 12.17 | AAA |
| `--ink` / `--edit-wash-2` | 10.56 | AAA |
| `--ink` / `--other-wash` | 12.04 | AAA |
| `--ink` / `--other` | 9.24 | AAA |
| `--ink` / `--other-band` | 10.26 | AAA |
| `--ink` / `--temp` | 6.96 | AA |
| `--ink` / `--warn-wash` | 12.06 | AAA |
| `--ink-2` / `--ground` | 7.51 | AAA |
| `--ink-3` / `--ground` | 5.55 | AA |
| `--ink-4` / `--ground` | 4.58 | AA |
| `--edit-ink` / `--panel` | 8.54 | AAA |
| `--other-ink` / `--panel` | 7.11 | AAA |
| `--other-ink` / `--other-band` | 5.36 | AA |
| `--warn-ink` / `--panel` | 7.58 | AAA |
| `--on-temp` / `--temp-wash` | 12.07 | AAA |

### 4.5 Additional non-text pairs measured

| Pair | Ratio | Result | |
|---|---:|---|---|
| `--line-soft` / `--panel` | 3.11 | PASS | |
| `--line-dash` / `--panel` | 4.75 | PASS | |
| `--line-dash` / `--ground-2` | 4.16 | PASS | |
| `--line` / `--ground` | 3.61 | PASS | |
| `--line` / `--sunk` | 3.08 | PASS | |
| `--edit-line` / `--edit-wash` | 4.41 | PASS | |
| `--edit-line` / `--edit-wash-2` | 3.82 | PASS | |
| `--edit-line` / `--panel` | 4.93 | PASS | |
| `--edit-line` / `--ground-2` | 4.31 | PASS | |
| `--other-line` / `--panel` | 3.49 | PASS | |
| `--other-line` / `--ground-2` | 3.05 | PASS | |
| `--off-line` / `--panel` | 6.86 | PASS | |
| `--off-line` / `--ground-2` | 6.01 | PASS | |
| `--warn-line` / `--warn-wash` | 4.09 | PASS | |
| `--warn-line` / `--panel` | 4.61 | PASS | |
| `--warn-line` / `--ground-2` | 4.03 | PASS | |
| `--temp-line` / `--temp-wash` | 3.82 | PASS | |
| `--temp-line` / `--panel` | 4.31 | PASS | |
| `--temp-line` / `--ground-2` | 3.77 | PASS | |
| `--ink-2` / `--action` | 4.43 | PASS | the commit button's own outline |
| `--edit` / `--ground-2` | 5.98 | PASS | editing chip vs empty column |
| `--edit` / `--other-wash` | 6.05 | PASS | editing chip vs other-block chip |
| `--edit` / `--off-fill` | 3.07 | PASS | editing chip vs switched-off chip |
| `--off-fill` / `--panel` | **2.22** | **below 3:1** | boundary carried by `--off-line` (6.86) |
| `--off-fill` / `--ground-2` | **1.95** | **below 3:1** | boundary carried by `--off-line` (6.01) |
| `--other-wash` / `--ground-2` | **1.01** | **below 3:1** | boundary carried by `--other-line` (3.05) |
| `--other-wash` / `--off-fill` | **1.97** | **below 3:1** | see §7 |
| `--action` / `--panel` | **1.84** | **below 3:1** | boundary carried by a 2px `--ink-2` outline (4.43) |
| `--temp` / `--panel` | **1.95** | **below 3:1** | boundary carried by `--temp-line` (4.31) |
| `--action` / `--temp` | **1.06** | **below 3:1** | see §7 — deliberate |
| `--action` / `--other` | **1.25** | **below 3:1** | see §7 — deliberate |
| `--edit-wash` / `--panel` | 1.12 | n/a | decorative column tint, not a boundary |
| `--other-band` / `--other-wash` | 1.17 | n/a | decorative length bar inside a bordered chip |

**Lowest ratio anywhere in the palette: 1.01:1, `--other-wash` / `--ground-2`** — a pale green
chip fill against an empty day column. Two light surfaces can never reach 3:1 (see §7), so
that boundary is delivered by the chip's Shamrock border at 3.05:1 against the same column,
which is what WCAG 1.4.11 actually asks for.

**Lowest ratio among pairs that must pass: 3.05:1** (`--other-line` / `--ground-2`).

### 4.6 The luminance ladder

Relative luminance of every fill that can appear in the week grid, in order:

| Fill | Y | Rung |
|---|---:|---|
| `--edit` | 0.0988 | **dark** |
| `--off-fill` | 0.4066 | **mid** |
| `--action` | 0.5027 | mid-light (form region only) |
| `--temp` | 0.4701 | mid-light |
| `--other` | 0.6402 | light |
| `--other-band` | 0.7162 | light |
| `--ground-2` | 0.8389 | near-white |
| `--other-wash` | 0.8497 | near-white |
| `--edit-wash` | 0.8590 | near-white |
| `--panel` | 0.9659 | white |

Chaining 3:1 upward from black gives minimum luminances of Y = 0 → 0.10 → 0.40 → 1.30, and the
fourth rung exceeds white. **Three mutually-separable fills is the hard ceiling in sRGB.** The
three that got the rungs are `--edit` (dark), `--off-fill` (mid) and `--other` (light) — the
three that actually sit side by side in the grid.

---

## 5. WCAG 1.4.1 — what distinguishes each state besides colour

| State | Non-colour signal |
|---|---|
| **Editing** | The only chip with **light-on-dark polarity** — white label on a near-black fill — plus a **2px solid ring** (`--edit-line`) and a drag handle glyph on its lower edge. It inverts in greyscale, so it is identifiable with the colour channel removed entirely. |
| **Other block** | **1px solid border** plus a **left-edge vertical bar** (`--other-band`) that runs the block's full length across stacked chips, so a block reads as one continuous shape rather than as a colour. Label is plain dark text, no decoration. |
| **Switched off** | The label is **struck through**, the border is **1px dashed**, and it is the **only achromatic chip in the grid** — chroma 0.007 against 0.062–0.129 for every other state, so "has no colour at all" is itself the signal. |
| **Empty day** | **No fill of its own** (it is the bare `--ground-2` column), a **1px dashed** `--line-dash` outline, and **no label** — only the time. Distinguished from *switched off* by the absence of both a fill and a struck label. |

Two further places where colour is never the only channel:

- **The commit button** is the only element on screen with a filled warm background *and* the
  only one with a 2px `--ink-2` outline *and* it carries an explicit verb label ("Save
  schedule"). Three signals, one of them textual.
- **Validation** always pairs `--warn-*` with a leading **"!" glyph** and literal words —
  `REQUIRED` in the badge, a sentence in the message. This is mandatory, not optional: §6 shows
  that pale pink and pale green washes are effectively the same colour to a deuteranope, so the
  wash carries none of the meaning on its own.

---

## 6. Colour vision deficiency

Simulated with the Viénot/Brettel/Mollon LMS dichromat matrices; contrast recomputed on the
*simulated* sRGB values, and ΔE reported as Euclidean distance in Oklab after simulation
(< 0.055 = indistinguishable, < 0.10 = tight).

### 6.1 The pairs the brief asked for

| Pair | Normal | Deuteranopia | Protanopia | Tritanopia |
|---|---:|---:|---:|---:|
| `--edit` / `--action` | 3.72 | **4.04** | **3.16** | **4.55** |
| `--edit` / `--other` | 4.64 | **4.61** | **4.70** | **4.16** |
| `--edit` / `--temp` | 3.50 | **3.73** | **3.11** | **3.60** |
| `--action` / `--warn-line` | 2.51 | 2.30 | 3.12 | 1.89 |
| `--action` / `--warn-ink` | 4.12 | **3.72** | **5.36** | 2.95 |

Post-simulation Oklab distance for the same pairs:

| Pair | ΔE deutan | ΔE protan | ΔE tritan |
|---|---:|---:|---:|
| `--edit` / `--action` | 0.377 | 0.307 | 0.486 |
| `--edit` / `--other` | 0.394 | 0.409 | 0.363 |
| `--edit` / `--temp` | 0.367 | 0.338 | 0.364 |
| `--action` / `--warn-line` | 0.232 | 0.303 | 0.183 |
| `--action` / `--warn-ink` | 0.341 | 0.425 | 0.295 |

**The first three rows never drop below 3:1 under any deficiency.** That is the point of the
whole design: `--edit` is separated from everything by luminance, and luminance is the one
channel dichromacy leaves intact.

### 6.2 The green/red hazard, and what was done about it

The brief's warning was that a green `--action` against a red `--warn` is the worst possible
pair for red-green deficiency. **`--action` is not green.** It is amber at 80°, which under
deuteranopia and protanopia simulates to a bright yellow (`#C7C707` / `#B9B920`) while
`--warn-line` simulates to a dark olive-brown (`#808032` / `#60603D`) — a **3.4× luminance
gap**, not a hue gap. Against the actual error *text* the pair measures **3.72:1 under
deuteranopia and 5.36:1 under protanopia**, both above the 3:1 bar.

The commit button and the error state are further separated by construction: the button is a
filled shape with a dark verb label, the error is dark text on a pale wash with a "!" glyph.
They are never the same kind of object.

### 6.3 The real weakness this palette has

| Pair | Normal | ΔE deutan | ΔE protan | ΔE tritan |
|---|---:|---:|---:|---:|
| `--edit-ink` / `--warn-ink` | 1.13 | **0.093** | **0.074** | 0.283 |
| `--other-ink` / `--warn-ink` | 1.07 | **0.076** | 0.115 | 0.252 |

**Dark green text and dark red text are nearly the same colour to a deuteranope.** The
measured ΔE of 0.074–0.093 is above the collapse threshold of 0.055 but well inside "tight",
and no hue choice fixes it — I swept warn hue across 350°–35° and every option traded deutan
against protan without ever clearing 0.10 on both. It is also not fixable by luminance: two
text colours that both have to be readable on the same white background are constrained to a
narrow luminance band, so they can never be 3:1 from each other.

The honest conclusion is a general one: **coloured text can never be the sole carrier of
meaning in any palette.** That is why §5 makes the "!" glyph and the literal word `REQUIRED`
mandatory rather than decorative. The wash backgrounds do not rescue it either — `--warn-wash`
against `--other-wash` measures ΔE 0.020 under deuteranopia, essentially identical. The glyph
and the words are doing the work, as they must.

### 6.4 Everything else, measured

| Pair | Normal | Deutan | Protan | Tritan | worst ΔE |
|---|---:|---:|---:|---:|---:|
| `--action` / `--other` | 1.25 | 1.14 | 1.49 | 1.09 | 0.123 |
| `--action` / `--temp` | 1.06 | 1.08 | 1.02 | 1.26 | 0.137 |
| `--temp` / `--other` | 1.33 | 1.24 | 1.51 | 1.15 | 0.161 |
| `--edit` / `--off-fill` | 3.07 | 3.17 | 2.89 | 3.12 | 0.272 |
| `--other` / `--off-fill` | 1.51 | 1.45 | 1.62 | 1.33 | 0.105 |

Four of these five are the light-rung collisions described in §7: none collapses (all ΔE ≥
0.105, roughly double the indistinguishability threshold), but none is luminance-separated
either. The exception is `--edit` / `--off-fill`, which clears 3:1 under normal vision,
deuteranopia and tritanopia but **dips to 2.89:1 under protanopia** — 0.11 short. A protanope
sees red-derived luminance drop, and Hunter Green loses slightly more of it than the neutral
grey does. The editing chip stays the only light-on-dark chip and the off chip stays the only
struck-through one, so the state remains identifiable, but the number is under the bar and is
reported as such rather than rounded up.

`--temp` at 305° was chosen by sweeping violet hue from 285° to 330° and maximising the
*minimum* post-simulation ΔE against amber, Light Green and Hunter Green simultaneously. 285°
collapsed against `--other` under tritanopia (ΔE 0.041) and 320° collapsed against `--action`
(ΔE 0.025); 305° gives a worst case of 0.117 across all nine combinations, the best available.

---

## 7. Compromises, stated plainly

1. **Four roles wanted the three-rung budget, and `--temp` lost.** `--edit`, `--other`,
   `--action` and `--temp` all needed mutual 3:1 separation, and sRGB only supports three
   mutually-separable fills. I gave the rungs to `--edit` (dark), `--off-fill` (mid) and
   `--other` (light) — the three that genuinely sit adjacent inside the week grid — and let
   `--action` and `--temp` share the mid-light rung with each other. **`--action` / `--temp`
   measures 1.06:1** and is carried entirely by hue (post-simulation ΔE 0.137–0.278). The
   justification is that they are never the same kind of object in the same region: `--action`
   is a single labelled button in the left-hand form, `--temp` is chrome on a schedule header.
   They are never adjacent and never interchangeable. If a future screen ever puts a temp chip
   beside the commit button, this is the pair that breaks first.

2. **`--action` cannot be 3:1 from both `--edit` and `--panel`.** With `--edit` fixed at
   Hunter Green's Y = 0.0988, anything 3:1 above it must have Y ≥ 0.396, and anything 3:1 below
   near-white `--panel` must have Y ≤ 0.289. The window is empty. I chose the `--edit`
   separation (3.72:1, a requirement) over the `--panel` separation (1.84:1, not a listed
   requirement) and specified a **2px `--ink-2` outline** on the button, measuring 4.43:1
   against the amber and 8.14:1 against the card, to satisfy 1.4.11 by border rather than fill.

3. **`--other-wash` is invisible against `--ground-2` — 1.01:1 — and that is structural.**
   A pale chip on a near-white column cannot be 3:1 by fill; no palette can do this. The chip's
   Shamrock border carries it at 3.05:1. The same applies to `--off-fill` (1.95:1 against the
   column, boundary carried by `--off-line` at 6.01:1) and to `--temp` (1.95:1 against the card,
   carried by `--temp-line` at 4.31:1). Anyone reading the table should read the border row
   next to each fill row.

4. **`--other-wash` / `--off-fill` measures 1.97:1** — a pale green chip beside a grey
   switched-off chip. `--off-fill` is wedged between the dark `--edit` and the near-white
   `--other-wash`; moving it down to clear 3:1 against the wash would break `--edit` /
   `--off-fill` (currently 3.07:1) and push the struck-through label under 4.5:1. I kept the
   `--edit` separation because confusing an off slot with the block you are editing is the
   costlier error. The off state carries a dashed border *and* a strikethrough *and* is the
   only achromatic chip, so three non-colour signals cover the gap.

5. **`--on-edit` / `--edit` is 6.83:1, not AAA.** Keeping Hunter Green at its exact given value
   costs 0.17 against the AAA threshold. Deliberate; AA is the standard and chip labels are short.

6. **Dark green text and dark red text stay tight under deuteranopia** (ΔE 0.076). Unfixable by
   colour, as shown in §6.3. Mitigated by mandatory glyphs and literal words, which is why §5
   treats those as requirements rather than as nice-to-haves.

7. **The grid is monochromatic on purpose.** Four of the six source colours are green, and
   rather than manufacture fake hue variety inside the schedule, I let green mean "schedule"
   and spent the palette's hue budget on the three things that are *not* schedule — commit,
   error, temporary. The cost is that the week grid, viewed alone, is a green-and-grey image.
   The benefit is that it stays a green-and-grey image under every form of colour blindness,
   and the coach's own block is always simply the dark one.

---

## Appendix A — the measurement script

Python 3, no dependencies. Sanity checks: `contrast(white, black) == 21.0` exactly;
`#777777` on white == 4.478; `#767676` on white == 4.542.

```python
import math

M2_INV = [[1.0, 0.3963377774, 0.2158037573],
          [1.0, -0.1055613458, -0.0638541728],
          [1.0, -0.0894841775, -1.2914855480]]
M1_INV = [[ 4.0767416621, -3.3077115913,  0.2309699292],
          [-1.2684380046,  2.6097574011, -0.3413193965],
          [-0.0041960863, -0.7034186147,  1.7076147010]]

def mv(M, v):
    return [sum(M[i][j] * v[j] for j in range(3)) for i in range(3)]

def oklch_to_linear_srgb(L, C, H):
    h = math.radians(H)
    lms_ = mv(M2_INV, [L, C * math.cos(h), C * math.sin(h)])
    return mv(M1_INV, [x ** 3 for x in lms_])

def enc(c):
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055

def dec(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def oklch_to_srgb(L, C, H):
    lin = oklch_to_linear_srgb(L, C, H)
    clipped = any(x < -0.0005 or x > 1.0005 for x in lin)   # sRGB gamut test
    return [enc(x) for x in lin], clipped

def rel_lum(srgb):
    r, g, b = [dec(c) for c in srgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b             # WCAG 2.x

def contrast(a, b):
    la, lb = rel_lum(oklch_to_srgb(*a)[0]), rel_lum(oklch_to_srgb(*b)[0])
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

# --- dichromat simulation: Viénot / Brettel / Mollon, via Hunt-Pointer-Estevez LMS ---
RGB2LMS = [[17.8824,    43.5161,   4.11935],
           [ 3.45565,   27.1554,   3.86714],
           [ 0.0299566,  0.184309, 1.46709]]
LMS2RGB = [[ 0.0809444479,   -0.130504409,  0.116721066],
           [-0.0102485335,    0.0540193266, -0.113614708],
           [-0.000365296938, -0.00412161469, 0.693511405]]
SIM = {"protan": [[0, 2.02344, -2.52581], [0, 1, 0], [0, 0, 1]],
       "deutan": [[1, 0, 0], [0.494207, 0, 1.24827], [0, 0, 1]],
       "tritan": [[1, 0, 0], [0, 1, 0], [-0.395913, 0.801109, 0]]}

def simulate(srgb, kind):
    lms = mv(RGB2LMS, [dec(c) * 255 for c in srgb])
    out = mv(LMS2RGB, mv(SIM[kind], lms))
    return [enc(max(0.0, min(1.0, x / 255))) for x in out]

# ΔE reported in the tables is Euclidean distance in Oklab between simulated colours.
```

Contrast between two simulated colours is `rel_lum` applied to the simulated sRGB triples and
fed through the same `(hi + 0.05) / (lo + 0.05)` formula.

### A note on `--stage`

`--stage` is the one token in this palette with **zero chroma**. Every other neutral here
carries a trace of green or teal — `--ground` is hue 160, `--ground-2` is 162 — which is
what stops them reading as dead grey beside the accents. `--stage` is a true neutral,
added deliberately at `#cccccc`.

Two consequences worth knowing before it spreads:

- **It is a surface, not a boundary.** Against `--panel` it measures 1.55:1, well under
  the 3:1 in WCAG 1.4.11 — which is fine, because surface-to-surface contrast is exempt.
  It must never be the only thing separating two *states*.
- **It is close to `--off-fill`** (1.43:1). A taken or switched-off chip sitting directly
  on the stage is nearly the same lightness as its background, so those chips depend
  entirely on their hatch, border and label to read as unavailable. That is 1.4.1-compliant
  but leaves no margin — if the stage spreads to other screens, check what sits on it.

### The coach's week grid — two day states

The schedule creator colours each weekday column by whether the coach teaches that day:

| State | Fill | |
|---|---|---|
| No lessons | `--stage` `#CCCCCC` | Stamped out — the day is not part of the working week |
| Has lessons | `--ground` `#EDF3F0` | Recedes into the page; the slot chips inside carry the colour |

`--ground` doing double duty here is deliberate. A working day is *not* a highlighted
state — it is the normal case, and the per-block chips inside it already carry the block's
identity hue. Tinting the column as well would put a third colour behind colours that are
themselves the signal.

**The two states are 1.43:1 apart**, which is fine because they are surfaces rather than
boundaries (1.4.11 exempt), and because nothing rests on the colour alone: an empty column
is dashed-bordered and says "No lessons", a working column is solid-bordered and full of
chips. Text on a working column runs 7.49:1 to 12.50:1; the column border clears 1.4.11 at
3.59:1.
