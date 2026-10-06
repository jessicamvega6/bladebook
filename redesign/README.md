# BladeBook redesign — 5 directions

All 41 screens from the canvas (every flow), rebuilt on one shared component set, then styled five ways.
Originals in the parent folder are untouched.

Open **index.html** to switch between options (keys 1–5), step through screens (← →), and press **C** to compare one screen across all five.
Each `option-N-*.html` is the same viewer locked to a single direction.

| # | Option | Typeface | Palette | Navigation |
|---|--------|----------|---------|------------|
| 1 | Glacier | Inter | Cobalt on cool white | Top bar, underline tabs |
| 2 | Evergreen | Plus Jakarta Sans | Deep forest on warm paper, amber accent | Light sidebar |
| 3 | Navy & Ice | IBM Plex Sans | Teal on navy, tight corners | Dark sidebar |
| 4 | Graphite | Geist | Monochrome + indigo signal | Top bar, pill tabs |
| 5 | Harbor | Figtree | Teal and coral on sand, pill buttons | Centered pill nav |

Rules every option follows: one typeface (tabular figures for times and prices), one primary colour for actions and selection, neutrals for structure, and colour otherwise only for status (success, warning, danger).

UX changes shared by all five (each screen's note in the viewer explains its own):
- Booking times: vertical measured timeline (height = duration), so labels no longer rotate 90°; works at phone width.
- Rinkside: Present / No-show are 52px targets; Cancel moved behind “…” to prevent accidental taps.
- Review screens: impact summary first, consequences itemised, action buttons say what they’ll do.
- Fixed in passing: the garbled copy on “Skater — myself”, the 4-box code input (now 6), lesson list sort order, and the week view “today” (set to Tuesday so Wednesday’s lessons are cancellable).

Fonts load from Google Fonts, so open the files with an internet connection.
