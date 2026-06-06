---
name: project-conventions
description: Working in this repo. Loads on any non-trivial task — captures workflow rules (branches, commits, subagent dispatch), the technology stack, and common debugging recipes so a fresh session doesn't relearn them.
---

# Project Conventions

> Read this first. It encodes the rules every session should follow regardless of which feature you're working on.

## Coding workflow

- **Never commit or push directly to `master`.** Always work on a feature branch. If somehow checked out on `master`, branch off before staging anything.
- **Push only at the end** of a logical unit of work, not after every micro-commit. Avoids redeploy churn on stages with auto-deploy.
- **Don't open PRs from Claude.** The human opens PRs manually after reviewing the branch. Do not run `gh pr create`, `mcp__github__create_pull_request`, or equivalents unless the user has just typed "open the PR".
- **Always run `npm run typecheck` and `npm run lint` from the repo root before every commit AND before the final push to the remote branch.** Both must exit 0. If they don't, fix it before staging — never use `--no-verify` to bypass hooks. The remote CI runs the same checks; a push that breaks them blocks the deploy.
- **Discard build cache files before staging.** `git checkout -- packages/*/tsconfig.tsbuildinfo` (or equivalent for your toolchain). These are local-only artifacts that pollute diffs.
- **Best practices over cleverness.** Match the patterns already in the codebase. Don't invent abstractions for hypothetical reuse. Don't add comments that just restate the code — only document non-obvious WHY.

## Commit messages

- One concise subject line; expand in the body only if the WHY isn't obvious from the diff.
- Reference the file/feature, not the task ID. The PR description is for task context.
- The harness expects the session URL as the final line — keep that footer.

## Subagent dispatch

Use subagents for any work that fits — they keep the main context window clean and they're cheaper for routine work.

- **Sonnet** — moderate scope: a new component, a refactor that touches 3-5 files, a focused bug investigation. Default choice.
- **Haiku** — trivial scope: porting one more component to match an existing pattern, a tiny test fix, a single-line config tweak.
- **Opus** (this model) — orchestration, complex multi-step planning, the actual decision-making. Don't delegate judgement; delegate execution.

When dispatching, write the prompt as if briefing a smart colleague who just walked in cold:
- State the goal in one sentence.
- List which files to touch and which not to touch.
- Point at the existing pattern to mirror.
- Require: typecheck + lint pass, build cache discarded, single push at end, no PR.
- Cap the report length (e.g. "Report under 250 words").

Parallel agents when work is independent. Use `run_in_background: true` to keep the conversation responsive.

## Project board & cycle-time stamping

The GitHub Project (number 5, owner `jasonp2323`) is the source of truth for status. Keep it current as work lands, and stamp cycle time whenever you change an item's Status:

- **Leaving `Backlog`** (work starts): `npm run -s stamp --prefix packages/scripts -- <issue> start` — sets `Actual Start` (date) + `Started At` (ISO), only if not already stamped.
- **Reaching `Done`**: `npm run -s stamp --prefix packages/scripts -- <issue> done` — sets `Actual Finish` + `Completed At` and computes `Cycle Time` / `Cycle Minutes` from the start stamp.

Manual Status changes made in the GitHub UI won't be stamped — stamp from the session when you move an item.

### Task sizing & size-aware execution

Every issue gets a `Size` (XS/S/M/L/XL) — set it at creation, never leave it blank. Set it via the single-select `Size` field (`PVTSSF_lAHOAu5WHs4BZ5E3zhU0lLA`; options XS=`6c6483d2` S=`f784b110` M=`7515a9f1` L=`817d0097` XL=`db339eb2`) the same way you set Status. Scale execution to Size:

- **XS/S** — direct or one subagent, one commit.
- **M** — a couple of subagent tasks, checkpoint commits.
- **L/XL** — decompose into phases first; one subagent per phase; commit + push after each phase; `/compact` or status-note the epic at phase boundaries so work survives compaction/ephemeral sessions.

Full rubric + option IDs live in CLAUDE.md.

## Technology stack

| Component | Version / detail |
|---|---|
| Monorepo | npm workspaces (`packages/*`) |
| Node | 22 (`@tsconfig/node22`) |
| TypeScript | ^5 |
| Next.js | 16.2.6 (`latest` in both `packages/application` and `packages/marketing`) |
| SST | 4.14.1 |
| Cloudflare provider (Pulumi) | 6.15.0 |
| Deployment | AWS via SST, with Cloudflare DNS for some domains |
| CI/CD | GitHub Actions (`.github/workflows/deploy.yml` + `teardown.yml`); SST is the deploy tool |

> Architecture, package layout, and dev commands live in `CLAUDE.md` — don't duplicate them here.

## Debugging recipes

<!-- FILL IN over time. Whenever a session finds a useful diagnostic command, add it here.
     Suggested categories:
       - AWS / SST: how to find the current stage's resources, tail Lambda logs, check throttles
       - Database: common DDB / SQL queries used during debugging
       - Frontend: where to look in DevTools when something silently breaks
       - Deploys: how to confirm the latest commit actually shipped (Lambda LastModified vs commit time)
     Keep each recipe as a runnable snippet, not prose. -->

## Things this repo has tripped over before

<!-- FILL IN as bugs get diagnosed. The format should be:
       - **Symptom**: what the user sees
       - **Cause**: the actual underlying issue
       - **Fix**: the change that resolved it
     The point of this section is to recognise repeats. Don't paste full investigations;
     summarise in 2-3 lines per item. -->

## Things to keep out of this file

- Implementation details about specific features. Those go in CLAUDE.md or a feature-specific skill.
- Anything that changes per session (current branch, current PR number, the active phase of work). Those rot — keep this file evergreen.
- Secrets, credentials, or anything you'd be uncomfortable seeing on GitHub.
