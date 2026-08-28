# BladeBook — High-Contrast Theme

> Replaces the amber/cobalt pairing. Every value below was measured, not estimated: the
> script at the end of this document converts each `oklch()` to sRGB, computes WCAG
> relative luminance, and reports the contrast ratio. Numbers in this file are its output.

---

## 1. The direction

**Rink Light.** One dark, saturated fill for the block you are editing (deep spruce-green),
one dark, saturated fill for the button that commits (cobalt), and a hard **lightness
ladder** between the four slot states so the grid reads correctly even in greyscale or
through sunglare. The old palette separated states by *tint* — pale amber against pale
cobalt against pale grey, all sitting between 0.87 and 0.98 lightness. That is a palette
designed for a colour-managed monitor in a dim room. A coach at 6am in a car park is
looking at a phone with the backlight losing to daylight, where every pale tint flattens
into the same white; a coach at 10pm on a cheap laptop is looking at a panel whose gamma
crushes the lightest two steps together. So this palette does the opposite: the block being
edited is a **dark** fill with white text (7.07:1), the switched-off slot is a **mid-grey**
fill (luminance 0.43 — a full 3.28:1 below the editing fill), the other blocks are a
**visible violet wash** (0.71), and an empty day is near-**paper** (0.92). Those four are
1.5–3.3:1 apart from each other in pure luminance, which means the week grid survives being
printed in black and white, photographed, or viewed at 20% screen brightness. Borders were
darkened from `L 0.90` to `L 0.62` so that every field and panel edge clears the 3:1 that
WCAG 1.4.11 requires of a control boundary — the old lines did not. Body text runs at 7:1
or better everywhere except the placeholder step. The palette is quieter in hue than its
predecessor and heavier in line weight; that is the price of being readable at arm's length
with the sun behind you.

---

## 2. Tokens

### Surfaces

| Token | oklch | hex | Use |
|---|---|---|---|
| `--ground` | `oklch(0.945 0.006 250)` | `#EAEDF1` | The page behind everything |
| `--panel` | `oklch(0.995 0.002 250)` | `#FCFDFF` | Raised cards, fields, the form column |
| `--ground-2` | `oklch(0.972 0.005 250)` | `#F3F6F9` | Secondary panels; an inactive / empty day column |
| `--sunk` | `oklch(0.918 0.008 250)` | `#E0E4E9` | Inset wells — segmented controls, legend bars |

### Lines

Darker than convention on purpose. A hairline that a young designer can see on a Retina
display in a studio is invisible on a 5-year-old TN panel outdoors.

| Token | oklch | hex | Use |
|---|---|---|---|
| `--line` | `oklch(0.618 0.018 255)` | `#7E8691` | The default border — panels, cards, dividers |
| `--line-soft` | `oklch(0.585 0.020 255)` | `#747D88` | Field and control borders (stronger, not softer — a field edge is a control boundary) |
| `--line-dash` | `oklch(0.548 0.022 255)` | `#69727E` | Dashed outlines — "add" affordances, empty-day panels (darkest, because dashes lose half their ink to the gaps) |

### Ink

| Token | oklch | hex | Use |
|---|---|---|---|
| `--ink` | `oklch(0.200 0.035 258)` | `#0C1626` | Body text, headings, anything that must be read |
| `--ink-2` | `oklch(0.335 0.032 258)` | `#2C3747` | Secondary text, weighted labels |
| `--ink-3` | `oklch(0.422 0.028 258)` | `#444E5D` | Supporting copy, uppercase micro-labels |
| `--ink-4` | `oklch(0.500 0.022 258)` | `#5C6470` | Placeholders and disabled state **only** — the one step below AAA |

### Editing — the block under the coach's hand

Deep spruce-green, hue 162. Chosen against cobalt because green/blue is the one hue pair
that stays separated under both deuteranopia and protanopia once amber is off the table.

