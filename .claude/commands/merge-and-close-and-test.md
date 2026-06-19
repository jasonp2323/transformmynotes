---
description: Like /merge-and-close, but injects an [E2E] tag into the squash commit so the default-branch deploy also runs the opt-in authed application E2E suite. Merges the PR, deletes the branch, marks the task Done + stamps cycle time, watches the resulting production deploy (incl. the authed E2E run) and fixes failures if necessary, then stops.
argument-hint: "[pr-or-issue-number]  (optional — defaults to the open PR for the current branch)"
allowed-tools: Bash(git branch:*), Bash(git checkout:*), Bash(git switch:*), Bash(git pull:*), Bash(git fetch:*), Bash(gh api:*), Bash(gh pr view:*), Bash(gh pr checks:*), Bash(gh project item-list:*), Bash(gh project item-edit:*), Bash(gh issue view:*), Bash(gh issue close:*), Bash(npm run:*), mcp__github__pull_request_read, mcp__github__merge_pull_request, mcp__github__issue_read, mcp__github__issue_write, mcp__github__actions_list, mcp__github__get_job_logs
---

You are wrapping up a finished piece of work **and** opting this merge into the authed
application E2E run: merge the PR (tagging the squash commit with `[E2E]`), delete the
branch, mark the task Done, and stop. This command is the user's explicit authorization to
merge and delete — so run the whole flow, but **stop immediately** (with a one-line reason)
if any **Abort** condition below trips. Do not start new work after finishing.

This is identical to `/merge-and-close` except for **step 2**, where the squash commit message
is given an `[E2E]` tag. The deploy workflow (`.github/workflows/deploy.yml`) runs the
opt-in authed application E2E suite (`npm run test:e2e:application`) only on `master` pushes
whose head commit message contains the literal `[E2E]`, so tagging the squash commit is what
triggers it.

> ⚠️ **Precondition — don't block production by accident.** The `[E2E]` job runs offline
> (dynalite + a local `cognito-local` user pool) **before** AWS credentials are configured, so if
> it fails it **gates (blocks) the production deploy**. It needs the test-user secrets in the repo
> (`COGNITO_TEST_USERNAME`, `COGNITO_TEST_PASSWORD`, plus `COGNITO_TEST_USER_POOL_ID` /
> `COGNITO_TEST_CLIENT_ID` only if it targets a real dev/test pool). If those are **not**
> configured, the job will fail loudly and block the deploy — in that case use plain
> `/merge-and-close` instead, or set the secrets first.

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

## 2. Merge into master — with the `[E2E]` tag
- Squash-merge into `master` with `mcp__github__merge_pull_request` (`merge_method: "squash"`),
  setting **both**:
  - `commit_title` — the PR title (the Conventional-Commit subject). **Leave it clean — do NOT
    put `[E2E]` here**, so release-please's generated changelog entry stays tidy.
  - `commit_message` — the squash **body**, which **must contain the literal `[E2E]`** on its own
    line. The CI gate matches against the full commit message (subject + body), so a body tag is
    enough to trigger the authed E2E run while keeping the subject clean. Example body:
    ```
    Closes #<issue>

    [E2E]
    ```
- After the call, **verify the tag actually landed**: read the merge commit on `master`
  (`gh api repos/jasonp2323/transformmynotes/commits/master --jq .commit.message`) and confirm the message
  contains `[E2E]`. If it does not (e.g. the body was dropped), **stop and say so** — without the
  tag the authed E2E won't run.
- Confirm the merge reports merged before continuing.

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

## 5. Watch the production deploy — you opted into `[E2E]`, so see it through
The squash-merge pushed to `master` with the `[E2E]` tag, so the **Deploy** workflow
(`.github/workflows/deploy.yml`) runs the **authed application E2E suite**
(`npm run test:e2e:application`) **before** AWS credentials are configured — meaning a single failing
spec **gates (blocks) the `production` deploy**. You asked for this run, so watch it to a terminal state
and drive it green before you stop.

- **Find the run.** It's the `Deploy` run for the **merge commit** on `master`. Resolve the merge SHA
  (`gh api repos/jasonp2323/transformmynotes/commits/master --jq .sha`), then list recent master push
  runs with `mcp__github__actions_list` (`method: list_workflow_runs`, `resource_id: deploy.yml`,
  filter `branch: master`, `event: push`) and pick the run whose `head_sha` matches.
- **Wait for it.** The authed E2E run + deploy takes several minutes. Re-check the run's status
  periodically (every minute or two) — do **not** spin in a tight `sleep` loop. (`gh run watch` may not
  resolve the repo's remote in this environment; the MCP `actions_list` / `get_job_logs` tools and
  `gh api` with an explicit repo path always work.)
- **If the "Application E2E tests (authed, offline)" step fails:** open the failing job's logs
  (`mcp__github__get_job_logs`, `failed_only: true`, `return_content: true`) and identify which specs
  failed. Then:
  - If the failure is in the **spec(s) for the change you just merged**, fix them on a **new** branch + PR
    (never push to `master` directly) so the next deploy is green, and tell the user.
  - If the failures are **unrelated pre-existing breakage** in other specs (the authed suite is opt-in
    precisely because it is heavy/flaky), say so explicitly — the production deploy is blocked by tests
    that aren't yours. Recommend either fixing those specs or re-deploying via a clean (no-`[E2E]`) master
    push, and let the user decide; don't force-push master.
  - **Flaky / infra** failure → re-run the run and re-watch.
  - If the fix is ambiguous or large, **stop and report the diagnosis** instead of guessing.
- **If it's green:** note that the authed E2E passed and `production` deployed successfully.

## 6. Finish — then stop
Print a short summary and stop (end the turn; don't pick up new work):
- PR merged with `[E2E]` tag — link `https://github.com/jasonp2323/transformmynotes/pull/<pr#>`
- Branch `<branch>` deleted (local + remote)
- Issue #<n> closed · Project Status = Done · cycle time stamped
- Production deploy (incl. authed E2E): green ✅ (or: the failure diagnosis + what you did / what's blocked)

In headless `claude -p` mode the process exits here. In an interactive session the conversation
just goes idle — close it with `/exit` (or the tab) when you're ready.
