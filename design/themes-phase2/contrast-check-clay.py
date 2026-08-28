#!/usr/bin/env python3
"""BladeBook 'Clay' theme audit: oklch -> sRGB -> WCAG, gamut, CVD (Vienot/Brettel)."""
import math, itertools

M2_INV=[[1.0,0.3963377774,0.2158037573],[1.0,-0.1055613458,-0.0638541728],[1.0,-0.0894841775,-1.2914855480]]
M1_INV=[[4.0767416621,-3.3077115913,0.2309699292],[-1.2684380046,2.6097574011,-0.3413193965],[-0.0041960863,-0.7034186147,1.7076147010]]
M1=[[0.4122214708,0.5363325363,0.0514459929],[0.2119034982,0.6806995451,0.1073969566],[0.0883024619,0.2817188376,0.6299787005]]
M2=[[0.2104542553,0.7936177850,-0.0040720468],[1.9779984951,-2.4285922050,0.4505937099],[0.0259040371,0.7827717662,-0.8086757660]]
def mv(M,v): return [sum(M[i][j]*v[j] for j in range(3)) for i in range(3)]
def enc(c):
    c=max(0.0,min(1.0,c)); return 12.92*c if c<=0.0031308 else 1.055*(c**(1/2.4))-0.055
def dec(c): return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def oklch_lin(L,C,H):
    h=math.radians(H); lab=[L,C*math.cos(h),C*math.sin(h)]
    return mv(M1_INV,[x**3 for x in mv(M2_INV,lab)])
def oklch_srgb(L,C,H):
    lin=oklch_lin(L,C,H)
    return [enc(x) for x in lin], any(x<-0.0005 or x>1.0005 for x in lin)
def hexof(t): 
    s,_=oklch_srgb(*t); return "#"+"".join(f"{round(c*255):02X}" for c in s)
def clipped(t): return oklch_srgb(*t)[1]
def relY(s): r,g,b=[dec(c) for c in s]; return 0.2126*r+0.7152*g+0.0722*b
def Y(t): s,_=oklch_srgb(*t); return relY(s)
def cr_srgb(a,b):
    la,lb=relY(a),relY(b); hi,lo=max(la,lb),min(la,lb); return (hi+.05)/(lo+.05)
def cr(a,b):
    la,lb=Y(a),Y(b); hi,lo=max(la,lb),min(la,lb); return (hi+.05)/(lo+.05)

# ---- SANITY ----
W=(1.0,0.0,89.9); K=(0.0,0.0,0.0)
assert abs(cr(W,K)-21.0)<1e-6, cr(W,K)
SANITY=cr(W,K)

# ---- CVD: Vienot 1999 / Brettel LMS dichromat projection ----
RGB2LMS=[[17.8824,43.5161,4.11935],[3.45565,27.1554,3.86714],[0.0299566,0.184309,1.46709]]
LMS2RGB=[[0.0809444479,-0.130504409,0.116721066],[-0.0102485335,0.0540193266,-0.113614708],[-0.000365296938,-0.00412161469,0.693511405]]
SIM={"protanopia":[[0,2.02344,-2.52581],[0,1,0],[0,0,1]],
     "deuteranopia":[[1,0,0],[0.494207,0,1.24827],[0,0,1]],
     "tritanopia":[[1,0,0],[0,1,0],[-0.395913,0.801109,0]]}
def simulate(s,kind):
    lin=[dec(c)*255 for c in s]
    out=mv(LMS2RGB, mv(SIM[kind], mv(RGB2LMS,lin)))
    return [enc(max(0.0,min(1.0,x/255))) for x in out]
def oklab(s):
    lin=[dec(c) for c in s]
    return mv(M2,[math.copysign(abs(x)**(1/3),x) for x in mv(M1,lin)])
def dE(a,b): return math.sqrt(sum((x-y)**2 for x,y in zip(oklab(a),oklab(b))))

# ================= PALETTE: "Clay" =================
SRC = {"Chocolate Plum":(0.4303,0.0393,4.7),"Dusty Rose":(0.6205,0.0659,11.5),
       "Light Bronze":(0.7516,0.0750,49.9),"Tangerine Dream":(0.8061,0.1148,40.5),
       "Peach Glow":(0.8562,0.0902,56.4)}