| Token | oklch | hex | Use |
|---|---|---|---|
| `--edit` | `oklch(0.448 0.088 162)` | `#186445` | **Solid** fill behind the active block's slot chips, its badge, its band |
| `--on-edit` | `oklch(0.995 0.002 250)` | `#FCFDFF` | Text and icons **on** `--edit` |
| `--edit-wash` | `oklch(0.964 0.034 162)` | `#E0FBEC` | Faintest tint — a whole column containing the active block |
| `--edit-wash-2` | `oklch(0.928 0.066 162)` | `#C1F6DA` | One step up — confirmation panels, the active block card |
| `--edit-line` | `oklch(0.605 0.098 162)` | `#439470` | Border on green-tinted surfaces and around a hot column |
| `--edit-ink` | `oklch(0.345 0.070 162)` | `#0A442E` | The accent as text on a light surface |

### Other blocks — real, but not yours right now

Muted plum-violet, hue 305. Deliberately lower chroma than `--action` so that "another
block exists here" never competes with "press this".

| Token | oklch | hex | Use |
|---|---|---|---|
| `--other` | `oklch(0.430 0.100 305)` | `#5D407B` | Other blocks' marks — dots, rules, left-borders |
| `--other-wash` | `oklch(0.895 0.042 305)` | `#E3D6F3` | Fill of an other-block slot chip |
| `--other-line` | `oklch(0.585 0.095 305)` | `#896DA9` | Their solid 1px border |
| `--other-ink` | `oklch(0.340 0.120 305)` | `#472268` | Their slot label and strong text |
| `--other-band` | `oklch(0.830 0.068 305)` | `#D1BDEB` | Their "60 MIN · $70" header band (carries `--other-ink` text) |

### Action — the one thing that commits

| Token | oklch | hex | Use |
|---|---|---|---|
| `--action` | `oklch(0.400 0.135 256)` | `#02458E` | The primary button. **Exactly one per screen.** |
| `--action-ink` | `oklch(0.995 0.002 250)` | `#FCFDFF` | Its label |

### Switched off

| Token | oklch | hex | Use |
|---|---|---|---|
| `--off-fill` | `oklch(0.755 0.006 255)` | `#ADB0B3` | Fill of a slot the coach switched off |
| `--off-line` | `oklch(0.472 0.012 255)` | `#575C62` | Its **dashed** border; the "no lessons" rule |
| `--off-ink` | `oklch(0.265 0.014 255)` | `#21262C` | Its struck-through label |

### Validation

| Token | oklch | hex | Use |
|---|---|---|---|
| `--warn-wash` | `oklch(0.950 0.022 27)` | `#FDE9E7` | Validation panel and REQUIRED badge background |
| `--warn-line` | `oklch(0.575 0.150 27)` | `#C24E46` | Its border |
| `--warn-ink` | `oklch(0.395 0.155 27)` | `#86090F` | Validation text, REQUIRED badge text |

### Temporary (dated) schedules

| Token | oklch | hex | Use |
|---|---|---|---|
| `--temp` | `oklch(0.420 0.155 355)` | `#881651` | **Solid** fill — replaces `--edit` in temporary mode |
| `--on-temp` | `oklch(0.995 0.002 250)` | `#FCFDFF` | Text on `--temp` |
| `--temp-wash` | `oklch(0.956 0.023 355)` | `#FEEAF1` | Its column tint and mode banner |
| `--temp-line` | `oklch(0.600 0.135 355)` | `#BD5A84` | Its borders |

All 34 tokens are inside the sRGB gamut — nothing is silently clipped by the browser.

---

## 3. Measured contrast

Method: `oklch → Oklab → linear sRGB → gamma-encoded sRGB → WCAG relative luminance
(0.2126R + 0.7152G + 0.0722B) → (L₁+0.05)/(L₂+0.05)`. Script in §7.

### 3.1 The twelve required pairs

