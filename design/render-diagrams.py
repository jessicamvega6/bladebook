#!/usr/bin/env python3
"""
Extract every ```mermaid block from docs/architecture.md and emit a single HTML page
where they render as diagrams instead of syntax.

    python3 design/render-diagrams.py

Writes design/architecture-diagrams.html. Re-run it whenever architecture.md changes;
the diagram source is never edited by hand, only lifted verbatim from the doc.

The page renders in Claude Artifacts, which has a mermaid runtime built in. To view it
as a plain local file you need a mermaid script tag as well — see the note the script
prints when it finishes.
"""
import io
import os
import re
import html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs", "architecture.md")
OUT = os.path.join(ROOT, "design", "architecture-diagrams.html")

KIND = {
    "flowchart": "Flowchart",
    "erDiagram": "Entity relationships",
    "sequenceDiagram": "Sequence",
}


# Mermaid's built-in themes were all either too low-contrast ('forest', 'neutral')
# or too dark to sit on a light plate. This is 'base' plus an explicit palette drawn
# from design/theme-forest.md: pale fills, Graphite text, Hunter Green borders — so
# every label clears a comfortable contrast margin against what sits behind it.
# fontSize is the real size lever: mermaid lays out from text metrics, so raising it
# enlarges the whole diagram proportionally instead of stretching it.
_TV = {
    "fontFamily": "IBM Plex Sans, system-ui, sans-serif",
    "fontSize": "18px",
    # flowchart / generic
    "primaryColor": "#D6F7DD",       # --edit-wash
    "primaryTextColor": "#20241F",   # near-Graphite, max contrast on the pale fill
    "primaryBorderColor": "#2F633E",  # Hunter Green
    "secondaryColor": "#E4EDE8",
    "secondaryTextColor": "#20241F",
    "secondaryBorderColor": "#4A5651",
    "tertiaryColor": "#FFFAFB",      # Snow
    "tertiaryTextColor": "#20241F",
    "tertiaryBorderColor": "#4A5651",
    "lineColor": "#3D4643",
    "textColor": "#20241F",
    "mainBkg": "#D6F7DD",
    "nodeBorder": "#2F633E",
    "clusterBkg": "#F1F6F3",
    "clusterBorder": "#7E8A86",
    "titleColor": "#20241F",
    "edgeLabelBackground": "#FFFAFB",
    # sequence
    "actorBkg": "#D6F7DD",
    "actorBorder": "#2F633E",
    "actorTextColor": "#20241F",
    "actorLineColor": "#6E7A76",
    "signalColor": "#20241F",
    "signalTextColor": "#20241F",
    "labelBoxBkgColor": "#E4EDE8",
    "labelBoxBorderColor": "#2F633E",
    "labelTextColor": "#20241F",
    "loopTextColor": "#20241F",
    "noteBkgColor": "#FBF1D6",
    "noteBorderColor": "#B08900",
    "noteTextColor": "#20241F",
    "activationBkgColor": "#B6ECC3",
    "activationBorderColor": "#2F633E",
    "sequenceNumberColor": "#FFFAFB",
    # entity relationship
    "attributeBackgroundColorOdd": "#FFFAFB",
    "attributeBackgroundColorEven": "#EFF5F1",
}
# Built by concatenation, not %-formatting: a "%%" in a %-format string collapses
# to a single "%", which silently turns the directive into `%{init:…}%` and breaks
# every diagram on the page.
THEME = (
    "%%{init: {'theme':'base','themeVariables':{"
    + ",".join("'" + k + "':'" + v + "'" for k, v in _TV.items())
    + "}}}%%"
)


