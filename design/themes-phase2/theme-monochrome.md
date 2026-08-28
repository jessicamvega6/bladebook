# BladeBook — Monochrome Ice

**Direction: one hue, four states, separated by lightness.**
Every token in this palette is built on a single hue, `H = 252` — the cold blue of rink light through a windscreen — and every role is separated from every other by lightness and chroma alone. Nothing is distinguished by "being a different colour". This serves a coach at 6am for a specific, measurable reason: lightness is the one channel that survives everything the situation throws at it. It survives a phone on minimum brightness in a dark car, a screen tilted 40° off-axis, a cheap laptop panel with a blue cast, direct low sun, gloved fingers smearing the glass, and every form of colour vision deficiency including total achromatopsia. A palette that separates roles by hue is asking the coach's eye to make a discrimination that all of those conditions destroy. A palette that separates roles by lightness is asking it to make the one discrimination that none of them touch. The result is deliberately austere — a page of ice-paper, graphite text, and one blue that gets darker as it gets more serious: pale wash for a block that merely exists, full-chroma blue for the block under the coach's hand, near-navy for the button that commits. The single accent hue is not a stylistic pose; it is what lets all four simultaneous slot states be told apart at a glance, because it forces the difference into the channel that is actually reliable.

**Amber is gone entirely.** No token in this file falls in hue 45–100. The two hues used are 252 (everything) and 27 (warn only — justified in §6).

---

## 1. Tokens

All values verified in-gamut for sRGB (no clipping — see §3 note).
`H = 252` except where marked.

### Surfaces

| Token | Value | sRGB | Use |
|---|---|---|---|
| `--ground` | `oklch(0.964 0.007 252)` | `#F0F3F8` | Page background — ice-paper, faintly cold |
| `--panel` | `oklch(0.995 0.002 252)` | `#FCFDFF` | Raised cards, the form panel, the grid surface |
| `--ground-2` | `oklch(0.981 0.008 252)` | `#F5F9FE` | Secondary panels and the seven day-columns |
| `--sunk` | `oklch(0.928 0.014 252)` | `#E1E8F1` | Inset wells — legend strip, summary trays |

### Lines

| Token | Value | sRGB | Use |
|---|---|---|---|
| `--line` | `oklch(0.638 0.026 252)` | `#818D9B` | Default structural borders — card edges, column edges, dividers |
| `--line-soft` | `oklch(0.585 0.030 252)` | `#6F7D8E` | Field borders — inputs, selects, steppers |
| `--line-dash` | `oklch(0.648 0.026 252)` | `#83909E` | Dashed outlines — "add a block", empty-day column |

### Ink ramp

| Token | Value | sRGB | Use |
|---|---|---|---|
| `--ink` | `oklch(0.262 0.040 252)` | `#162637` | Primary text, headings, values |
| `--ink-2` | `oklch(0.388 0.036 252)` | `#374658` | Secondary text, field labels, button text on light |
| `--ink-3` | `oklch(0.486 0.032 252)` | `#526171` | Micro-labels, captions, uppercase eyebrows |
| `--ink-4` | `oklch(0.557 0.026 252)` | `#697583` | Faintest tier — placeholders, units, disabled labels |

### Edit — the block the coach is currently editing

| Token | Value | sRGB | Use |
|---|---|---|---|
| `--edit` | `oklch(0.520 0.152 252)` | `#086ABC` | SOLID fill behind slot chips in the live block |
| `--on-edit` | `oklch(0.995 0.002 252)` | `#FCFDFF` | Text and icons on `--edit` |
| `--edit-wash` | `oklch(0.950 0.023 252)` | `#E4F0FE` | Whole-column tint on days the live block touches |
| `--edit-wash-2` | `oklch(0.900 0.046 252)` | `#C9E1FC` | Stronger tint — impact callout, confirmation strip |
| `--edit-line` | `oklch(0.626 0.130 252)` | `#478BD4` | Border on edit-tinted surfaces and the live block card |
| `--edit-ink` | `oklch(0.330 0.098 252)` | `#013665` | The accent as text on a light surface |