| Pair | Ratio | AA 4.5 | AA-large 3.0 | AAA 7.0 |
|---|---:|:--:|:--:|:--:|
| `--ink` / `--panel` | **17.86** | ✅ | ✅ | ✅ |
| `--ink` / `--ground` | **15.43** | ✅ | ✅ | ✅ |
| `--ink-2` / `--panel` | **11.81** | ✅ | ✅ | ✅ |
| `--ink-3` / `--panel` | **8.27** | ✅ | ✅ | ✅ |
| `--ink-4` / `--panel` | **5.91** | ✅ | ✅ | ❌ **fails AAA** |
| `--on-edit` / `--edit` | **7.07** | ✅ | ✅ | ✅ |
| `--action-ink` / `--action` | **9.21** | ✅ | ✅ | ✅ |
| `--edit-ink` / `--edit-wash` | **10.17** | ✅ | ✅ | ✅ |
| `--other-ink` / `--other-wash` | **8.96** | ✅ | ✅ | ✅ |
| `--off-ink` / `--off-fill` | **7.00** | ✅ | ✅ | ✅ |
| `--warn-ink` / `--warn-wash` | **8.73** | ✅ | ✅ | ✅ |
| `--on-temp` / `--temp` | **9.10** | ✅ | ✅ | ✅ |

**Twelve of twelve clear AA. Eleven of twelve clear AAA.** Nothing fails a body-text target.
The single non-AAA pair is `--ink-4` at 5.91:1, and that is deliberate — see §6.

**Lowest ratio in the whole palette (any text pair): 5.91:1 (`--ink-4` on `--panel`).**

### 3.2 Supplementary text pairs — surfaces the ramp actually lands on

| Pair | Ratio | AAA |
|---|---:|:--:|
| `--ink` / `--ground-2` | 16.71 | ✅ |
| `--ink` / `--edit-wash` | 16.52 | ✅ |
| `--ink` / `--sunk` | 14.22 | ✅ |
| `--ink` / `--other-wash` | 13.08 | ✅ |
| `--ink` / `--off-fill` | 8.29 | ✅ |
| `--ink-2` / `--ground` | 10.21 | ✅ |
| `--other-ink` / `--other-band` | 7.20 | ✅ |
| `--ink-3` / `--ground` | 7.14 | ✅ |
| `--edit-ink` / `--edit-wash-2` | 9.24 | ✅ |
| `--ink-4` / `--ground` | 5.11 | ❌ (AA only) |

The ink ramp holds at AAA on *every* surface in the system, not just on the card. That was
the reason for darkening `--ground` and re-solving `--ink-3` — at the old values,
micro-labels on the page background sat at 6.75:1 and quietly missed.

### 3.3 Non-text contrast — WCAG 1.4.11, target 3:1

**Passing (16):**

| Pair | Ratio | What it is |
|---|---:|---|
| `--off-line` / `--panel` | 6.67 | Dashed off-border against the card |
| `--edit` / `--ground-2` | 6.61 | Editing fill against an empty column |
| `--edit` / `--other-wash` | 5.18 | Editing slot against an other-block slot |
| `--line-dash` / `--panel` | 4.82 | Dashed outline on a card |
| `--warn-line` / `--panel` | 4.64 | Error border |
| `--temp-line` / `--panel` | 4.18 | Temporary border |
| `--line-soft` / `--panel` | 4.13 | **Field border** |
| `--warn-line` / `--warn-wash` | 4.04 | Error border inside its own panel |
| `--temp-line` / `--temp-wash` | 3.70 | Temp border inside its own tint |
| `--edit-line` / `--panel` | 3.63 | Edit border on a card |
| `--line` / `--panel` | 3.61 | **Default border** |
| `--edit-line` / `--edit-wash` | 3.36 | Edit border inside its own tint |
| `--edit` / `--off-fill` | 3.28 | Editing slot against a switched-off slot |
| `--other-line` / `--other-wash` | 3.15 | **Other-block border against its fill** |
| `--line` / `--ground` | 3.12 | Panel border against the page |
| `--off-line` / `--off-fill` | 3.09 | **Dashed border against off fill** |