def collect(md):
    """Return [(heading, blurb, kind, source)] for each mermaid block, in document order."""
    lines = md.split("\n")
    out = []
    i = 0
    while i < len(lines):
        if lines[i].strip() == "```mermaid":
            start = i + 1
            j = start
            while j < len(lines) and lines[j].strip() != "```":
                j += 1
            source = "\n".join(lines[start:j]).rstrip()

            # nearest preceding markdown heading
            heading = "Untitled"
            for k in range(i, -1, -1):
                if lines[k].startswith("#"):
                    heading = lines[k].lstrip("#").strip()
                    break

            # first prose paragraph after the block, as a caption
            blurb = ""
            k = j + 1
            while k < len(lines) and not lines[k].strip():
                k += 1
            if k < len(lines):
                cand = lines[k].strip()
                if cand and not cand.startswith(("#", "|", "```", "-", ">", "*")):
                    buf = []
                    while k < len(lines) and lines[k].strip():
                        buf.append(lines[k].strip())
                        k += 1
                    blurb = " ".join(buf)

            first = source.split("\n", 1)[0].strip()
            kind = next((v for k2, v in KIND.items() if first.startswith(k2)), "Diagram")
            out.append((heading, blurb, kind, source))
            i = j
        i += 1
    return out


def strip_md(s, limit=260):
    """Very small markdown-to-text pass — these captions are one paragraph each."""
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"\*(.+?)\*", r"\1", s)
    s = re.sub(r"`(.+?)`", r"\1", s)
    s = re.sub(r"\[(.+?)\]\([^)]*\)", r"\1", s)
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) > limit:
        cut = s[:limit].rsplit(" ", 1)[0]
        s = cut + "…"
    return s


def build(items):
    figs = []
    nav = []
    for n, (heading, blurb, kind, source) in enumerate(items, 1):
        slug = "d%d" % n
        nav.append(
            '<a href="#%s"><span class="i">%02d</span>%s</a>'
            % (slug, n, html.escape(heading))
        )
        cap = (
            '\n        <p class="cap">%s</p>' % html.escape(strip_md(blurb))
            if blurb
            else ""
        )
        themed = THEME + "\n" + source
        figs.append(
            """      <figure id="{slug}">
        <figcaption>
          <span class="num">{num:02d}</span>
          <span class="ttl">{heading}</span>
          <span class="kind">{kind}</span>
        </figcaption>{cap}
        <div class="plate">
          <pre class="mermaid">{src}</pre>
        </div>
        <details>
          <summary>Source</summary>
          <pre class="src"><code>{raw}</code></pre>
        </details>
      </figure>""".format(
                slug=slug,
                num=n,
                heading=html.escape(heading),
                kind=html.escape(kind),
                cap=cap,
                src=html.escape(themed),
                raw=html.escape(source),
            )
        )

    return PAGE.replace("<!--NAV-->", "\n        ".join(nav)).replace(
        "<!--FIGS-->", "\n\n".join(figs)
    ).replace("<!--COUNT-->", str(len(items)))


