#!/usr/bin/env bash
# Security scanning: the repository settings (ADR-032, amended 2026-11-25; Batch 30a).
#
#   bash docs/runbooks/security-scanning.sh check   # show each setting; exit 1 if any is off
#   bash docs/runbooks/security-scanning.sh apply   # turn each one on, then check
#
# Needs `gh` signed in as the repository's owner, and `jq`. Safe to run again: every step sets a
# value rather than toggling it. See docs/runbooks/security-scanning.md.
set -euo pipefail

REPO="${BLADEBOOK_REPO:-jessicamvega6/bladebook}"
R="repos/$REPO"
RULESET_NAME="protect-main"
CODEQL_LANGUAGES='["actions","java-kotlin","javascript-typescript"]'

ruleset_id() {
  gh api "$R/rulesets" --jq ".[] | select(.name == \"$RULESET_NAME\") | .id"
}

apply() {
  echo "Dependabot alerts"
  gh api -X PUT "$R/vulnerability-alerts" --silent

  echo "Dependabot security updates"
  gh api -X PUT "$R/automated-security-fixes" --silent

  echo "Secret scanning and push protection"
  gh api -X PATCH "$R" --silent --input - <<'EOF'
{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}
EOF

  echo "CodeQL default setup"
  gh api -X PATCH "$R/code-scanning/default-setup" --silent --input - <<EOF
{"state":"configured","query_suite":"default","languages":$CODEQL_LANGUAGES}
EOF

  echo "main's ruleset: block a merge on a high or critical CodeQL finding"
  local id
  id="$(ruleset_id)"
  [ -n "$id" ] || { echo "No ruleset named $RULESET_NAME" >&2; exit 1; }
  # Keep every other rule as it is; replace any code_scanning rule with this one.
  gh api "$R/rulesets/$id" \
    | jq '{name, target, enforcement, conditions, bypass_actors,
           rules: ([.rules[] | select(.type != "code_scanning")] + [{
             type: "code_scanning",
             parameters: {code_scanning_tools: [{
               tool: "CodeQL",
               security_alerts_threshold: "high_or_higher",
               alerts_threshold: "none"}]}}])}' \
    | gh api -X PUT "$R/rulesets/$id" --silent --input -
}

check() {
  local failed=0 got
  ok()   { printf '  %-40s on\n' "$1"; }
  bad()  { printf '  %-40s OFF (%s)\n' "$1" "$2"; failed=1; }

  echo "$REPO"

  if gh api "$R/vulnerability-alerts" --silent 2>/dev/null; then ok "Dependabot alerts"
  else bad "Dependabot alerts" "404"; fi

  got="$(gh api "$R/automated-security-fixes" --jq '.enabled' 2>/dev/null || echo false)"
  [ "$got" = "true" ] && ok "Dependabot security updates" || bad "Dependabot security updates" "$got"

  got="$(gh api "$R" --jq '.security_and_analysis.secret_scanning.status')"
  [ "$got" = "enabled" ] && ok "Secret scanning" || bad "Secret scanning" "$got"

  got="$(gh api "$R" --jq '.security_and_analysis.secret_scanning_push_protection.status')"
  [ "$got" = "enabled" ] && ok "Push protection" || bad "Push protection" "$got"

  got="$(gh api "$R/code-scanning/default-setup" --jq '.state + " " + (.languages | sort | join(","))')"
  case "$got" in
    configured*) ok "CodeQL default setup (${got#configured })" ;;
    *) bad "CodeQL default setup" "$got" ;;
  esac

  got="$(gh api "$R/rulesets/$(ruleset_id)" --jq '
    [.rules[] | select(.type == "code_scanning") | .parameters.code_scanning_tools[]
     | select(.tool == "CodeQL") | .security_alerts_threshold] | first // "missing"')"
  [ "$got" = "high_or_higher" ] && ok "Ruleset blocks high/critical CodeQL" || bad "Ruleset blocks high/critical CodeQL" "$got"

  return "$failed"
}

case "${1:-check}" in
  apply) apply; echo; check ;;
  check) check ;;
  *) echo "usage: $0 [check|apply]" >&2; exit 2 ;;
esac
