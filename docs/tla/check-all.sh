#!/usr/bin/env bash
# Runs every model in models.txt and prints one line each: what TLC found.
# A "current" model is expected to break an invariant (the bug); a "fixed" one to find no error.
set -uo pipefail
cd "$(dirname "$0")"
while read -r spec cfg expect; do
  [ -z "$spec" ] || [ "${spec:0:1}" = "#" ] && continue
  out=$(./tlc.sh "$spec" "$cfg" 2>&1)
  found=$(grep -oE 'Invariant [A-Za-z]+ is violated|Temporal properties were violated|No error has been found|rror: [A-Z].*' <<<"$out" | head -1)
  states=$(grep -oE '[0-9]+ distinct states found' <<<"$out" | head -1)
  ok=FAIL; { [ "$expect" = ok ] && [[ "$found" == No* ]]; } || { [ "$expect" != ok ] && [[ "$found" == *"$expect"* ]]; } && ok=pass
  printf '%-4s %-16s %-20s %s (%s)\n' "$ok" "$spec" "$cfg" "$found" "$states"
done < models.txt
