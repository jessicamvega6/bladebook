#!/usr/bin/env python3
"""Turn PIT's mutations.xml into a Markdown summary, worst classes first.

Usage: pit-summary.py <mutations.xml> [top-N]
Prints Markdown to stdout. CI appends it to $GITHUB_STEP_SUMMARY so it shows on the run's page.

"Missed" = SURVIVED (a test ran the line, none failed) + NO_COVERAGE (no test runs the line).
TIMED_OUT and MEMORY_ERROR count as caught, as PIT itself counts them.
"""
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict

MISSED = {"SURVIVED", "NO_COVERAGE"}
PREFIX = "com.bladebook.core."


def md(text):
    """Escape the characters that would break a Markdown table cell."""
    return text.replace("|", "\\|").replace("<", "&lt;").replace(">", "&gt;")


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: pit-summary.py <mutations.xml> [top-N]")
    path = sys.argv[1]
    top = int(sys.argv[2]) if len(sys.argv) > 2 else 15

    try:
        root = ET.parse(path).getroot()
    except (OSError, ET.ParseError):
        print("## Mutation testing\n\nNo PIT report was produced (the run failed before PIT finished).")
        return

    total = defaultdict(int)
    missed = defaultdict(list)
    for m in root.iter("mutation"):
        cls = m.findtext("mutatedClass", "").split("$")[0].removeprefix(PREFIX)
        total[cls] += 1
        status = m.get("status")
        if status in MISSED:
            method = m.findtext("mutatedMethod", "")
            if method.startswith("lambda$"):
                method = "lambda in " + method.split("$")[1]
            desc = m.findtext("description", "")
            desc = desc.split(" for com/")[0]   # drop PIT's repeated class path
            missed[cls].append((int(m.findtext("lineNumber", "0")), method, status, desc))

    n_total = sum(total.values())
    n_missed = sum(len(v) for v in missed.values())
    if n_total == 0:
        print("## Mutation testing\n\nNo mutations in this run.")
        return
    score = 100 * (n_total - n_missed) / n_total

    out = ["## Mutation testing", ""]
    out.append(f"**Score: {score:.0f}%**: {n_total - n_missed:,} of {n_total:,} planted bugs caught; "
               f"**{n_missed:,} missed**.")
    out.append("")
    if not missed:
        out.append("Every mutation was caught.")
        print("\n".join(out))
        return

    ranked = sorted(missed, key=lambda c: (-len(missed[c]), c))
    out += [f"### Top offenders ({min(top, len(ranked))} of {len(ranked)} classes with misses)", "",
            "| # | Class | Missed | Survived | No test runs it | Class score |",
            "|---:|---|---:|---:|---:|---:|"]
    for i, cls in enumerate(ranked[:top], 1):
        rows = missed[cls]
        surv = sum(1 for r in rows if r[2] == "SURVIVED")
        cov = len(rows) - surv
        cscore = 100 * (total[cls] - len(rows)) / total[cls]
        out.append(f"| {i} | `{cls}` | **{len(rows)}** of {total[cls]} | {surv} | {cov} | {cscore:.0f}% |")
    out.append("")
    out.append("*Survived*: a test ran the line but didn't fail when it was broken. "
               "*No test runs it*: nothing exercises that line at all.")
    out.append("")

    out += ["### What was missed, by class", ""]
    for cls in ranked[:top]:
        out.append(f"<details><summary><code>{cls}</code>: {len(missed[cls])} missed</summary>")
        out.append("")
        out.append("| Line | Method | Outcome | What PIT changed |")
        out.append("|---:|---|---|---|")
        for line, method, status, desc in sorted(missed[cls]):
            label = "survived" if status == "SURVIVED" else "no test runs it"
            out.append(f"| {line} | `{md(method)}` | {label} | {md(desc)} |")
        out.append("")
        out.append("</details>")
        out.append("")
    if len(ranked) > top:
        out.append(f"{len(ranked) - top} more classes have misses; the full list is in the "
                   "downloadable report below.")

    print("\n".join(out))


if __name__ == "__main__":
    main()