PAGE = """<title>BladeBook Architecture Diagrams</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:wght@600;700&display=swap">

<style>
:root{
  --ground:#EDF3F0; --ground-2:#E7EEEA; --panel:#FFFAFB; --sunk:#DBE3DE;
  --line:#748181; --line-soft:#869292;
  --ink:#2B2C28; --ink-2:#494F4A; --ink-3:#5B635D; --ink-4:#66706C;
  --edit:#2F633E; --edit-ink:#19552D; --edit-line:#257E41;
  --other-line:#339953; --other-ink:#345F40;
  --shadow:0 1px 2px rgba(43,44,40,.06), 0 10px 30px -14px rgba(43,44,40,.22);
}
:root:not([data-theme="light"]){
  @media (prefers-color-scheme: dark){
    --ground:#171B19; --ground-2:#1E2321; --panel:#232927; --sunk:#161A18;
    --line:#5D6867; --line-soft:#4C5654;
    --ink:#E8EEEA; --ink-2:#B9C3BD; --ink-3:#9AA6A0; --ink-4:#828E88;
    --edit:#8AE5A1; --edit-ink:#A8EFBB; --edit-line:#3E9159;
    --other-line:#4AA167; --other-ink:#9EE3B2;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 30px -14px rgba(0,0,0,.7);
  }
}
:root[data-theme="dark"]{
  --ground:#171B19; --ground-2:#1E2321; --panel:#232927; --sunk:#161A18;
  --line:#5D6867; --line-soft:#4C5654;
  --ink:#E8EEEA; --ink-2:#B9C3BD; --ink-3:#9AA6A0; --ink-4:#828E88;
  --edit:#8AE5A1; --edit-ink:#A8EFBB; --edit-line:#3E9159;
  --other-line:#4AA167; --other-ink:#9EE3B2;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 30px -14px rgba(0,0,0,.7);
}

*{box-sizing:border-box}
body{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;
  font-size:16px; line-height:1.6; -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1180px; margin:0 auto; padding:56px 28px 110px}

.eyebrow{
  font-family:"IBM Plex Mono",ui-monospace,monospace;
  font-size:.72rem; font-weight:500; letter-spacing:.14em; text-transform:uppercase;
  color:var(--ink-3); margin:0 0 16px;
}
h1{
  font-family:"IBM Plex Serif",Georgia,serif; font-weight:700;
  font-size:clamp(2.1rem,4.4vw,3rem); line-height:1.08; letter-spacing:-.02em;
  margin:0 0 14px; text-wrap:balance;
}
.lede{font-size:1.08rem; color:var(--ink-2); max-width:66ch; margin:0 0 34px}
.lede strong{color:var(--ink); font-weight:600}
.lede code{
  font-family:"IBM Plex Mono",ui-monospace,monospace; font-size:.86em;
  background:var(--sunk); padding:1px 5px; border-radius:4px; color:var(--ink-2);
}

nav{
  display:flex; flex-wrap:wrap; gap:8px; margin:0 0 52px;
  padding:0 0 30px; border-bottom:1px solid var(--line-soft);
}
nav a{
  display:inline-flex; align-items:baseline; gap:8px;
  font-size:.82rem; color:var(--ink-2); text-decoration:none;
  background:var(--panel); border:1px solid var(--line-soft);
  border-radius:999px; padding:6px 15px 6px 11px;
}
nav a:hover{border-color:var(--edit); color:var(--edit-ink)}
nav a:focus-visible{outline:2px solid var(--edit-line); outline-offset:2px}
nav .i{
  font-family:"IBM Plex Mono",ui-monospace,monospace;
  font-size:.68rem; color:var(--ink-4); font-weight:600;
}

figure{margin:0 0 66px; scroll-margin-top:24px}
figcaption{
  display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; margin:0 0 8px;
}
figcaption .num{
  font-family:"IBM Plex Mono",ui-monospace,monospace;
  font-size:.75rem; font-weight:600; color:var(--edit-ink);
}
figcaption .ttl{font-size:1.22rem; font-weight:600; letter-spacing:-.01em}
figcaption .kind{
  font-family:"IBM Plex Mono",ui-monospace,monospace;
  font-size:.62rem; font-weight:600; letter-spacing:.11em; text-transform:uppercase;
  color:var(--ink-3); border:1px solid var(--line-soft);
  border-radius:4px; padding:2px 7px;
}
.cap{
  font-size:.9rem; color:var(--ink-3); max-width:74ch; margin:0 0 16px;
}

/* Diagrams sit on a fixed light plate in both themes — mermaid draws its own
   palette and reads as a printed plate rather than inheriting the page ground. */
.plate{
  background:#FFFAFB; border:1px solid var(--line-soft); border-radius:12px;
  box-shadow:var(--shadow); padding:26px 22px;
  overflow-x:auto;
}
.plate .mermaid{
  margin:0; min-width:min-content;
  font-family:"IBM Plex Sans",sans-serif;
}
/* Mermaid writes an inline max-width onto the SVG that pins it at its natural
   size — often far smaller than the plate. Override it and drive width from the
   zoom control instead; the viewBox keeps every diagram proportional. */
.plate svg{
  max-width:none !important;
  width:calc(100% * var(--dscale,1)) !important;
  height:auto !important;
  display:block; margin:0 auto;
}

.zoom{
  display:flex; align-items:center; gap:6px; margin:0 0 26px;
  font-family:"IBM Plex Mono",ui-monospace,monospace; font-size:.72rem;
}
.zoom .lbl{
  letter-spacing:.11em; text-transform:uppercase; color:var(--ink-3);
  margin-right:4px;
}
.zoom button{
  font:inherit; cursor:pointer; color:var(--ink-2);
  background:var(--panel); border:1px solid var(--line-soft);
  border-radius:6px; padding:5px 13px;
}
.zoom button:hover{border-color:var(--edit); color:var(--edit-ink)}
.zoom button:focus-visible{outline:2px solid var(--edit-line); outline-offset:2px}
.zoom button[aria-pressed="true"]{
  background:var(--edit); border-color:var(--edit); color:#FFFAFB; font-weight:600;
}
.zoom .hint{color:var(--ink-4); margin-left:8px; text-transform:none; letter-spacing:0}

details{margin:12px 0 0}
summary{
  font-family:"IBM Plex Mono",ui-monospace,monospace;
  font-size:.72rem; letter-spacing:.09em; text-transform:uppercase;
  color:var(--ink-4); cursor:pointer; padding:5px 0; width:max-content;
}
summary:hover{color:var(--edit-ink)}
summary:focus-visible{outline:2px solid var(--edit-line); outline-offset:3px}
pre.src{
  margin:8px 0 0; padding:15px 17px; overflow-x:auto;
  background:var(--sunk); border:1px solid var(--line-soft); border-radius:8px;
  font-family:"IBM Plex Mono",ui-monospace,monospace;
  font-size:.74rem; line-height:1.65; color:var(--ink-2);
}

.foot{
  margin-top:20px; padding-top:20px; border-top:1px solid var(--line-soft);
  font-family:"IBM Plex Mono",ui-monospace,monospace;
  font-size:.72rem; color:var(--ink-4);
  display:flex; gap:20px; flex-wrap:wrap;
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>

<div class="wrap">
  <p class="eyebrow">BladeBook · generated from docs/architecture.md</p>
  <h1>Architecture Diagrams</h1>
  <p class="lede">All <!--COUNT--> mermaid diagrams from <code>architecture.md</code>, rendered.
  <strong>Nothing here is hand-drawn</strong> — each one is lifted verbatim from the document,
  so re-running <code>design/render-diagrams.py</code> after an edit regenerates this page
  rather than letting it drift. Every diagram keeps its source one click away.</p>

  <nav>
        <!--NAV-->
  </nav>

  <div class="zoom" role="group" aria-label="Diagram size">
    <span class="lbl">Size</span>
    <button type="button" data-s="1" aria-pressed="false">Fit</button>
    <button type="button" data-s="1.5" aria-pressed="true">150%</button>
    <button type="button" data-s="2" aria-pressed="false">200%</button>
    <button type="button" data-s="3" aria-pressed="false">300%</button>
    <span class="hint">above Fit, plates scroll sideways</span>
  </div>

<!--FIGS-->

  <p class="foot">
    <span>regenerate: python3 design/render-diagrams.py</span>
    <span>source of truth: docs/architecture.md</span>
  </p>
</div>

<script>
(function () {
  var root = document.documentElement;
  var btns = Array.prototype.slice.call(document.querySelectorAll('.zoom button'));

  function apply(scale, pressed) {
    root.style.setProperty('--dscale', scale);
    btns.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b === pressed));
    });
    try { localStorage.setItem('bb-dscale', scale); } catch (e) {}
  }

  btns.forEach(function (b) {
    b.addEventListener('click', function () { apply(b.dataset.s, b); });
  });

  var saved = null;
  try { saved = localStorage.getItem('bb-dscale'); } catch (e) {}
  var start = btns.filter(function (b) { return b.dataset.s === saved; })[0]
           || btns.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; })[0]
           || btns[0];
  apply(start.dataset.s, start);
})();
</script>
"""

if __name__ == "__main__":
    md = io.open(SRC, encoding="utf-8").read()
    items = collect(md)
    io.open(OUT, "w", encoding="utf-8").write(build(items))
    print("Wrote %s — %d diagrams" % (os.path.relpath(OUT, ROOT), len(items)))
    for n, (h, _, k, _) in enumerate(items, 1):
        print("  %02d  %-14s %s" % (n, k, h))
    print(
        "\nRenders as-is in Claude Artifacts (mermaid runtime is built in).\n"
        "For a plain local file, add a mermaid script tag before </body>, or use\n"
        "VS Code's Markdown Preview Mermaid extension straight on architecture.md."
    )