P = {
 "--ground":      (0.973, 0.008, 58),
 "--panel":       (0.992, 0.003, 58),
 "--ground-2":    (0.945, 0.010, 58),
 "--sunk":        (0.922, 0.012, 55),

 "--line":        (0.620, 0.024, 40),
 "--line-soft":   (0.655, 0.020, 40),
 "--line-dash":   (0.598, 0.026, 40),

 "--ink":         (0.264, 0.032, 15),
 "--ink-2":       (0.355, 0.034, 15),
 "--ink-3":       (0.4303,0.0393, 4.7),
 "--ink-4":       (0.550, 0.028, 15),

 "--edit":        (0.660, 0.108, 49.9),
 "--on-edit":     (0.230, 0.030, 15),
 "--edit-wash":   (0.955, 0.022, 55),
 "--edit-wash-2": (0.8061,0.1148,40.5),
 "--edit-line":   (0.628, 0.108, 49.9),
 "--edit-ink":    (0.430, 0.090, 48),

 "--other":       (0.397, 0.085, 11.5),
 "--other-wash":  (0.958, 0.018, 11.5),
 "--other-line":  (0.6205,0.0659,11.5),
 "--other-ink":   (0.375, 0.078, 11.5),
 "--other-band":  (0.885, 0.045, 11.5),

 "--action":      (0.270, 0.055, 10),
 "--action-ink":  (0.990, 0.004, 58),

 "--off-fill":    (0.898, 0.006, 58),
 "--off-line":    (0.592, 0.010, 58),
 "--off-ink":     (0.392, 0.010, 58),

 "--warn-wash":   (0.952, 0.020, 30),
 "--warn-line":   (0.610, 0.170, 28),
 "--warn-ink":    (0.448, 0.162, 28),

 "--temp":        (0.330, 0.095, 345),
 "--temp-wash":   (0.955, 0.024, 345),
 "--temp-line":   (0.610, 0.090, 345),
 "--on-temp":     (0.8562,0.0902,56.4),
}

REQ_TEXT=[("--ink","--panel",7),("--ink","--ground",7),("--ink-2","--panel",7),
 ("--ink-3","--panel",7),("--ink-4","--panel",4.5),("--on-edit","--edit",4.5),
 ("--action-ink","--action",7),("--edit-ink","--edit-wash",7),("--other-ink","--other-wash",7),
 ("--off-ink","--off-fill",7),("--warn-ink","--warn-wash",7),("--on-temp","--temp",4.5),
 ("--edit","--other",3),("--edit","--action",3),("--edit","--temp",3)]
REQ_NONTEXT=[("--line","--panel"),("--edit","--panel"),("--off-line","--off-fill"),("--other-line","--other-wash")]
EXTRA_TEXT=[("--ink","--ground-2"),("--ink","--sunk"),("--ink","--edit-wash"),("--ink","--other-wash"),
 ("--ink","--off-fill"),("--ink","--edit-wash-2"),("--ink","--other-band"),("--ink-3","--ground"),
 ("--edit-ink","--panel"),("--other-ink","--panel"),("--warn-ink","--panel"),("--ink-4","--ground"),
 ("--ink","--temp-wash"),("--ink","--warn-wash"),("--on-edit","--edit-wash-2"),("--other-ink","--other-band")]
EXTRA_NONTEXT=[("--line-soft","--panel"),("--line-dash","--panel"),("--line","--ground"),
 ("--edit","--edit-wash"),("--edit","--other-wash"),("--edit","--off-fill"),("--edit","--ground-2"),
 ("--other-line","--panel"),("--other-line","--ground-2"),("--off-line","--panel"),
 ("--edit-line","--panel"),("--edit-line","--edit-wash"),("--edit-line","--ground-2"),("--edit-line","--off-fill"),("--edit-line","--other-wash"),("--off-line","--ground-2"),("--off-line","--other-wash"),
 ("--warn-line","--panel"),("--warn-line","--warn-wash"),("--temp-line","--panel"),("--temp-line","--temp-wash"),
 ("--temp","--panel"),("--action","--panel"),("--other","--panel"),("--other","--other-wash"),
 ("--temp","--action"),("--temp","--other"),
 ("--action","--ground"),]

def mark(r,t): return "AAA" if r>=7 else ("AA" if r>=t or (t<=3 and r>=3) else "FAIL")
def fmt(v): return f"oklch({v[0]:.3f} {v[1]:.3f} {v[2]:g})"

