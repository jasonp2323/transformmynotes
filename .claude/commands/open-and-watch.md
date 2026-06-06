---
description: Open a PR for the current branch, then watch its pr-<N> deployment via PR-activity events and autofix CI/deploy failures until green.
argument-hint: "[issue-number]  (optional — the issue this PR closes; inferred from branch/commits if omitted)"
allowed-tools: Read, Edit, Write, Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git push:*), Bash(git fetch:*), Bash(git pull:*), Bash(npm run:*), Bash(gh pr view:*), Bash(gh pr checks:*), Bash(gh pr edit:*), Bash(gh run list:*), Bash(gh run view:*), mcp__github__create_pull_request, mcp__github__update_pull_request, mcp__github__pull_request_read, mcp__github__subscribe_pr_activity, mcp__github__unsubscribe_pr_activity, mcp__github__add_issue_comment
---

You are opening a PR and then babysitting its deployment until it's green. Invoking this command
IS the user's explicit "open the PR" authorization (the repo's default is human-opened PRs).

## 1. Pre-flight
- **Abort** if the current branch is `master`/`main`.
- Ensure work is committed and the branch is pushed. Run `npm run typecheck` and `npm run lint`
  from the repo root — both must exit 0 before opening the PR. Fix failures first; never `--no-verify`.
- Discard build-cache noise: `git checkout -- packages/*/tsconfig.tsbuildinfo`.
- Resolve the **issue** this closes: `$1` if given, else infer from the branch name / commit messages.
  If none applies, that's fine — just omit the `Closes #N` line.

## 2. Open the PR
- Review the **full** branch diff vs `master` (`git diff master...HEAD`, all commits — not just the last one).
- Open it with `mcp__github__create_pull_request` targeting `master`. If a PR already tracks this
  branch, **update that one** instead of opening a duplicate.
- **Title** must be a valid Conventional Commit (`feat:`, `fix:`, `chore:`, …) — squash-merge uses it
  as the commit subject. **Body**: a short Summary + a Test plan checklist + `Closes #<issue>` if there is one.

## 3. Subscribe, then stop
- The push/open triggers the **Deploy** workflow, which deploys the ephemeral `pr-<number>` stage
  (lint → typecheck → unit → integration → SST deploy).
- Call `mcp__github__subscribe_pr_activity` for the new PR, then **END YOUR TURN.**
- **Do NOT poll with `sleep`, `gh run watch`, or repeated status checks.** CI / deploy / review events
  arrive as `<github-webhook-activity>` messages that wake this session — that is the monitor.

## 4. When an activity event arrives — drive it to green
This is a babysit loop; getting CI+deploy green is the task, so don't skip CI events on this PR.
- **Investigate** the event: open the failing job's logs (`gh run view --log-failed`, the
  statusCheckRollup, the deploy step output) and diagnose the real cause.
- **Fix → re-kick** when you're confident and it isn't a large refactor: edit the code, re-run
  `npm run typecheck` + `npm run lint` (and the relevant tests), commit, and push. Each push
  re-triggers the `pr-<N>` deploy. Refresh a short status checklist on the PR each round so the
  thread shows live state — but don't narrate every round; the diff is the record.
- **Don't push mid-deploy.** Before pushing, confirm no Deploy run is in flight for this branch
  (`gh run list --workflow Deploy --branch <branch> --status in_progress` and `--status queued`) —
  pushing mid-apply trips `cancel-in-progress` and can desync SST/Pulumi state. Wait for it to finish.
- **Ask first** (via `AskUserQuestion`) when the fix is ambiguous, architecturally significant, or
  would need a large refactor — don't guess on those.
- **Terminal states:** on **green**, reply with the passing status (that's the deliverable) and stop.
  If a failure is genuinely real + out of scope, or several re-kicks make no progress, reply with the
  diagnosis and where you're stuck instead of going quiet. Stop and `unsubscribe_pr_activity` the
  moment the user tells you to.

## Footer
After opening (or updating) the PR, end that turn's summary with these three labelled links, in order:
- PR #<n> — `https://github.com/jasonp2323/transformmynotes/pull/<n>`
- Issue #<n> — `https://github.com/jasonp2323/transformmynotes/issues/<n>` (omit if no issue)
- branch — `https://github.com/jasonp2323/transformmynotes/tree/<branch>`