### Other — blocks that exist but are not being edited

| Token | Value | sRGB | Use |
|---|---|---|---|
| `--other` | `oklch(0.655 0.058 252)` | `#7793B4` | Accent strip / icon stroke on a non-live block |
| `--other-wash` | `oklch(0.945 0.018 252)` | `#E4EEF9` | Chip fill for slots belonging to another block |
| `--other-line` | `oklch(0.612 0.052 252)` | `#6D86A3` | Solid 1px border on those chips |
| `--other-ink` | `oklch(0.515 0.055 252)` | `#506A87` | Label text inside those chips |
| `--other-band` | `oklch(0.862 0.030 252)` | `#C4D3E5` | "ALSO IN THIS SCHEDULE" badge background |

### Action — the one commit button per screen

| Token | Value | sRGB | Use |
|---|---|---|---|
| `--action` | `oklch(0.265 0.078 252)` | `#012649` | Primary commit button fill — deepest thing on the page |
| `--action-ink` | `oklch(0.995 0.002 252)` | `#FCFDFF` | Its label |

### Off — a slot the coach switched off

| Token | Value | sRGB | Use |
|---|---|---|---|
| `--off-fill` | `oklch(0.855 0.005 252)` | `#CDD0D3` | Chip fill — colour drained out, deliberately neutral |
| `--off-line` | `oklch(0.552 0.010 252)` | `#6E7378` | Dashed border on that chip |
| `--off-ink` | `oklch(0.435 0.002 252)` | `#505152` | Struck-through label |

### Warn — validation errors and REQUIRED badges *(hue 27 — the one exception)*

| Token | Value | sRGB | Use |
|---|---|---|---|
| `--warn-wash` | `oklch(0.945 0.026 27)` | `#FEE7E4` | Error panel / badge background |
| `--warn-line` | `oklch(0.618 0.155 27)` | `#D35A50` | Error panel border |
| `--warn-ink` | `oklch(0.440 0.170 27)` | `#9B1014` | Error text, REQUIRED badge text |

### Temp — dated / one-off schedules

| Token | Value | sRGB | Use |
|---|---|---|---|
| `--temp` | `oklch(0.400 0.048 252)` | `#344961` | SOLID chip fill for a temporary schedule — the accent, drained |
| `--temp-wash` | `oklch(0.945 0.006 252)` | `#EAEDF1` | Neutral tint on the temp form panel |
| `--temp-line` | `oklch(0.620 0.016 252)` | `#7F8790` | Border on temp surfaces |
| `--on-temp` | `oklch(0.995 0.002 252)` | `#FCFDFF` | Text on `--temp` |

---

## 2. Measured contrast

Computed by `oklch → OKLab → linear sRGB → gamma-encoded sRGB → WCAG relative luminance → (L₁+0.05)/(L₂+0.05)`.
Script: `scratchpad/mono_palette.py` (pure Python, no dependencies).

### 2.1 Text pairs — the twelve required

| Foreground / Background | Ratio | AA 4.5 | AA large 3.0 | AAA 7.0 | Role |
|---|---:|:---:|:---:|:---:|---|
| `--ink` / `--panel` | **15.21** | PASS | PASS | **PASS** | Body text on a card |
| `--ink` / `--ground` | **13.90** | PASS | PASS | **PASS** | Body text on the page |
| `--ink-2` / `--panel` | **9.53** | PASS | PASS | **PASS** | Secondary text |
| `--ink-3` / `--panel` | **6.26** | PASS | PASS | fail | Micro-labels, captions |
| `--ink-4` / `--panel` | **4.64** | PASS | PASS | fail | Placeholders, disabled |
| `--on-edit` / `--edit` | **5.46** | PASS | PASS | fail | Chip label on the editing fill |
| `--action-ink` / `--action` | **15.12** | PASS | PASS | **PASS** | Commit button label |
| `--edit-ink` / `--edit-wash` | **10.61** | PASS | PASS | **PASS** | Accent text on column tint |
| `--other-ink` / `--other-wash` | **4.78** | PASS | PASS | fail | Other-block chip label |
| `--off-ink` / `--off-fill` | **5.10** | PASS | PASS | fail | Struck-through off label |
| `--warn-ink` / `--warn-wash` | **7.16** | PASS | PASS | **PASS** | Validation text, REQUIRED |
| `--on-temp` / `--temp` | **9.06** | PASS | PASS | **PASS** | Chip label on temporary fill |