Note `--edit` clears 3:1 against *every* other slot state and against both surfaces —
7.07:1 on `--panel`, 6.61:1 on `--ground-2`, 5.18:1 on `--other-wash`, 3.28:1 on
`--off-fill`. The state the coach is manipulating is unambiguous by luminance alone.

**Below 3:1 (5) — each stated with what carries the boundary instead:**

| Pair | Ratio | Why it is below, and what carries it |
|---|---:|---|
| `--action` / `--edit` | **1.30** | Two dark saturated fills. See §6.1 — this one is real and I could not solve it with luminance. |
| `--other-wash` / `--off-fill` | **1.58** | Adjacent slot chips. The boundary is carried by the `--other-line` solid border (3.15:1 against its own fill, 6.67:1 for the off dashes) and by the strike-through. |
| `--other-band` / `--panel` | **1.70** | A filled label bar, not a boundary. Its *text* carries 7.20:1. |
| `--off-fill` / `--ground-2` | **2.02** | An off chip on an empty column. The dashed `--off-line` sits at 6.67:1 against light surfaces. |
| `--other-wash` / `--ground-2` | **1.28** | Same — the solid violet border is the boundary, not the wash. |

Arithmetic note, since this is the honest reason and not an excuse: on a light ground you
cannot fit four fill levels at 3:1 apart. Starting from paper at luminance 0.985, three
successive 3:1 steps land at 0.29, 0.063, and then below black. That is **three** usable
levels, and this design needs four (empty / other / off / editing) with AAA dark text on
two of them. So the fills are spaced as far as arithmetic allows — 0.92 / 0.71 / 0.43 /
0.10 — and the 3:1 boundary requirement is met by the *borders*, which is where WCAG
1.4.11 actually points.

---

## 4. WCAG 1.4.1 — what identifies each state without colour

| State | Non-colour signal |
|---|---|
| **Slot in the block being edited** | Solid inverted fill — light text on dark, the *only* inverted chip in the grid — plus bold 800 weight, no border, and an "EDITING" badge on the owning block card. |
| **Slot in another block** | Light fill with a **solid 1px border on all sides plus a 4px left rule**, normal 700 weight, and the block's name repeated in the column band above it. |
| **Switched-off slot** | **Dashed** border and a **line-through** on the time label, plus a "switch on" tooltip/`aria-pressed="false"` — the only chip in the grid with either treatment. |
| **Empty day** | Dashed panel outline in `--line-dash`, a slashed-circle glyph, and the literal words **"No lessons"** — an empty column is never simply blank. |

Nothing in the grid is distinguished by hue alone. In pure greyscale the four states still
read as *inverted / bordered / dashed-and-struck / outlined-and-empty*, and additionally as
four distinct luminances (0.10 / 0.71 / 0.43 / 0.92). The `--action` button is likewise
identified by being the only 56px-tall filled control on the screen, by carrying the
system's only shadow, and by its verb label — not by being blue.

Two further non-colour signals outside the grid: **temporary mode** is marked by real
calendar dates in the column headers where weekly mode shows weekday names (the colour is
confirmation, the dates are the signal), and **validation errors** always carry the word
REQUIRED or a full sentence, never a bare red outline.

---

## 5. Colour vision deficiency

Simulated in the script with a Viénot/Brettel LMS projection for each dichromacy, then
measured as Oklab distance between the simulated pairs. Threshold used: **< 0.055 = collapse**
(indistinguishable), **0.055–0.10 = tight** (separable but not by hue alone), **> 0.10 = clear**.

Only roles that can appear **on the same screen** are reported — `--edit` and `--temp` never
co-occur, since `--temp` replaces `--edit` when the coach is building a temporary schedule.

### Weekly mode (`--edit`, `--other-ink`, `--action`, `--warn-ink`, `--off-ink`)

