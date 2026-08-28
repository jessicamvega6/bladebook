#!/usr/bin/env python3
"""oklch -> sRGB -> WCAG contrast, plus dichromat simulation. No external deps."""
import math, sys, json

# ---------- oklch -> linear sRGB ----------
M2_INV = [
    [ 1.0,  0.3963377774,  0.2158037573],
    [ 1.0, -0.1055613458, -0.0638541728],
    [ 1.0, -0.0894841775, -1.2914855480],
]
M1_INV = [
    [ 4.0767416621, -3.3077115913,  0.2309699292],
    [-1.2684380046,  2.6097574011, -0.3413193965],
    [-0.0041960863, -0.7034186147,  1.7076147010],
]

def mv(M, v):
    return [sum(M[i][j]*v[j] for j in range(3)) for i in range(3)]

def oklch_to_linear_srgb(L, C, H):
    h = math.radians(H)
    lab = [L, C*math.cos(h), C*math.sin(h)]
    lms_ = mv(M2_INV, lab)
    lms = [x**3 for x in lms_]
    return mv(M1_INV, lms)

def enc(c):
    c = max(0.0, min(1.0, c))
    return 12.92*c if c <= 0.0031308 else 1.055*(c**(1/2.4)) - 0.055

def dec(c):
    return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4

def oklch_to_srgb(L, C, H):
    lin = oklch_to_linear_srgb(L, C, H)
    clipped = any(x < -0.0005 or x > 1.0005 for x in lin)
    return [enc(x) for x in lin], clipped

def hexof(L, C, H):
    srgb, _ = oklch_to_srgb(L, C, H)
    return "#" + "".join(f"{round(c*255):02X}" for c in srgb)

def gamut_clipped(L, C, H):
    return oklch_to_srgb(L, C, H)[1]

# ---------- WCAG ----------
def rel_lum_srgb(srgb):
    r, g, b = [dec(c) for c in srgb]
    return 0.2126*r + 0.7152*g + 0.0722*b

def lum(tok):
    srgb, _ = oklch_to_srgb(*tok)
    return rel_lum_srgb(srgb)