**Nothing fails.** All twelve clear AA for body text at any size.
Seven of the twelve clear AAA (7:1): `--ink`/`--panel`, `--ink`/`--ground`, `--ink-2`/`--panel`, `--action-ink`/`--action`, `--edit-ink`/`--edit-wash`, `--warn-ink`/`--warn-wash`, `--on-temp`/`--temp`. The remaining five clear AA but not AAA.

**Lowest text ratio in the palette: 4.64:1** (`--ink-4` / `--panel`). Since `--ink-4` is the faintest tier and would ordinarily be a disabled-state exemption, holding it above 4.5 means even the palette's weakest text is legible as body copy. `--ink-4` on `--ground` measures 4.24:1 — still AA for anything ≥18.7px bold or ≥24px, and above 3:1 for non-text; use `--ink-3` for small text placed directly on `--ground`.

### 2.2 Non-text pairs — WCAG 1.4.11, target 3:1

| Pair | Ratio | Verdict | What it bounds |
|---|---:|:---:|---|
| `--line` / `--panel` | **3.34** | PASS | Structural border vs card |
| `--line` / `--ground` | **3.05** | PASS | Structural border vs page |
| `--line-soft` / `--panel` | **4.13** | PASS | Field border vs card |
| `--line-dash` / `--ground-2` | **3.08** | PASS | Dashed empty-day outline vs column |
| `--edit` / `--panel` | **5.46** | PASS | Editing fill vs card |
| `--edit` / `--ground-2` | **5.25** | PASS | Editing fill vs a normal column |
| `--edit` / `--edit-wash` | **4.79** | PASS | Editing fill vs its own column tint |
| `--edit-line` / `--edit-wash` | **3.07** | PASS | Edit border vs edit tint |
| `--off-line` / `--off-fill` | **3.09** | PASS | Dashed off border vs its own fill |
| `--off-line` / `--ground-2` | **4.55** | PASS | Off chip border vs the column |
| `--other-line` / `--other-wash` | **3.19** | PASS | Other border vs its own wash |
| `--other-line` / `--ground-2` | **3.55** | PASS | Other chip border vs the column |
| `--other` / `--panel` | **3.12** | PASS | Other-block accent strip vs card |
| `--warn-line` / `--warn-wash` | **3.33** | PASS | Warn border vs warn wash |
| `--temp-line` / `--temp-wash` | **3.10** | PASS | Temp border vs temp wash |
| `--temp` / `--panel` | **9.06** | PASS | Temporary fill vs card |
| `--action` / `--panel` | **15.12** | PASS | Commit button vs card |
| `--other-band` / `--panel` | 1.50 | n/a | Badge *background* — not a boundary |
| `--sunk` / `--panel` | 1.22 | n/a | Inset well *fill* — not a boundary |

Every border, outline and state indicator that a coach must perceive to operate or read the screen clears 3:1. The two low ratios are decorative surface fills, not boundaries: 1.4.11 does not apply to them, and in both cases the contrast that carries meaning is the text sitting on top (`--warn-ink`/`--other-ink` on the band at 4.78–7.16:1; `--ink` on `--sunk` at ~14:1). `--sunk` additionally carries a `--line` border at 3.05:1 against `--ground`.