| Pair | Deuteranopia | Protanopia | Tritanopia |
|---|---:|---:|---:|
| `--edit` vs `--action` | 0.165 clear | 0.172 clear | **0.072 tight** |
| `--edit` vs `--other-ink` | 0.152 clear | 0.213 clear | 0.272 clear |
| `--edit` vs `--warn-ink` | 0.078 tight | 0.178 clear | 0.266 clear |
| `--edit` vs `--off-ink` | 0.159 clear | 0.190 clear | 0.216 clear |
| `--other-ink` vs `--action` | **0.071 tight** | 0.102 clear | 0.280 clear |
| `--other-ink` vs `--warn-ink` | 0.193 clear | 0.159 clear | 0.152 clear |
| `--other-ink` vs `--off-ink` | 0.096 tight | 0.101 clear | 0.113 clear |
| `--action` vs `--warn-ink` | 0.223 clear | 0.208 clear | 0.306 clear |
| `--action` vs `--off-ink` | 0.164 clear | 0.168 clear | 0.201 clear |
| `--warn-ink` vs `--off-ink` | 0.172 clear | **0.069 tight** | 0.252 clear |

**No collapses.** The critical pair — `--edit` vs `--action`, the one the brief names — is
clear under deuteranopia and protanopia (together ~8% of men, the overwhelming majority of
CVD). Under deuteranopia `--edit` simulates to a warm olive-grey `#555547` while `--action`
simulates to a blue `#3A3A8E`; under protanopia they read `#5F5F4B` vs `#41418E`. That
separation is the entire reason `--edit` is green rather than teal, violet or rose: with
amber banned, green-against-blue is the only remaining hue pair that survives red-green
deficiency, because it also differs on the blue–yellow axis that a dichromat retains.

### Temporary mode (`--temp`, `--other-ink`, `--action`, `--warn-ink`, `--off-ink`)

| Pair | Deuteranopia | Protanopia | Tritanopia |
|---|---:|---:|---:|
| `--temp` vs `--action` | 0.138 clear | 0.107 clear | 0.309 clear |
| `--temp` vs `--other-ink` | 0.128 clear | **0.063 tight** | 0.159 clear |
| `--temp` vs `--warn-ink` | 0.091 tight | 0.107 clear | **0.007 COLLAPSE** |
| `--temp` vs `--off-ink` | 0.162 clear | 0.082 tight | 0.259 clear |
| `--other-ink` vs `--action` | 0.071 tight | 0.102 clear | 0.280 clear |
| `--warn-ink` vs `--off-ink` | 0.172 clear | 0.069 tight | 0.252 clear |

### Findings

1. **One genuine collapse: `--temp` vs `--warn-ink` under tritanopia** (distance 0.007 —
   both simulate to `#6B6B00`-ish olive). Tritanopia affects roughly 1 in 30,000 people and
   is not sex-linked. I tried to fix it by rotating `--temp` toward violet: at hue 320 the
   tritan distance improves to 0.044 but `--temp` vs `--action` **collapses** under both
   deuteranopia (0.049) and protanopia (0.044). Trading a defect affecting 8% of men for a
   fix benefiting 0.003% of everyone is the wrong trade, so `--temp` stays at hue 355. The
   residual risk is mitigated by opposite polarity: `--temp` is only ever a *dark solid fill
   with white text*, `--warn-ink` is only ever *dark text on a pale wash*, and validation
   always carries the word REQUIRED.
2. **`--other-ink` vs `--action` is tight under deuteranopia (0.071).** Both sit in the
   blue–violet region. Mitigated structurally and not by hue: `--other` is never a solid
   fill — it appears as small dots, a 1px border, a left rule, and 10.5px label text inside
   the grid; `--action` is a single 56px white-on-solid button in the form column with the
   only shadow in the system. They never appear at the same size or in the same region.
3. **`--warn-ink` vs `--off-ink` is tight under protanopia (0.069)** — protanopes lose
   long-wavelength sensitivity, so a deep red darkens toward the grey of `--off-ink`. Both
   remain legible as *text* (10.03:1 and 15.08:1 on panel); only the hue distinction is
   lost, and error text is always accompanied by wording and a bordered `--warn-wash` panel.
4. **No two roles collapse under deuteranopia or protanopia anywhere in the system.** That
   was the binding constraint, and it is met.

---

