#!/bin/bash
# SessionStart hook.
# 1. In remote (web) containers, install deps so tests/linters work on a fresh clone.
# 2. Always print milestone orientation so a new conversation knows where things stand
#    (its stdout is injected into the session context).
set -uo pipefail

REPO="{{REPO}}"

# --- 1. Dependencies (remote web only; local devs manage their own tree) ---
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && [ -f package.json ]; then
  npm install --no-audit --no-fund >/tmp/session-npm-install.log 2>&1 \
    || echo "WARNING: npm install failed — see /tmp/session-npm-install.log"
fi

# --- 2. Orientation (best-effort; never fail the hook on these) ---
echo "## Session orientation — $(date -u '+%Y-%m-%d %H:%M UTC')"
echo
echo "### Recent commits"
git log --oneline -8 2>/dev/null || true
echo
echo "### Open PRs"
gh pr list --repo "$REPO" --state open \
  --json number,title,headRefName \
  --jq '.[] | "#\(.number) \(.title)  [\(.headRefName)]"' 2>/dev/null || echo "(gh unavailable)"
echo
echo "### Open milestones"
gh api "repos/$REPO/milestones?state=open" \
  --jq 'sort_by(.title) | .[] | "\(.title) — \(.open_issues) open / \(.closed_issues) closed"' 2>/dev/null || true
echo
echo "### Recently updated open issues"
gh issue list --repo "$REPO" --state open --limit 12 \
  --json number,title,milestone \
  --jq '.[] | "#\(.number) \(.title)\(if .milestone then "  ("+.milestone.title+")" else "" end)"' 2>/dev/null || true
echo
echo "### Where to look"
echo "- Live status: the current milestone's epic issue (Status section) + the GitHub Project board."
echo "- Plans/specs: docs/milestones/*.md"
echo "- Continuity model + active gotchas: the milestone's epic issue (Status section)"