def contrast(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

def contrast_srgb(sa, sb):
    la, lb = rel_lum_srgb(sa), rel_lum_srgb(sb)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

# ---------- dichromat simulation (Vienot/Brettel-style, LMS via Hunt-Pointer-Estevez) ----------
RGB2LMS = [
    [17.8824,   43.5161,   4.11935],
    [ 3.45565,  27.1554,   3.86714],
    [ 0.0299566, 0.184309, 1.46709],
]
LMS2RGB = [
    [ 0.0809444479, -0.130504409,  0.116721066],
    [-0.0102485335,  0.0540193266, -0.113614708],
    [-0.000365296938,-0.00412161469, 0.693511405],
]
SIM = {
    "protan": [[0,2.02344,-2.52581],[0,1,0],[0,0,1]],
    "deutan": [[1,0,0],[0.494207,0,1.24827],[0,0,1]],
    "tritan": [[1,0,0],[0,1,0],[-0.395913,0.801109,0]],
}

def simulate(srgb, kind):
    lin = [dec(c)*255 for c in srgb]
    lms = mv(RGB2LMS, lin)
    lms2 = mv(SIM[kind], lms)
    out = mv(LMS2RGB, lms2)
    return [enc(max(0.0, min(1.0, x/255))) for x in out]

def dist(a, b):
    """perceptual-ish distance in sRGB after CVD sim: use oklab of the simulated colours"""
    return math.sqrt(sum((x-y)**2 for x, y in zip(srgb_to_oklab(a), srgb_to_oklab(b))))

M1 = [[0.4122214708,0.5363325363,0.0514459929],
      [0.2119034982,0.6806995451,0.1073969566],
      [0.0883024619,0.2817188376,0.6299787005]]
M2 = [[0.2104542553,0.7936177850,-0.0040720468],
      [1.9779984951,-2.4285922050,0.4505937099],
      [0.0259040371,0.7827717662,-0.8086757660]]

def srgb_to_oklab(srgb):
    lin = [dec(c) for c in srgb]
    lms = mv(M1, lin)
    lms_ = [math.copysign(abs(x)**(1/3), x) for x in lms]
    return mv(M2, lms_)

def hue_of(srgb):
    L, a, b = srgb_to_oklab(srgb)
    return math.degrees(math.atan2(b, a)) % 360, math.sqrt(a*a+b*b), L

# ---------- solver ----------
def solve_L(C, H, bg, target, direction="darker", lo=0.0, hi=1.0):
    """find L such that contrast((L,C,H), bg) == target"""
    for _ in range(80):
        mid = (lo+hi)/2
        c = contrast((mid, C, H), bg)
        if direction == "darker":
            if c > target: lo = mid
            else: hi = mid
        else:
            if c > target: hi = mid
            else: lo = mid
    return round((lo+hi)/2, 4)

# ================= PALETTE =================
P = {
 "--ground":      (0.945, 0.006, 250),
 "--panel":       (0.995, 0.002, 250),
 "--ground-2":    (0.972, 0.005, 250),
 "--sunk":        (0.918, 0.008, 250),

 "--line":        (0.618, 0.018, 255),
 "--line-soft":   (0.585, 0.020, 255),
 "--line-dash":   (0.548, 0.022, 255),

 "--ink":         (0.200, 0.035, 258),
 "--ink-2":       (0.335, 0.032, 258),
 "--ink-3":       (0.422, 0.028, 258),
 "--ink-4":       (0.500, 0.022, 258),

 "--edit":        (0.448, 0.088, 162),
 "--on-edit":     (0.995, 0.002, 250),
 "--edit-wash":   (0.964, 0.034, 162),
 "--edit-wash-2": (0.928, 0.066, 162),
 "--edit-line":   (0.605, 0.098, 162),
 "--edit-ink":    (0.345, 0.070, 162),

 "--other":       (0.430, 0.100, 305),
 "--other-wash":  (0.895, 0.042, 305),
 "--other-line":  (0.585, 0.095, 305),
 "--other-ink":   (0.340, 0.120, 305),
 "--other-band":  (0.830, 0.068, 305),

 "--action":      (0.400, 0.135, 256),
 "--action-ink":  (0.995, 0.002, 250),

 "--off-fill":    (0.755, 0.006, 255),
 "--off-line":    (0.472, 0.012, 255),
 "--off-ink":     (0.265, 0.014, 255),

 "--warn-wash":   (0.950, 0.022,  27),
 "--warn-line":   (0.575, 0.150,  27),
 "--warn-ink":    (0.395, 0.155,  27),

 "--temp":        (0.420, 0.155, 355),
 "--temp-wash":   (0.956, 0.023, 355),
 "--temp-line":   (0.600, 0.135, 355),
 "--on-temp":     (0.995, 0.002, 250),
}

TEXT_PAIRS = [
 ("--ink","--panel",   "body text on card",            7.0),
 ("--ink","--ground",  "body text on page",            7.0),
 ("--ink-2","--panel", "secondary text",               7.0),
 ("--ink-3","--panel", "supporting / micro-labels",    7.0),
 ("--ink-4","--panel", "placeholder / disabled",       4.5),
 ("--on-edit","--edit","label on editing slot",        7.0),
 ("--action-ink","--action","primary button label",    7.0),
 ("--edit-ink","--edit-wash","accent text on tint",    7.0),
 ("--other-ink","--other-wash","other-block slot text",7.0),
 ("--off-ink","--off-fill","struck-through off label", 7.0),
 ("--warn-ink","--warn-wash","validation text",        7.0),
 ("--on-temp","--temp",  "label on temporary slot",    7.0),
 ("--other-ink","--other-band","block-length band text",7.0),
 ("--ink","--ground-2",  "text on secondary panel",     7.0),
 ("--ink","--sunk",      "text in inset well",          7.0),
 ("--ink","--edit-wash", "text on edited column",       7.0),
 ("--ink","--other-wash","text on other column",        7.0),
 ("--ink-3","--ground",  "micro-label on page",         7.0),
 ("--ink","--off-fill",  "text on off fill",            7.0),
]

NONTEXT_PAIRS = [
 ("--line","--panel",        "default border vs card"),
 ("--edit","--panel",        "editing slot fill vs card"),
 ("--off-line","--off-fill", "dashed border vs off fill"),
 ("--other-line","--other-wash","other border vs its wash"),
 ("--line-soft","--panel",   "field border vs card"),
 ("--line-dash","--panel",   "dashed outline vs card"),
 ("--off-fill","--panel",    "off fill vs card"),
 ("--edit","--other-wash",   "editing vs other slot"),
 ("--edit","--off-fill",     "editing vs off slot"),
 ("--other-wash","--off-fill","other vs off slot"),
 ("--action","--edit",       "commit button vs editing fill"),
 ("--warn-line","--panel",   "warn border vs card"),
 ("--edit-line","--panel",   "edit border vs card"),
 ("--temp-line","--panel",   "temp border vs card"),
 ("--other-band","--panel",  "other header band vs card"),
 ("--edit-line","--edit-wash",  "edit border vs edit wash"),
 ("--warn-line","--warn-wash",  "warn border vs warn wash"),
 ("--temp-line","--temp-wash",  "temp border vs temp wash"),
 ("--off-line","--panel",       "dashed off border vs card"),
 ("--line","--ground",          "border vs page"),
 ("--edit","--ground-2",        "editing fill vs empty column"),
 ("--other-wash","--ground-2",  "other wash vs empty column"),
 ("--off-fill","--ground-2",    "off fill vs empty column"),
 ("--other-band","--other-wash","band vs other wash"),
 ("--temp","--panel",           "temp fill vs card"),
 ("--action","--panel",         "commit button vs card"),
]

def fmt(v):
    return f"oklch({v[0]:.3f} {v[1]:.3f} {v[2]:.0f})"

def main():
    print("=== GAMUT ===")
    bad = [k for k,v in P.items() if gamut_clipped(*v)]
    print("out of sRGB gamut:", bad or "none")
    print()
    print("=== HEX ===")
    for k,v in P.items():
        print(f"{k:16s} {fmt(v):26s} {hexof(*v)}")
    print()
    print("=== TEXT CONTRAST ===")
    print(f"{'pair':34s} {'ratio':>7s}  {'AA4.5':>6s} {'AAA7':>6s}  note")
    worst = (999, "")
    for a,b,note,tgt in TEXT_PAIRS:
        r = contrast(P[a], P[b])
        if r < worst[0]: worst = (r, f"{a}/{b}")
        print(f"{a+' / '+b:34s} {r:7.2f}  {'PASS' if r>=4.5 else 'FAIL':>6s} "
              f"{'PASS' if r>=7 else 'fail':>6s}  {note}")
    print(f"\nLOWEST TEXT PAIR: {worst[1]} = {worst[0]:.2f}:1")
    print()
    print("=== NON-TEXT CONTRAST (WCAG 1.4.11, target 3:1) ===")
    for a,b,note in NONTEXT_PAIRS:
        r = contrast(P[a], P[b])
        print(f"{a+' / '+b:34s} {r:7.2f}  {'PASS' if r>=3 else 'FAIL':>6s}  {note}")
    print()
    print("=== SLOT-STATE SEPARATION (greyscale / luminance) ===")
    for k in ["--edit","--other-wash","--off-fill","--ground-2","--panel"]:
        print(f"{k:16s} relative luminance {lum(P[k]):.4f}")
    print()
    print("=== CVD: accent pairs after dichromat simulation ===")
    accents = ["--edit","--action","--other","--temp","--warn-ink","--off-ink",
               "--edit-ink","--other-ink"]
    pairs = [(a,b) for i,a in enumerate(accents) for b in accents[i+1:]]
    for kind in ["deutan","protan","tritan"]:
        print(f"\n-- {kind} --")
        rows = []
        for a,b in pairs:
            sa,_ = oklch_to_srgb(*P[a]); sb,_ = oklch_to_srgb(*P[b])
            qa, qb = simulate(sa, kind), simulate(sb, kind)
            d = dist(qa, qb)
            d0 = dist(sa, sb)
            rows.append((d, d0, a, b, hexof(*P[a]), hexof(*P[b]),
                         "#"+"".join(f"{round(c*255):02X}" for c in qa),
                         "#"+"".join(f"{round(c*255):02X}" for c in qb),
                         contrast_srgb(qa, qb)))
        rows.sort()
        for d,d0,a,b,ha,hb,qa,qb,cr in rows:
            flag = "  <-- COLLAPSE" if d < 0.055 else ("  <-- tight" if d < 0.10 else "")
            print(f"{a+' vs '+b:28s} normalD={d0:.3f} simD={d:.3f} lumRatio={cr:.2f} "
                  f"{ha}->{qa} {hb}->{qb}{flag}")


COOCCUR = {
 "weekly mode (co-visible roles)": ["--edit","--other-ink","--action","--warn-ink","--off-ink"],
 "temporary mode (co-visible roles)": ["--temp","--other-ink","--action","--warn-ink","--off-ink"],
}

def cooccur():
    print()
    print("=== CVD: ONLY roles that appear on screen together ===")
    for mode, toks in COOCCUR.items():
        print(f"\n[{mode}]")
        for kind in ["deutan","protan","tritan"]:
            worst = None
            for i,a in enumerate(toks):
                for b in toks[i+1:]:
                    sa,_ = oklch_to_srgb(*P[a]); sb,_ = oklch_to_srgb(*P[b])
                    d = dist(simulate(sa,kind), simulate(sb,kind))
                    if worst is None or d < worst[0]: worst = (d,a,b)
            print(f"  {kind:7s} worst pair: {worst[1]} vs {worst[2]}  simD={worst[0]:.3f}"
                  + ("   <-- COLLAPSE" if worst[0] < 0.055 else "   <-- tight" if worst[0] < 0.10 else "   ok"))
            for i,a in enumerate(toks):
                for b in toks[i+1:]:
                    sa,_ = oklch_to_srgb(*P[a]); sb,_ = oklch_to_srgb(*P[b])
                    d = dist(simulate(sa,kind), simulate(sb,kind))
                    print(f"      {a+' vs '+b:26s} {d:.3f}")

if __name__ == "__main__":
    main()
    cooccur()