## 6. Compromises, stated plainly

**6.1 `--action` and `--edit` are only 1.30:1 apart in luminance, and I could not fix that.**
Both must be dark to carry white text at AAA (7:1 forces a fill below luminance ≈ 0.10).
Two fills that are both below 0.10 cannot be 3:1 from each other. The options were: let one
of them drop to AA-only white text, or accept the luminance overlap. I accepted the overlap,
because a 4.5:1 button label at 6am is a worse failure than two dark fills that never share
a bounding box. They are separated instead by **94° of hue** (162 vs 256), by CVD-verified
distance (§5), by size (a 56px button vs a 24px chip), by the system's only shadow, by a
verb label, and by living in different columns of the layout. If this is judged insufficient
in testing, the fix is to make `--action` a light-on-dark *outline* button — not to lighten
either fill.

**6.2 `--ink-4` sits at 5.91:1 on panel and 5.11:1 on ground — AA, not AAA.** This is the
only text token below 7:1. It is deliberate: `--ink-4` is placeholder and disabled text, and
a placeholder at AAA stops reading as "not filled in yet" and starts reading as a real
value, which causes coaches to submit forms they think they completed. WCAG explicitly
exempts disabled controls; placeholders are not exempt, so I held it at AA with headroom
rather than dropping to the usual 4.5:1 minimum. **Rule: any text a coach must actually read
uses `--ink-3` or darker.** `--ink-4` never carries information.

**6.3 The three light fills — empty / other / off — are 1.3–2.0:1 apart, not 3:1.** Explained
in §3.3: four fill levels at 3:1 does not fit between paper and black. Borders carry the
1.4.11 boundary requirement instead (all ≥3.09:1), and every state also has a distinct
border *style* and text treatment.

**6.4 `--line-soft` is darker than `--line`, which contradicts its name.** The token names
were fixed by the brief. Its role is field borders, and a field border is a control
boundary that WCAG 1.4.11 requires at 3:1, so it had to be at least as strong as a
decorative rule. If these are ever renamed, `--line-soft` → `--line-control` and
`--line` → `--line-quiet` would describe what they now do.

**6.5 The borders are noticeably heavier than the previous theme** — `L 0.62` versus
`L 0.90`, which is roughly a 3:1 line against a 1.5:1 line. The page reads more like a
form and less like a soft document. That is the direct cost of the brief's priority order,
and it is the change most likely to draw comment from the client. It is also the change
that does the most work outdoors.

**6.6 The green is muted (chroma 0.088), not vivid.** Hue 162 at `L 0.448` tops out at
chroma 0.091 inside sRGB; anything more saturated would clip on export and shift
unpredictably across displays. The palette accepts a slightly earthy spruce over a vivid
emerald that only renders correctly on wide-gamut screens.

**6.7 Untested on real hardware.** Every number here is computed from the sRGB colorimetry.
Contrast ratios are not a model of glare, and a phone at 30% brightness in direct sun will
still be hard work. Before this ships, someone should look at the week grid on a mid-range
Android in daylight; that test can invalidate choices this document cannot.

---

## 7. How the numbers were produced

Measurement script: `design/DecidedAgainst/contrast-check-highcontrast.py` (Python 3, no dependencies —
`python3 design/DecidedAgainst/contrast-check-highcontrast.py`). It holds the palette as its single source of truth.

- `oklch(L C H)` → Oklab → LMS → linear sRGB (Björn Ottosson's matrices) → sRGB transfer
  function, with an out-of-gamut check on every token.
- WCAG 2.x relative luminance and contrast ratio per the definitions in *Understanding
  SC 1.4.3*.
- A bisection solver used to place each token at an exact contrast target against its
  intended background rather than by eye.
- Dichromacy simulated via Hunt-Pointer-Estévez LMS with the standard protan/deutan/tritan
  projection matrices; separation then measured as Euclidean distance in Oklab, which is
  perceptually uniform enough for a "would these two look the same" judgement.

Re-run it after any token change. The tables in §3 and §5 are its output verbatim.
