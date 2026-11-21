#!/usr/bin/env bash
# Runs TLC on one model: ./tlc.sh <Spec> <cfg-suffix>, e.g. ./tlc.sh EmailGuard fixed.
# Needs Java 17 and tla2tools.jar (https://github.com/tlaplus/tlaplus/releases, v1.7.4) at $TLA2TOOLS
# or next to this script. The jar isn't kept in the repository.
set -euo pipefail
cd "$(dirname "$0")"
jar="${TLA2TOOLS:-tla2tools.jar}"
[ -f "$jar" ] || { echo "tla2tools.jar not found: set TLA2TOOLS" >&2; exit 2; }
java -XX:+UseParallelGC -cp "$jar" tlc2.TLC -workers auto -deadlock -metadir "${TMPDIR:-/tmp}/tlc-states" \
  -config "$1_$2.cfg" "$1.tla"