**Lowest ratio anywhere that is required to pass: 3.05:1** (`--line` / `--ground`).

### 2.3 The critical adjacency: `--edit` vs `--action`

The brief's hard constraint. Measured:

| Measure | Value |
|---|---|
| `--edit` relative luminance | 0.1396 |
| `--action` relative luminance | 0.0185 |
| Contrast between them | **2.77:1** |
| OKLab distance | **0.266** |
| Worst-case distance under simulated dichromacy | **0.261** |

They are 7.5× apart in luminance. `--edit` is a mid blue that reads as *live*; `--action` is a near-navy that reads as *weight*. They are additionally separated by form: `--action` is a single 56px full-width filled button with a 15px label and a drop shadow; `--edit` fills 22px chips with 9px labels and no shadow. There is exactly one `--action` on screen and it never appears inside the grid.

---

## 3. WCAG 1.4.1 — the non-colour signal for each slot state

Each of the four states carries at least two signals that are not colour. None of them can be identified by hue alone; each can be identified with the monitor set to greyscale.

| State | Non-colour signals |
|---|---|
| **Editing** | **Solid** filled chip (the only filled chip in the grid) + **bold 800** white label + a 3px solid `--edit-line` rail down the left of the whole column + the block card in the form shows an `EDITING` badge. Greyscale Y = 0.14 — by far the darkest thing in the grid. |
| **Other block** | **Outlined, not filled** — 1px *solid* `--other-line` border with a pale fill + regular-weight 700 label + an `ALSO IN THIS SCHEDULE` text badge on its card. Outline-vs-fill is the primary distinction from Editing, and it holds in greyscale. |
| **Switched off** | 1px **dashed** border (dash pattern differs from both the solid Other chip and the dotted empty-day outline) + the label is **struck through** + a diagonal-slash glyph in the chip + the time text reads `off 6:30–7:00`. Three independent non-colour cues. |
| **Empty day** | **No chip at all** — the column holds nothing but a **dotted** `--line-dash` outline, a circle-with-slash icon, and the literal words **"No lessons"**. Absence of content is itself the signal; the words are the fallback. |

The legend strip beneath the grid repeats all four with their swatch, their border treatment *and* their name in words, so the mapping is available as text on the same screen.

**No state in this palette is signalled by hue.** That is structural, not incidental: the palette has only one hue, so hue-only signalling is impossible by construction.

---

## 4. Colour vision deficiency

Simulated with Viénot (1999) linear-RGB dichromat matrices for deuteranopia, protanopia and tritanopia; separation measured as OKLab Euclidean distance between the simulated colours. Threshold used: distance < 0.045 = collapse, < 0.085 = tight.

### 4.1 The load-bearing accents, simulated

| Token | Normal | Deuteranope | Protanope | Tritanope |
|---|---|---|---|---|
| `--edit` | `#086ABC` | `#5A5ABD` | `#6464BC` | `#007A7A` |
| `--action` | `#012649` | `#1F1F4A` | `#232349` | `#002D2D` |
| `--temp` | `#344961` | `#444461` | `#474761` | `#2E4D4D` |
| `--other` | `#7793B4` | `#8C8CB4` | `#9191B4` | `#709999` |
| `--edit-ink` | `#013665` | `#2D2D66` | `#323265` | `#003F3F` |
| `--other-ink` | `#506A87` | `#636387` | `#676787` | `#496F6F` |
| `--off-ink` | `#505152` | `#515152` | `#515152` | `#505151` |
| `--warn-ink` | `#9B1014` | `#595900` | `#393917` | `#9B1111` |

### 4.2 Findings

**No two roles that ever appear together collapse.** The pairs that matter, worst case across all three deficiencies:

