---
description: Merge the current branch's PR into the default branch, delete the branch, mark the task Done on the Project board + stamp cycle time, then stop.
argument-hint: "[pr-or-issue-number]  (optional — defaults to the open PR for the current branch)"
allowed-tools: Bash(git branch:*), Bash(git checkout:*), Bash(git switch:*), Bash(git pull:*), Bash(git fetch:*), Bash(gh api:*), Bash(gh pr view:*), Bash(gh pr checks:*), Bash(gh project item-list:*), Bash(gh project item-edit:*), Bash(gh issue view:*), Bash(gh issue close:*), Bash(npm run:*), mcp__github__pull_request_read, mcp__github__merge_pull_request, mcp__github__issue_read, mcp__github__issue_write
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

## 5. Finish — then stop
Print a short summary and stop (end the turn; don't pick up new work):
- PR merged — link `https://github.com/jasonp2323/transformmynotes/pull/<pr#>`
- Branch `<branch>` deleted (local + remote)
- Issue #<n> closed · Project Status = Done · cycle time stamped

In headless `claude -p` mode the process exits here. In an interactive session the conversation
just goes idle — close it with `/exit` (or the tab) when you're ready.
