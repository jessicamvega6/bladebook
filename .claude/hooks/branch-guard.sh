#!/usr/bin/env bash
# Branch guard for Claude Code sessions (owner, 2026-11-25).
#
# Stops Claude committing or pushing on a branch it didn't choose. On 2026-11-25 the working tree was switched to
# another branch mid-session (another session, or the owner), and Claude committed there without noticing.
#
#   record  (SessionStart)  remember this session's branch
#   pre     (PreToolUse)    block git commit/push/merge/rebase/cherry-pick/reset/revert if the branch has changed
#                           since it was recorded; note the branch before every command
#   post    (PostToolUse)   if Claude's own command changed the branch (git switch -c, …), record the new one.
#                           A change made between Claude's commands is never recorded, so it stays blocked.
#
# After the owner confirms the new branch is right, Claude runs:   true # branch-guard: accept
# which records the current branch.
set -u
mode=${1:-}
input=$(cat)
session=$(jq -r '.session_id // empty' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
command=$(jq -r '.tool_input.command // empty' <<<"$input")
[ -n "$session" ] || exit 0
[ -n "$cwd" ] && cd "$cwd" 2>/dev/null
top=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0

dir="${TMPDIR:-/tmp}/claude-branch-guard"
mkdir -p "$dir"
key="$dir/${session}-$(printf %s "$top" | shasum | cut -c1-12)"
recorded=$(cat "$key.rec" 2>/dev/null || true)

case "$mode" in
  record)
    printf %s "$branch" >"$key.rec"
    ;;
  pre)
    if [ -z "$recorded" ]; then
      # First command since the guard was installed: start from here.
      printf %s "$branch" >"$key.rec"
      recorded=$branch
    fi
    if grep -qE '#[[:space:]]*branch-guard:[[:space:]]*accept' <<<"$command"; then
      printf %s "$branch" >"$key.rec"
      printf %s "$branch" >"$key.pre"
      exit 0
    fi
    printf %s "$branch" >"$key.pre"
    if [ "$branch" != "$recorded" ] &&
       grep -qE '(^|[;&|(]|[[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+(commit|push|merge|rebase|cherry-pick|reset|revert)([[:space:]]|$)' <<<"$command"; then
      reason="BRANCH GUARD: this session was on '$recorded' but the working tree at $top is now on '$branch', changed by something other than this session. Do not commit, push or rewrite history here. Stop and ask the owner which branch this work belongs on. Once they confirm, run exactly: true # branch-guard: accept"
      jq -n --arg r "$reason" --arg m "Branch guard blocked a git command: the branch changed from '$recorded' to '$branch' mid-session." '{
        systemMessage: $m,
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r }
      }'
    fi
    ;;
  post)
    pre=$(cat "$key.pre" 2>/dev/null || true)
    # Only a change made by this very command is Claude's own choice.
    if [ -n "$pre" ] && [ "$pre" = "$recorded" ] && [ "$branch" != "$recorded" ]; then
      printf %s "$branch" >"$key.rec"
    fi
    ;;
esac
exit 0