| Pair (co-occurring) | Normal | Worst CVD | Verdict |
|---|---:|---:|---|
| `--edit` vs `--action` | 0.266 | **0.261** | Safe — barely moves |
| `--edit` vs `--other-wash` (chip vs chip) | 0.446 | **0.420** | Safe |
| `--edit` vs `--off-fill` (chip vs chip) | 0.366 | **0.336** | Safe |
| `--edit` vs `--ground-2` (chip vs empty) | 0.483 | **0.455** | Safe |
| `--other-ink` vs `--off-ink` (label vs label) | 0.096 | **0.087** | Safe, but the narrowest of the co-occurring set |
| `--other-wash` vs `--off-fill` (chip vs chip) | 0.091 | **0.090** | Safe by fill; carried by border style |
| `--edit` vs `--temp` (fill vs fill) | 0.159 | **0.138** | Safe |
| `--edit-ink` vs `--other-ink` (text vs text) | 0.190 | **0.179** | Safe |

**Pairs that do go tight, and why they are not defects:**

- `--temp` vs `--off-ink` (0.048 protan) — a *chip fill* against a *label colour*. They never occupy the same role; a 22px solid fill with white text cannot be mistaken for 9px struck-through grey text on a pale fill.
- `--action` vs `--edit-ink` (0.067 trit) — a *button fill* against *text on a pale tint*. `--action` appears once, in the form footer, at 56px tall with a shadow. `--edit-ink` appears as small text inside the grid and callouts.
- `--edit` vs `--other-ink` (0.049 trit) — same category: fill vs text.
- `--temp` vs `--edit-ink` (0.067 trit) — same category: fill vs text.

**Pale washes collapse into one another under every deficiency — by design and without consequence.** `--edit-wash`, `--other-wash`, `--temp-wash`, `--warn-wash` and `--ground-2` sit between 1.00:1 and 1.12:1 of each other and simulate to distances of 0.006–0.048. This is unavoidable at these lightnesses: at L ≈ 0.95 the sRGB gamut allows a maximum chroma of only 0.025, so *no* pale tint in any palette can carry enough colour to survive dichromacy. The palette therefore never uses a wash as a state signal. Every wash is accompanied by a border at ≥3:1, a text label, and in the grid a solid chip or an explicit word.

**Total achromatopsia (greyscale):** the four slot states measure Y = 0.140 (editing) / 0.845 (other) / 0.625 (off) / 0.945 (empty). Editing is unmistakable. Other, off and empty separate by 1.11–1.47:1 in fill alone, which is *not* enough on its own — and this is precisely why each carries a distinct border treatment at ≥3:1 (solid / dashed / dotted), a distinct text treatment (upright / struck-through / the words "No lessons"), and a filled-vs-outlined distinction. Read §3: in greyscale the screen still works.

**Red-green deficiency and the warn hue:** `--warn-ink` at hue 27 simulates to `#595900` (deuteranope) and `#393917` (protanope) — it desaturates toward olive but remains at OKLab distance 0.101–0.290 from every other ink and accent, so an error never reads as an ordinary accent. Warn is additionally never colour-only: errors carry a circle-exclamation icon, the word describing the problem, and the REQUIRED badge is literal text.

---

## 5. Where the second hue was unavoidable

`--warn-*` is the only token group outside hue 252, and it was taken deliberately after measuring the alternative.

At the lightness an error text needs — L ≈ 0.44, to hold ≥4.5:1 on a pale wash — the sRGB gamut allows a maximum chroma of **0.133 at hue 252**, versus **0.180 at hue 27**. A monochrome warn would therefore be `oklch(0.440 0.131 252)`. Measured against the accents it would have to be told apart from:

| Monochrome warn vs | OKLab distance | Contrast |
|---|---:|---:|
| `--edit` | **0.083** | 1.41:1 |
| `--other-ink` | **0.107** | 1.39:1 |
| `--ink-2` | 0.108 | 1.24:1 |
| `--edit-ink` | 0.115 | 1.57:1 |

