---
description: Merge the current branch's PR into the default branch, delete the branch, mark the task Done on the Project board + stamp cycle time, watch the resulting production deploy and fix failures if necessary, then stop.
argument-hint: "[pr-or-issue-number]  (optional — defaults to the open PR for the current branch)"
allowed-tools: Bash(git branch:*), Bash(git checkout:*), Bash(git switch:*), Bash(git pull:*), Bash(git fetch:*), Bash(gh api:*), Bash(gh pr view:*), Bash(gh pr checks:*), Bash(gh project item-list:*), Bash(gh project item-edit:*), Bash(gh issue view:*), Bash(gh issue close:*), Bash(npm run:*), mcp__github__pull_request_read, mcp__github__merge_pull_request, mcp__github__issue_read, mcp__github__issue_write, mcp__github__actions_list, mcp__github__get_job_logs
---

You are wrapping up a finished piece of work: merge the PR, delete the branch, mark the
task Done, and stop. This command is the user's explicit authorization to merge and delete —
so run the whole flow, but **stop immediately** (with a one-line reason) if any **Abort**
condition below trips. Do not start new work after finishing.

## 0. Resolve the target
- `$1` may be a PR number **or** an issue number; if empty, use the open PR for the **current branch**.
- Establish three things:
  - **Branch** — `git branch --show-current`.
  - **PR** — the open PR for that branch (or the PR number in `$1`).
  - **Issue** — the issue this resolves: parse `Closes #N` / `Resolves #N` / `Fixes #N` from the
    PR body; else use the issue number in `$1`; if still unknown, **ask the user which issue** — never guess.
- **Abort** if the current branch is `master` (or `main`), or if no open PR exists for the branch.

## 1. Verify it's safe to merge
- Read the PR (`mcp__github__pull_request_read` or `gh pr view`): confirm it is **mergeable**
  (no conflicts), **not a draft**, and its **required checks are green** (statusCheckRollup / `gh pr checks`).
- **Abort** with a one-line reason if checks are red, the PR is conflicted, or it's still a draft.
  Don't merge a red, conflicted, or draft PR.
- The repo **squash-merges**, so the **PR title becomes the commit subject** and must be a valid
  Conventional Commit (`feat:`, `fix:`, `chore:`, …). If the title isn't, fix it first
  (`gh pr edit --title` / `mcp__github__update_pull_request`) before merging.

## 2. Merge into master
- Squash-merge into `master` with `mcp__github__merge_pull_request` (`merge_method: "squash"`).
- **Heads-up — stray `[E2E]`:** this command does **not** intend to tag the commit, but the deploy
  gate (`deploy.yml`) matches the **entire** squash commit message — subject **and body**, which GitHub
  builds by concatenating the PR's individual commit messages. If any of those messages contains the
  literal `[E2E]`, the opt-in authed application E2E suite runs on the `master` deploy and can **block
  production**. To avoid an accidental trigger, pass an explicit clean `commit_message` body (e.g. just
  `Closes #<issue>`) so no stray `[E2E]` leaks in from a commit body.
- Confirm it reports merged before continuing.

## 3. Delete the branch
- `git checkout master && git pull origin master` first — you can't delete the branch you're on.
- Delete the **remote** branch via the **GitHub API**, not `git push --delete`:
  `gh api --method DELETE repos/jasonp2323/transformmynotes/git/refs/heads/<branch>`
  (the ref path keeps any slashes in the branch name, e.g. `heads/claude/my-branch`).
  If the squash-merge already deleted the branch, this returns 404/422 — treat that as
  "already gone", not a failure.
- Then delete the local branch (`git branch -d <branch>`).

## 4. Update task status (the full CLAUDE.md flow)
For the resolved issue number:
- **Project Status → Done.** Project #5, owner `jasonp2323`:
  ```bash
  PID=PVT_kwHOAu5WHs4BZ5E3                        # Transform My Notes
  FIELD=PVTSSF_lAHOAu5WHs4BZ5E3zhU0khY                 # Status field
  DONE=98236657                      # "Done" option
  gh project item-list 5 --owner jasonp2323 --format json   # find the item id for this issue
  gh project item-edit --project-id "$PID" --field-id "$FIELD" --id <ITEM_ID> --single-select-option-id "$DONE"
  ```
- **Close the issue** (`gh issue close <n>` or `mcp__github__issue_write` state: closed).
- **Stamp cycle time:** `npm run -s stamp --prefix packages/scripts -- <issue> done`.
- If the issue is a **phase of an epic**, tick its checkbox in the epic issue body.

## 5. Watch the production deploy — don't walk away from a broken master
The squash-merge pushed to `master`, which triggers the **Deploy** workflow
(`.github/workflows/deploy.yml`) → it deploys the `production` stage. A merge that red-deploys
production is **not** "done", so watch this run to a terminal state before you stop.

- **Find the run.** It's the `Deploy` run for the **merge commit** on `master`. Resolve the merge SHA
  (`gh api repos/jasonp2323/transformmynotes/commits/master --jq .sha`), then list recent master push
  runs with `mcp__github__actions_list` (`method: list_workflow_runs`, `resource_id: deploy.yml`,
  filter `branch: master`, `event: push`) and pick the run whose `head_sha` matches.
- **Wait for it.** Deploys take several minutes. Re-check the run's status periodically (every minute or
  two) — do **not** spin in a tight `sleep` loop. (`gh run watch` may not resolve the repo's remote in
  this environment; the MCP `actions_list` / `get_job_logs` tools and `gh api` with an explicit repo path
  always work.)
- **If it fails:** open the failing job's logs (`mcp__github__get_job_logs`, `failed_only: true`,
  `return_content: true`) and diagnose. Then:
  - **Flaky / infra** failure → re-run the run and re-watch.
  - **Stray `[E2E]` trigger** → the authed application E2E suite ran on `master` because the squash
    commit message (subject **or** body) contained the literal `[E2E]`, and that suite gates the deploy.
    Confirm via the commit message. If the `[E2E]` was unintentional and the failing specs are unrelated
    pre-existing breakage, the deploy needs a clean (no-`[E2E]`) master push to proceed (e.g. the next
    real commit, or the release-please release PR) — **flag this to the user**, don't force-push master.
  - **Real regression from this change** → fix it on a **new** branch + PR (never push to `master`
    directly), and tell the user.
  - If the fix is ambiguous or large, **stop and report the diagnosis** instead of guessing.
- **If it's green:** note that `production` deployed successfully.

## 6. Finish — then stop
Print a short summary and stop (end the turn; don't pick up new work):
- PR merged — link `https://github.com/jasonp2323/transformmynotes/pull/<pr#>`
- Branch `<branch>` deleted (local + remote)
- Issue #<n> closed · Project Status = Done · cycle time stamped
- Production deploy: green ✅ (or: the failure diagnosis + what you did / what's blocked)

In headless `claude -p` mode the process exits here. In an interactive session the conversation
just goes idle — close it with `/exit` (or the tab) when you're ready.