print(f"SANITY CHECK  white/black = {SANITY:.4f}  (must be 21.0000)\n")
print("=== SOURCE PALETTE ===")
for n,v in SRC.items(): print(f"  {n:16s} {hexof(v)}  {fmt(v)}  Y={Y(v):.4f}")
print("\n=== GAMUT ===")
bad=[k for k,v in P.items() if clipped(v)]
print("  outside sRGB:", ", ".join(bad) if bad else "none - all 34 tokens in gamut")
print("\n=== TOKENS ===")
for k,v in P.items(): print(f"  {k:16s} {fmt(v):24s} {hexof(v)}  Y={Y(v):.4f}")

def table(title,pairs,default_t=None):
    print(f"\n=== {title} ===")
    for item in pairs:
        if len(item)==3: a,b,t=item
        else: a,b=item; t=default_t
        r=cr(P[a],P[b]); st="PASS" if r>=t else "FAIL"
        aaa="AAA" if r>=7 else ("AA" if r>=4.5 else "-")
        print(f"  {a+' / '+b:32s} {r:6.2f}:1  target {t:>3}  {st:4s}  [{aaa}]")
table("REQUIRED TEXT PAIRS",REQ_TEXT)
table("REQUIRED NON-TEXT PAIRS (1.4.11)",REQ_NONTEXT,3)
table("ADDITIONAL TEXT PAIRS",[(a,b,4.5) for a,b in EXTRA_TEXT])
table("ADDITIONAL NON-TEXT PAIRS",EXTRA_NONTEXT,3)
SURFACES=[("--off-fill","--panel"),("--other-wash","--ground-2"),("--off-fill","--ground-2"),
 ("--sunk","--panel"),("--edit-wash-2","--panel"),("--other-band","--panel"),("--ground","--panel"),
 ("--ground-2","--ground"),("--edit-wash","--panel"),("--other-wash","--panel")]
print("\n=== SURFACE-TO-SURFACE (WCAG 1.4.11 EXEMPT: backgrounds, not component boundaries) ===")
for a,b in SURFACES:
    print(f"  {a+' / '+b:32s} {cr(P[a],P[b]):6.2f}:1   informational")

print("\n=== SLOT-STATE LUMINANCE LADDER ===")
for k in ["--panel","--edit-wash","--other-wash","--ground-2","--off-fill","--edit-wash-2","--edit"]:
    print(f"  {k:16s} Y={Y(P[k]):.4f}  {hexof(P[k])}")

print("\n=== CVD: post-simulation contrast, required accent pairs ===")
CVDP=[("--edit","--action"),("--edit","--other"),("--edit","--temp"),
      ("--edit","--other-wash"),("--action","--temp"),("--edit","--off-fill"),
      ("--edit-ink","--other-ink"),("--warn-ink","--other-ink"),("--edit","--edit-wash")]
for kind in ["deuteranopia","protanopia","tritanopia"]:
    print(f"\n  -- {kind} --")
    for a,b in CVDP:
        sa,_=oklch_srgb(*P[a]); sb,_=oklch_srgb(*P[b])
        qa,qb=simulate(sa,kind),simulate(sb,kind)
        n=cr_srgb(sa,sb); c=cr_srgb(qa,qb); d=dE(qa,qb)
        flag="COLLAPSE" if d<0.055 else ("tight" if d<0.10 else "ok")
        print(f"    {a+' vs '+b:28s} normal {n:5.2f}:1 -> sim {c:5.2f}:1  dE={d:.3f}  {flag}   "
              f"{hexof(P[a])}->{'#'+''.join(f'{round(x*255):02X}' for x in qa)}  "
              f"{hexof(P[b])}->{'#'+''.join(f'{round(x*255):02X}' for x in qb)}")

print("\n=== WORST CASE ===")
allp=[(a,b,t) for a,b,t in REQ_TEXT]+[(a,b,3) for a,b in REQ_NONTEXT]+\
     [(a,b,4.5) for a,b in EXTRA_TEXT]+[(a,b,3) for a,b in EXTRA_NONTEXT]
fails=[(cr(P[a],P[b]),a,b,t) for a,b,t in allp if cr(P[a],P[b])<t]
fails.sort()
print("  failures vs their own target:")
for r,a,b,t in fails: print(f"    {a} / {b}  {r:.2f}:1 (target {t})")
if not fails: print("    none")
lo=min((cr(P[a],P[b]),a,b) for a,b,t in allp)
print(f"  lowest ratio measured anywhere: {lo[1]} / {lo[2]} = {lo[0]:.2f}:1")