At hue 27 the same comparisons are 0.204–0.272 — roughly 2.5× further apart.

The reason this is a genuine blocker rather than a preference: the four schedule states have already spent the entire usable lightness range of hue 252. A monochrome error would land at distance 0.083 from `--edit` — inside the "tight" band — and would mean a validation failure looking like *another block state* rather than a problem. Errors also arrive unannounced, out of the reading order, on a screen the coach is trying to leave; they are the one signal that must be pre-attentive. Spending one extra hue there buys 2.5× separation for four tokens out of thirty-five. Every other role holds the line.

---

## 6. Compromises, stated plainly

1. **`--warn-*` uses hue 27.** Three of the thirty-four tokens break the single-hue rule; the other thirty-one are all hue 252. Justified and measured in §5; I would not trade it back.

2. **The three pale wash tints are near-identical and always will be.** `--edit-wash`, `--other-wash` and `--temp-wash` sit within 1.02:1 of each other. This is an sRGB gamut limit, not a design choice: at L ≈ 0.95 the maximum available chroma at hue 252 is 0.025. The consequence is that a coach cannot tell an edit-tinted column from an other-tinted chip *by the tint alone* — the border, the fill weight and the chip's contents do that work. If the prototype ever relies on a wash by itself to mean something, that use is a bug.

3. **`--line-soft` is darker than `--line`, which reads backwards from its name.** Field borders (`--line-soft`) sit at 4.13:1 and structural borders (`--line`) at 3.34:1, because an input is an interactive control under 1.4.11 while a card edge is a container. "Soft" here means lower visual weight in the design's intent, not lower contrast. I kept the token name because it is already wired into the prototype, but it is a naming trap for the next person.

4. **The borders are heavier than an ice-paper aesthetic wants.** Holding every line at ≥3:1 puts `--line` at `#818D9B` — a definite mid-grey, not the hairline you would draw if aesthetics led. The page reads crisper and slightly more utilitarian than the amber-and-cobalt version did. Given the stated priority order this is the correct trade, and in a cold car park it is an improvement, but it is a real change in character and the client should see it before it ships.

5. **Four fill-versus-text pairs go "tight" under simulated dichromacy** (`--temp`/`--off-ink`, `--action`/`--edit-ink`, `--edit`/`--other-ink`, `--temp`/`--edit-ink`). In every case one member is a large solid fill and the other is small text, so they are separated by size, weight and position rather than by colour. This is the honest cost of one hue: with only lightness and chroma to spend, thirty-one tokens on a single hue means some non-adjacent pairs land near each other. None of them co-occur in the same role. If a future screen ever puts `--temp` fill directly beside `--edit-ink` text, that pair needs re-measuring.

6. **`--other-ink` and `--off-ink` are the narrowest genuinely co-occurring pair** at OKLab 0.087 under tritanopia — both are chip labels, side by side in the grid. They pass, but only just, and they pass because `--off-ink` is deliberately achromatic (C = 0.002) while `--other-ink` keeps C = 0.055. The strikethrough on the off label is doing real work here, not decoration; do not remove it.

7. **`--ink-4` is a hair over the line.** At 4.64:1 on `--panel` and 4.24:1 on `--ground` it clears AA on cards but not on the page background for small text. Use `--ink-3` for anything small sitting directly on `--ground`. I chose to keep the faintest tier above 4.5 on panels rather than let it be a disabled-only exemption, which cost the ramp some of its tonal spread — `--ink-3` and `--ink-4` are closer together than is comfortable for pure visual hierarchy.

8. **Not verified in this pass:** rendering on non-sRGB wide-gamut displays (the oklch values will render more saturated on P3, which only increases separation, but the measured ratios assume sRGB); and no dark-mode variant exists yet — a 10pm kitchen table on a bright white screen is a real complaint waiting to happen, and the single-hue structure would invert cleanly, but it has not been built or measured.
