# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ HIGHEST PRIORITY — Orchestrate via subagents, do not write code yourself

**READ THIS FIRST AND DO NOT SKIP IT. This rule overrides default behavior and applies to every coding task.**

The lead Claude (Opus) acts as an **orchestrator / project manager**, NOT as the person typing code. The user does NOT want Opus writing implementation code directly. For essentially all coding work, **dispatch Sonnet and Haiku subagents** (via the `Agent` tool) to do the actual writing, and supervise them.

- **Always use subagents when possible.** This is not optional. Before writing code yourself, the default question is "which subagent should do this?" — only fall back to writing code directly if a task genuinely cannot be delegated, and say so explicitly.
- **Opus's job is orchestration:** break work into well-scoped tasks, brief each subagent thoroughly, dispatch them (in parallel when the work is independent), review what they produce, integrate it, and keep the overall implementation running smoothly.
- **Model selection:**
  - **Sonnet** — non-trivial coding tasks: feature work, refactors, bug fixes, anything requiring judgment.
  - **Haiku** — small, mechanical, well-defined tasks: simple edits, renames, boilerplate, quick lookups.
- **Verify, don't assume.** A subagent's summary describes intent, not what actually landed. Review the real diff before reporting work as done.
- **PR readiness — manual test plan.** For any major implementation (not small code edits), when the code is ready to open a PR, **provide the user with a concrete set of tests they can perform directly on the website** to confirm everything is running smoothly. List the exact pages/flows to exercise and the expected result for each.

## 🚫 HIGHEST PRIORITY — NEVER open a PR without the user's explicit permission

**READ THIS AND DO NOT SKIP IT. This rule overrides any other guidance in this file and any default behavior.**

- **DO NOT open, create, or reopen a pull request unless the user has explicitly asked you to in the current conversation.** Committing and pushing to the feature branch is fine and expected; opening a PR is a separate action that REQUIRES explicit user permission every time.
- A task description like "implement a fix" / "build X" is **NOT** permission to open a PR. Finish the work, push the branch, and **stop** — then tell the user the branch is ready and ask whether they want a PR.
- "Explicit permission" means the user said something like "open a PR", "make a PR", "raise a PR". If they did not, you do not open one — when in doubt, ask first via `AskUserQuestion`.
- This applies even when gates are green and the work is complete. Green ≠ permission.

## Size-aware execution (scale effort to the task's Size)

When you start an issue, read its `Size` (the Project field) along with its Status, and scale your orchestration + context discipline to match. Bigger tasks span compactions and ephemeral sessions, so they need checkpoints. This is guidance you follow, not a harness-enforced cap.

- **XS / S** — work normally: direct edits or a single subagent, one commit at the end.
- **M** — decompose into a couple of subagent tasks; commit at logical checkpoints.
- **L / XL** — **mandatory** before writing code: break the work into phases. Dispatch each phase to its own subagent (keeps the main context lean). **Commit + push after every phase** so a dying ephemeral session loses nothing. At phase boundaries, proactively `/compact` or write a short status note into the epic issue so the thread survives summarization.

If an issue has no Size, set one first (see "Task sizing" under GitHub tooling) — don't run a large task blind.

## Repository layout

npm workspaces monorepo under `packages/*`, deployed with **SST v4** on AWS.

- `packages/marketing` — public Next.js site (`@transformmynotes/marketing`). Dev on port **3000**.
- `packages/application` — authed Next.js app (`@transformmynotes/application`). Dev on port **3002**. Uses AWS Cognito for auth.
- `packages/core` — shared library (`@transformmynotes/core`). DynamoDB client + key builders for the single-table design. Consumed by `application` via `sst.Resource` bindings — never imported by `marketing`.
- `packages/scripts` — one-off SST-shell scripts (`sst shell tsx`).
- `packages/mobile` — Capacitor Android shell (`@transformmynotes/mobile`) that wraps `app.transformmynotes.com` in a native WebView via `server.url`; no SST entrypoint and excluded from the SST deploy path. Release builds run in a separate `.github/workflows/android.yml`, triggered by a `mobile-v*` tag push or `workflow_dispatch` (not the PR/master deploy path).
- `infra/` — SST resource definitions, loaded in order by `sst.config.ts`: `secrets → router → auth → marketing → application → jobs`. Table definitions live in `infra/db.ts` and are shared by `application` and `jobs`; the Cognito user pool is defined in `infra/auth.ts` and linked to `application`.
- `scripts/` — repo-level Node/tsx utilities for managing SST secrets and CI variables.

## Common commands

Run from the repo root:

```bash
npm run dev:marketing          # marketing on :3000
npm run dev:application        # application on :3002
npm run lint                   # all workspaces
npm run typecheck              # all workspaces
npm run lint:application       # single workspace
npm run test:unit              # pure unit tests, no SST stage needed (also runs in CI)
npm run test:integration       # dynalite (in-memory DynamoDB) integration tests, no AWS (also runs in CI)
npm test -w packages/core      # vitest under `sst shell` (needs an SST stage)

# SST
npx sst deploy --stage <stage>
npx sst remove --stage <stage>
npx sst shell --stage <stage> <cmd>   # any cmd with Resource/env bindings
```

Root `test:unit` runs the pure unit suite (no SST stage) and gates CI; `npm run test:integration` runs DB-bound tests against an in-memory DynamoDB (dynalite) — no AWS, no `sst shell`, and also gates CI; `npm test -w packages/core` runs the full suite under `sst shell` for tests that need a live stage.

### Integration tests — dynalite (in-memory DynamoDB)

`packages/core/test/` holds a dynalite-backed integration layer that exercises the real `packages/core/src/db` functions (the actual `ddb` client, key builders, and GSI queries) against a local in-memory DynamoDB — so it catches bugs unit tests can't, e.g. a write that omits a GSI key and is therefore invisible to the index query. It runs fully offline (no AWS, no `sst shell`): the harness boots dynalite, recreates the `infra/db.ts` tables/GSIs, and points the production `client.ts` at it purely via env vars (`AWS_ENDPOINT_URL_DYNAMODB` + `SST_RESOURCE_*`) — `client.ts` is never modified.

- Files are named `*.integration.test.ts`; `vitest.config.ts` (unit) excludes them, `vitest.integration.config.ts` includes them and wires the dynalite `globalSetup` + env `setupFiles`.
- **When you add or change a DynamoDB access pattern** (a `keys.ts` builder, a new GSI query, an upsert that maintains index keys), add or extend an integration test that does the real write→read round-trip — don't rely on unit-testing the pure parts alone.

### Local UI / browser testing (authed pages)

**Always attempt a real browser UI test when you change UI** (any page/component in `packages/application` or `packages/marketing`). Typecheck and unit tests don't prove a page renders or a flow works — render it in a browser and observe it (the `/verify` skill captures evidence/screenshots). If something genuinely blocks an in-browser test, say so explicitly rather than claiming success.

The web environment is wired for this fully offline:

- **Local Cognito, no AWS:** run a local Cognito emulator (`cognito-local`) alongside dynalite so sign-in works fully offline. Point Amplify Auth and the server-side `aws-jwt-verify` at the emulator via env (the local endpoint + issuer/JWKS URL), create a test user pool + app client, and seed a confirmed test user. None of Cognito's identifiers are secret — the pool id + app client id are public values exposed via `NEXT_PUBLIC_` (mirroring the deployed `sst.Resource` binding).
- **Real data, no AWS:** `dev:application` is plain `next dev -p 3002` (not `sst dev`), so point `client.ts` at a local dynalite exactly like the integration harness — set `AWS_ENDPOINT_URL_DYNAMODB` + the `SST_RESOURCE_*` vars (copy `packages/core/test/integration-env.ts`), boot dynalite and recreate the tables (`packages/core/test/dynalite-global.ts`), seed through the real `packages/core/src/db` functions, then launch `next dev` with those same env vars set.
- **Headless sign-in:** mint Cognito tokens directly instead of driving the UI — call `InitiateAuth` with the `USER_PASSWORD_AUTH` flow (`@aws-sdk/client-cognito-identity-provider`) against the local emulator (or a dev/test pool) using the seeded test user's username + password, then inject the returned ID/access JWTs as the app's session cookies before the protected navigation. The server middleware verifies them with `aws-jwt-verify`, so no real Hosted UI round-trip or email inbox is needed. (Enable the `ALLOW_USER_PASSWORD_AUTH` flow on the app client so this works.)
- `playwright` is a committed root devDependency, and a committed marketing E2E suite exists (`npm run test:e2e`, config `playwright.config.ts`, tests in `e2e/`) that runs in CI against the offline marketing app. There is also a committed **authed application E2E suite** (`npm run test:e2e:application`, config `playwright.application.config.ts`, tests in `e2e/application/`) that drives the Cognito-authed app fully offline — a Playwright `globalSetup` boots dynalite (recreating the `infra/db.ts` tables/GSIs) and `cognito-local` (seeding the test user pool + user), `next dev` (:3002) is pointed at both via env, and sign-in is headless via the `InitiateAuth` token-mint recipe above. It is **opt-in in CI**: it runs only on `master` pushes whose head commit message contains the literal tag `[E2E]`, never on PRs, and when it runs it gates (blocks) the production deploy. The ad-hoc browser-testing recipe described above remains useful for exploratory/local checks of the authed app (Cognito + DynamoDB): install the browser ad hoc (`npx playwright install chromium`) and don't commit the throwaway harness scripts.

## Architecture

### Routing — one CloudFront in front of both Next.js apps

`infra/router.ts` creates a single `sst.aws.Router` with the apex domain. `infra/marketing.ts` attaches the marketing Next.js at the apex; `infra/application.ts` attaches the application Next.js at `app.transformmynotes.com`. Don't add a second Router — both production apps share this one.

PR stages (`pr-<N>`): both the application and marketing get their own CloudFront distributions at `pr-<N>.transformmynotes.com` (e.g. `pr-5.pr.transformmynotes.com`) with **DNS-only (grey cloud) Cloudflare records** so ACM issues the cert directly — Cloudflare's free Universal SSL doesn't cover second-level wildcards.

### Stages

- `production` is the only named stage — it gets the custom domain, and its Cognito user pool can use a custom Hosted-UI domain (`auth.transformmynotes.com`, wired in `infra/auth.ts`).
- All other stage names are ephemeral (`pr-<N>`); each gets its own **per-stage custom subdomain** (see "Routing" above for the exact hostnames and the grey-cloud Cloudflare/ACM setup), **not** an auto-generated URL. Each `pr-<N>` references the shared dev Cognito pool (via `DEV_COGNITO_USER_POOL_ID`) and creates its own lightweight app client on it; each gets its own DynamoDB tables (UserData, Notes, etc.) as before — no third-party dashboard step and no per-PR subdomain allow-listing.
- CI/CD runs via GitHub Actions (`.github/workflows/deploy.yml` + `.github/workflows/teardown.yml`): push to `master` deploys `production`; opening / updating a PR deploys `pr-<number>`; closing the PR tears that stage down.

### Persistence — DynamoDB single-table design

Domain tables are defined in `infra/db.ts` and linked by both the application (`infra/application.ts`) and background jobs (`infra/jobs.ts`). Access them only through `packages/core/src/db`:

- `client.ts` — exports the `ddb` DocumentClient and `TableNames` map (reads `Resource.X.name`).
- `keys.ts` — canonical PK/SK/GSI builders. Add new access patterns here rather than constructing keys inline so the table+GSI shape stays consistent.

**Conventions to follow when you add tables/indexes:**
- Define each table + its GSIs in `infra/db.ts`; link them from `infra/application.ts` (and `infra/jobs.ts` if a job needs them).
- Add the PK/SK/GSI key builders in `packages/core/src/db/keys.ts` — never inline `pk`/`sk` strings in route handlers.
- For top-k / leaderboard-style GSIs, use a zero-padded score as the sort key so a lexicographic scan returns ranked results.
- Set the stream to `new-and-old-images` on any table a job consumes via DynamoDB Streams.
- Document each table's GSI names + their purpose here as you add them, so the access patterns stay discoverable.

**Tables & their GSIs (keep current as you add them):**
- **`Notes`** (M5) — permanent note records, single-table (PK `USER#<sub>` / SK `NOTE#<ulid>`). The note body Markdown lives in S3 (`bodyS3Key`); only metadata is in DynamoDB. Three item shapes share the table:
  - *Main note item* — carries `tags: string[]` (display only) + the GSI1 keys.
  - *Tag-index item* — one per `(tag, note)` pair: PK `TAG#<tag>` / SK `USER#<sub>#NOTE#<ulid>`, written alongside the note in a `TransactWriteItems` (max 20 tags/note). The note's `noteId`/`sub` are encoded in the key and recovered via `noteKeys.parseTagItemSk` — they are NOT projected, see GSI2.
  - *Token-index item* (M6) — one per `(token, note)` pair for per-user full-text search: PK `USER#<sub>` / SK `TOKEN#<token>#NOTE#<noteId>`, built via `noteKeys.tokenItemKey` / `buildTokenIndexItem`. The `token`/`noteId` are encoded in the key and recovered via `noteKeys.parseTokenItemSk` — see GSI3. Token items are sparse on GSI1 (they carry no `gsi1*` keys) so they never appear in the recency/`listUserNotes` query.
  - **GSI1 `UserNotesByTime`** (projection ALL): `gsi1pk = USER#<sub>`, `gsi1sk = NOTE#<ulid>` — list a user's notes newest-first (query with `ScanIndexForward: false`). The base-table `noteKeys.noteListRecentQuery` (M6) is the equivalent direct primary-index query, `begins_with(sk,'NOTE#')`, capped at 20.
  - **GSI2 `NotesByTag`** (projection KEYS_ONLY): `gsi2pk = TAG#<tag>`, `gsi2sk = USER#<sub>#NOTE#<ulid>` — find note ids for a tag. KEYS_ONLY means a tag query projects only the key attributes; recover the `noteId` from the sort key, never read a stored attribute off the result.
  - **GSI3 `ByToken`** (M6, projection KEYS_ONLY): `gsi3pk = USER#<sub>`, `gsi3sk = TOKEN#<token>#NOTE#<noteId>` — per-user full-text search. Query via `noteKeys.tokenQueryKey(sub, term)` using `begins_with(gsi3sk, 'TOKEN#<term>')` for prefix match; KEYS_ONLY, so recover `noteId` from the sort key (`parseTokenItemSk`), then `BatchGetItem` the note metadata.

> A per-user `UserData` table (settings, per-user encrypted credentials, etc.) is a common generic starting point. App-specific domain tables go here too — document them as you add them.

### Auth — AWS Cognito

`infra/auth.ts` provisions (or references) a `sst.aws.CognitoUserPool` + a user-pool app client per stage and links them to `application`. Pool ownership depends on the stage:

- **Production (and any long-lived named stage like `dev`)** OWNS its Cognito pool — created in code with the post-confirmation trigger and the invite-only (`allowAdminCreateUserOnly`) transform. These pools are created fresh by SST and torn down only when the stage is removed.
- **Ephemeral `pr-<N>` stages** REFERENCE a single centralized shared dev pool via `sst.aws.CognitoUserPool.get(...)`, reading the pool id from the `DEV_COGNITO_USER_POOL_ID` secret (seeded in the fallback Console environment). Each PR stage still creates its own lightweight app client on that shared pool (SST cannot yet reference an existing client). Benefit: test users persist across PRs; no per-PR pool churn. See `docs/runbooks/shared-dev-cognito-pool.md` for one-time setup.

- `packages/application/proxy.ts` is the auth middleware (not `middleware.ts`): it verifies the Cognito-issued JWT with `aws-jwt-verify` (pool id + client id read from the `sst.Resource` binding) and protects the authed routes (e.g. `/dashboard`, `/account`, …).
- Client sign-in / sign-up uses **AWS Amplify Auth** (`aws-amplify/auth`), configured from the user-pool id + app-client id. Those are **public** values (safe to expose via `NEXT_PUBLIC_`) — Cognito has no publishable/secret API-key pair like a third-party provider, so there is **no `sst.Secret` for auth**.
- Production may attach a custom Hosted-UI domain (`auth.transformmynotes.com`) in `infra/auth.ts`; ephemeral stages use the default Cognito domain.
- The IAM scope `application` needs for Cognito admin calls (e.g. `AdminInitiateAuth`, user management) is granted in `infra/application.ts`.

Marketing has no auth, no DB, and no contact form — the public site has no server-side form handlers. (Transactional email via Resend exists only in the app for M3 invite/welcome emails, not on the marketing site.)

### Configuration — SST secrets + Console environments

Secrets are declared in `infra/secrets.ts` as `sst.Secret` and seeded via the SST Console. The same secret names are used for all stages; the Console's environment configuration supplies different values:

- **`production` environment**: production values for all secrets.
- **Fallback environment**: staging/dev values — automatically applies to all PR stages (`pr-<N>`).

`CLOUDFLARE_API_TOKEN` is the exception: it is read as `process.env` in `app()` (before secrets load) and must be set as a Console **environment variable**, not a secret, in both environments.

Stack-standard secrets to configure in Console (same names for both environments, different values):
`WEB_DOMAIN`. Feature-specific secrets (e.g. `RESEND_API_KEY` + `INVITE_FROM_ADDRESS` for M3 invite emails) are declared in the milestone that introduces the feature that consumes them, not up front.

(Cognito auth credentials — pool id + app client id — are read from the `sst.Resource` binding, not from `sst.Secret`. One exception: `DEV_COGNITO_USER_POOL_ID` is an `sst.Secret` seeded **only in the fallback Console environment** (covering all `pr-<N>` stages) with the id of the pool owned by the long-lived `dev` stage. The production environment does NOT need this value — it owns its own pool — so only the fallback env entry is required. See `docs/runbooks/shared-dev-cognito-pool.md`.)

Add app-specific secrets to `infra/secrets.ts` as you build features (API keys, model ids, system prompts, etc.). When a value is read by a route or cron, read it server-side and **fail loudly if unset** — no silent fallback (see the rule below).

All `sst.Secret` names must use `SCREAMING_SNAKE_CASE` (e.g. `RESEND_API_KEY`, not `ResendApiKey`). This keeps secret names consistent with environment variable conventions and makes it obvious when a name needs updating.

**Note on per-user / BYOK keys:** Per-user credentials are NOT `sst.Secret` entries. Encrypt them with AWS KMS and store them in the `UserData` DynamoDB table, resolved per-user by the route/cron that needs them. Don't add a project-wide secret for something that is really per-user.

**Never give a required secret/config value an empty or placeholder fallback.** A missing required value (an `sst.Secret`, env var, etc.) must fail loudly at deploy/build/startup — do NOT paper over it with `new sst.Secret("X", "")` or any default that lets the app run misconfigured. Empty fallbacks hide misconfiguration and resurface as confusing runtime bugs later. The fix for an unset secret is to **seed the real value** (in both Console environments — production and the fallback env used by `pr-<N>` stages), never to soften the failure.

## CI/CD (GitHub Actions)

Four workflows live in `.github/workflows/` (plus `.github/release.yml`, the GitHub release-notes category config). SST is the deploy tool.

| Workflow | Trigger | What it does |
|---|---|---|
| `deploy.yml` | push to `master`; PR opened/synchronize/reopened | Runs the gates, then deploys `production` (push) or `pr-<number>` (PR). |
| `teardown.yml` | PR closed (merged or not) | `sst unlock → refresh → remove` of the `pr-<number>` stage. Skips `release-please--*` branches. |
| `release.yml` | push to `master`; `workflow_dispatch` | release-please maintains a Release PR; merging it tags `vX.Y.Z` + cuts a GitHub Release with AI-written notes (`packages/scripts/src/release-notes.ts`). |
| `pr-screenshots.yml` | PR opened/synchronize/reopened | Upserts a sticky PR comment embedding any images added under `docs/verification/` (pairs with the `/verify` skill). |

- Push to `master` → deploys `production` stage.
- Open / update / reopen a PR → deploys ephemeral `pr-<number>` stage.
- Close a PR → removes `pr-<number>` stage (`sst unlock` → `sst refresh` → `sst remove`).
- Concurrency group per stage; in-progress runs are cancelled when a newer commit lands.
- **`[skip deploy]` escape hatch (repo-custom, NOT a GitHub-native token):** putting `[skip deploy]` in the push head commit message (production path) or in the PR title (pr-`<N>` path) skips the SST deploy steps (Configure AWS credentials, SST unlock, SST deploy, Surface deployment URLs) while still running lint/typecheck/unit/integration. Unlike `[skip ci]` (which would skip the entire workflow run including all gates), `[skip deploy]` only suppresses the deployment — the quality gates always run.

Steps for a `deploy.yml` run (in order): checkout → setup Node 22 → resolve stage / deploy-gate / E2E-gate → `npm ci` → `npm run lint` → `npm run typecheck` → `npm run test:unit` → `npm run test:integration` → install Playwright Chromium → `npm run test:e2e` (marketing) → **`npm run test:e2e:application`** (only when the `[E2E]` gate is true) → `aws-actions/configure-aws-credentials` (OIDC) → `npx sst unlock` (best-effort) → `npx sst deploy --stage <stage>` → surface deployment URLs. **Every gate before "Configure AWS credentials" runs without AWS** (dynalite + offline `cognito-local` + offline Next.js), so they block the deploy without needing credentials.

Things worth knowing about these workflows:
- **Region is pinned to `us-east-1`** (`AWS_REGION` in both deploy + teardown) — required so ACM can issue the CloudFront cert. Don't deploy to another region without changing this.
- **JS action runtimes are forced to Node 24** via `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` (Node 20 action runtime is deprecated). This is separate from the Node 22 that `setup-node` provisions for `npm`/`tsc`/`next`.
- **Doc-only / config-only pushes don't deploy:** `deploy.yml` has `paths-ignore` for `**.md`, `.claude/**`, `.gitignore`, `LICENSE`. Editing CLAUDE.md or a skill won't trigger a deploy.
- **"Surface deployment URLs"** parses the SST deploy log and emits the stage's URLs as `::notice::` banners + a job summary — handy for grabbing the `pr-<N>` URL from the run page (including on mobile).
- **The `production` deploy is never auto-cancelled** (`cancel-in-progress` is false for `push`) so a `master` deploy is never killed mid-apply; only superseded `pr-<N>` deploys are cancelled.
- **Release notes use Claude:** `release.yml` installs `@anthropic-ai/claude-code` and runs `packages/scripts/src/release-notes.ts` with `CLAUDE_CODE_OAUTH_TOKEN` to AI-author the GitHub Release body. The `.github/release.yml` file controls the changelog category buckets (Features / Fixes / Documentation / Maintenance) by PR label — keep labels conventional so changes land in the right bucket.

### Required GitHub repository secrets

Set under **Settings → Secrets and variables → Actions → Secrets** before the first run:

- `AWS_ROLE_ARN` — ARN of the IAM role the workflows assume via GitHub OIDC, e.g. `arn:aws:iam::<AWS_ACCOUNT_ID>:role/github-actions-deploy`. The role's trust policy must allow `token.actions.githubusercontent.com` for this repo; the role itself needs permissions to deploy this SST app.
- `CLOUDFLARE_API_TOKEN` — same token used by the Cloudflare DNS records (also referenced in `deploy.yml`/`teardown.yml` env).
- `CLAUDE_CODE_OAUTH_TOKEN` — used by `release.yml` to AI-author the GitHub Release notes via `packages/scripts/src/release-notes.ts`. (The built-in `GITHUB_TOKEN` is injected automatically by Actions — no setup needed.)
- `COGNITO_TEST_USERNAME` / `COGNITO_TEST_PASSWORD` — credentials of the seeded test user used for headless `InitiateAuth` sign-in in the opt-in `[E2E]` authed application E2E job. With the offline `cognito-local` emulator these are arbitrary values you also seed at setup time; if you instead point the job at a real dev/test user pool, they must match a confirmed user in that pool. **Never a production user.**
- (Only if the `[E2E]` job targets a real dev/test pool instead of `cognito-local`) `COGNITO_TEST_USER_POOL_ID` and `COGNITO_TEST_CLIENT_ID` — the dev/test pool + app-client ids the job authenticates against. Omit when running fully offline against `cognito-local`.

The workflows authenticate to AWS via OIDC (`aws-actions/configure-aws-credentials@v4` with `role-to-assume`), so no long-lived AWS access keys are stored in GitHub.

SST application secrets (the `sst.Secret` entries in `infra/secrets.ts`) are stored in AWS SSM Parameter Store, not in GitHub. Seed them per stage with `npx sst secret set <NAME> <value> --stage <stage>` (or use the `npm run set-sst-vars` script with a `.env.local`).

## GitHub tooling

In Claude Code on the web, `gh` is installed and **authenticated** (as `jasonp2323` via `GH_TOKEN`) and github.com is reachable — so the full `gh` CLI is available, not just the MCP tools. Use the right tool for the job:

- **GitHub Projects (v2)**: use `gh api graphql` (the GitHub MCP server has no Projects tool). **Do NOT use the `gh project …` subcommands** in the web environment: they resolve the owner's type (user vs org) first, which needs the `read:org` scope. The web `GH_TOKEN` is a classic PAT scoped to `project, repo` only (no `read:org`), so `gh project …` fails with `unknown owner type` — while raw GraphQL against `user(login:"jasonp2323"){ projectV2(number:5) }` works fine with just the `project` scope. See the GraphQL snippet below.
- **PRs, issues, comments, CI status, reviews, branches, releases, code search**: prefer the GitHub MCP tools (`mcp__github__*`) — they integrate with the PR-activity webhook subscriptions used to watch/autofix PRs. `gh` is a fine fallback for anything the MCP tools don't cover.

**⚠️ Keep the GitHub Project board Status current — every session, every task. This is a standing requirement, not a nicety.** GitHub Projects/Issues is the source of truth for the milestones and their phases. **The moment you start, advance, or finish work on an issue, move its Project Status in the same turn** — do NOT batch it for "later" or leave the board lagging behind the actual work. If you touch a task, its Status must reflect reality before you end the turn.

Status lifecycle (Project "Transform My Notes", single-select **Status** field):
- **Backlog → In progress** the moment you begin work on an issue/phase.
- **In progress → In review** when the work is implemented and pushed to a PR (code complete, not yet merged).
- **In review → Done** when the PR merges and the change is verified. Also close the issue (`state: closed`) and tick the epic's phase checklist.
- **Ready** = scoped/queued but not yet started.

Mechanism — use `gh api graphql` (works with the `project` scope alone; the `gh project …` wrapper does **not** — see the Projects bullet above). Set an issue's Status in three steps: resolve the issue's node id, add it to the board (`addProjectV2ItemById` is idempotent — it returns the existing item id if the issue is already on the board), then set the field:
```bash
PID=PVT_kwHOAu5WHs4BZ5E3                        # project "Transform My Notes" (number 5, owner jasonp2323)
STATUS_FIELD=PVTSSF_lAHOAu5WHs4BZ5E3zhU0khY          # the single-select "Status" field
# Status option IDs: Backlog=f75ad846  Ready=61e4505c  In progress=47fc9ee4  In review=df73e18b  Done=98236657
ISSUE=129; OPT=47fc9ee4                              # e.g. move #129 → In progress

CID=$(gh api repos/jasonp2323/transformmynotes/issues/$ISSUE -q .node_id)
ITEM=$(gh api graphql -f query='mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}' \
  -f p="$PID" -f c="$CID" -q '.data.addProjectV2ItemById.item.id')
gh api graphql -f query='mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){projectV2Item{id}}}' \
  -f p="$PID" -f i="$ITEM" -f f="$STATUS_FIELD" -f o="$OPT"
```
If these IDs ever go stale, re-derive them with GraphQL: `gh api graphql -f query='query{user(login:"jasonp2323"){projectV2(number:5){id field(name:"Status"){... on ProjectV2SingleSelectField{id options{id name}}}}}}'`. Whenever you change Status, also run the stamp helper: `start` when an issue leaves Backlog, `done` when it reaches Done (see the "Cycle-time tracking" section below).

### Task sizing — every issue gets a Size (required)

**Every issue MUST have a `Size` set — at creation time, never left blank.** The Project's single-select `Size` field (XS/S/M/L/XL) is what drives the size-aware execution strategy (see "Size-aware execution" near the top of this file), so a missing Size means a task runs with no context plan. When you create an issue — or pick up one that has no Size — set it in the same turn.

Rough rubric:
- **XS** — trivial: a one-line/config tweak, a copy change, a single rename.
- **S** — small focused change: one file or one component, no new access pattern.
- **M** — a feature slice: a few files, maybe one new DB access pattern + its test.
- **L** — a full milestone phase: multiple components/routes, schema + UI + tests.
- **XL** — epic-scale / multi-phase. Prefer to **decompose into phase sub-issues** rather than leave a single XL issue.

Set it the same way as Status — same `gh api graphql` `updateProjectV2ItemFieldValue` mutation (resolve `CID`/`ITEM` exactly as in the Status snippet above), just point at the Size field:
```bash
PID=PVT_kwHOAu5WHs4BZ5E3                        # "Transform My Notes"
SIZE_FIELD=PVTSSF_lAHOAu5WHs4BZ5E3zhU0lLA            # the single-select "Size" field
# Size option IDs: XS=6c6483d2  S=f784b110  M=7515a9f1  L=817d0097  XL=db339eb2
gh api graphql -f query='mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){projectV2Item{id}}}' \
  -f p="$PID" -f i="$ITEM" -f f="$SIZE_FIELD" -f o="f784b110"   # e.g. Size=S
```

## Session continuity & memory model

Each milestone is large and spans many fresh (often ephemeral web) sessions. Memory is **layered by how often it changes** — do NOT recreate a monolithic handoff doc each session:

- **Durable knowledge** (architecture, conventions, testing, deploy, secrets) lives here in `CLAUDE.md` + the `project-conventions` skill.
- **Per-milestone plans/specs** live in `docs/milestones/M*.md` (the version-controlled source of truth — diffable, offline, no API/rate-limit cost) **and are mirrored in full into the milestone's epic issue body**. When you create a milestone, do NOT leave the GitHub side sparse: after writing `docs/milestones/M*.md`, open (or update) the **epic issue** and paste the **complete spec** — locked decisions, schema additions, phases, dependencies, risks — into its body so GitHub is a faithful copy, not a one-line stub. Keep the two in sync: when the `.md` changes, update the epic issue body in the same turn. The GitHub **milestone object** itself only has a single description field, so it stays a one-line summary by design — richness lives in the epic issue, never crammed into the milestone description.
- **Live status** (done / in-flight / blockers / next steps / gotchas) lives in the **epic issue's "Status / Next steps / Gotchas" section** + the GitHub Project board Status column — that is the source of truth. Update the epic issue as work lands; don't let status drift into scratch files.
- A **SessionStart hook** (`.claude/hooks/session-start.sh`) auto-prints orientation (recent commits, open PRs, open milestones, recent issues) at the start of every session.

## Cycle-time tracking (GitHub-native)

Cycle time is tracked natively in the GitHub Project.

### Field scheme

The "Transform My Notes" Project (number 5, owner `jasonp2323`) has these fields for every issue:

| Field | Type | Meaning |
|---|---|---|
| `Actual Start` | DATE | Day-granularity start stamp (shown on the roadmap). |
| `Actual Finish` | DATE | Day-granularity finish stamp (shown on the roadmap). |
| `Started At` | TEXT | ISO-8601 datetime, second precision. Set when work begins. |
| `Completed At` | TEXT | ISO-8601 datetime, second precision. Set when work is done. |
| `Cycle Minutes` | NUMBER | Whole minutes from `Started At` to `Completed At`. **Derived.** |
| `Cycle Time` | TEXT | Human-readable duration (e.g. "1d 4h 30m"). **Derived.** |

### Stamping rule

- **When an issue's Status first leaves `Backlog`** (work starts): set `Actual Start` = today and `Started At` = now, **only if `Actual Start` is currently empty** (idempotent).
- **When an issue moves to `Done`**: set `Actual Finish` = today and `Completed At` = now; then compute `Cycle Minutes` = minutes between `Started At` and `Completed At`, and `Cycle Time` = human-readable form (e.g. "45m", "2h 30m", "1d 1h"). If `Started At` was never set, the finish stamps are still written but cycle time is skipped with a warning.

### Stamp helper

```bash
npm run -s stamp --prefix packages/scripts -- <issue-number> start
npm run -s stamp --prefix packages/scripts -- <issue-number> done
```

The helper resolves all field/item IDs at runtime via the `gh` CLI — no hardcoded node IDs. Run `start` when you begin work on an issue; run `done` when it reaches Done.

## Conventions

- All cross-package imports go through workspace package names (`@transformmynotes/core/db`), not relative paths.
- New DynamoDB access patterns: add the key builder in `packages/core/src/db/keys.ts` first; never inline `pk`/`sk` strings in route handlers.
- New infra resources: create a module under `infra/` and import it from `sst.config.ts` in the right order (secrets → router → apps that attach to it). New configuration values go in `infra/secrets.ts` as `sst.Secret` and get seeded via the Console.
- Use `$app.stage === "production"` (the `isProd` pattern) to gate anything that should only run for the named stage — don't hardcode against ephemeral stage names.
- Any new pure logic (calculations, parsers, data transforms, DB key builders) ships with unit tests in the same change. CI runs these via `npm run test:unit`.
- Any new or changed DynamoDB access pattern (GSI query, index-maintaining upsert) ships with a dynalite integration test (`*.integration.test.ts` in `packages/core/test/`) that does the real write→read round-trip. CI runs these via `npm run test:integration`. See "Integration tests — dynalite" above.
- Any UI change (a page or component) gets a real browser UI test — render the page, drive the changed flow, and observe it; don't rely on typecheck/unit tests alone for UI. See "Local UI / browser testing" above.

## Git Workflow

- Provide a commit message to the user for any changes made to code.
- **Conventional Commits are required.** Every commit message — and every PR title (squash-merge uses the PR title as the commit message) — must start with a Conventional Commit type (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, etc.), optionally scoped (e.g. `feat(application): …`). Release-please parses these on every push to `master` to build the changelog and decide the version bump; a non-conforming message is silently omitted from the release.
- Never commit or push directly to `master`. Always work on a feature branch; if checked out on `master`, branch off before staging.
- **Name the branch after what it delivers.** For milestone work, use `m<N>-phase-<P>-<slug>` (e.g. `m4-phase-2-command-palette`); for a whole milestone with no single phase, `m<N>-<slug>`. For anything that isn't milestone/phase work, name it after the issue/bug/task it resolves — `issue-<N>-<slug>` (or `fix-<slug>` / `chore-<slug>` when there's no issue number). Keep the slug short and kebab-case. **Always name the branch this way yourself — do NOT use a harness-assigned branch name (e.g. a `claude/…` name with a random suffix). If you start on such a branch, rename it (or create and switch to a properly named one) before committing.**
- Run `npm run typecheck` and `npm run lint` from the repo root before every commit and before the final push. Both must exit 0. Never use `--no-verify` to bypass hooks — the same checks run in CI.
- Discard build cache files before staging: `git checkout -- packages/*/tsconfig.tsbuildinfo`. They're local-only artifacts that pollute diffs.
- **Don't push while a deploy is in flight for the same stage.** Before pushing to a branch with an open PR (its push deploys that `pr-<N>` stage) or to `master` (deploys `production`), check for a running Deploy run on that stage and wait for it to finish — `gh run list --workflow Deploy --branch <branch> --status in_progress` (also check `--status queued`). Pushing mid-deploy trips the workflow's `cancel-in-progress`, which kills the in-flight deploy **mid-apply** and can leave SST/Pulumi state out of sync with AWS (e.g. AWS created a GSI but state never recorded it → the next deploy fails with "index already exists"). If a deploy is running, wait for it; recovering from a cancelled-mid-apply deploy means `sst refresh --stage <stage>` then redeploy.
- When code changes are complete, committed, pushed, and the gates are green, **STOP — do NOT open a PR automatically.** See "🚫 HIGHEST PRIORITY — NEVER open a PR without the user's explicit permission" near the top of this file: opening a PR requires the user's explicit permission every time. Push the branch, summarize what's ready, and ask whether they want a PR opened. Only open one (targeting `master` with a descriptive title/body and test plan) once they say yes. If an open PR already tracks the branch, push to update it instead of opening a duplicate.
- After opening (or updating) a PR — **only ever done with the user's explicit permission** — **end the summary with three links, in this exact order**: (1) the **PR** — `https://github.com/jasonp2323/transformmynotes/pull/<pr#>`, (2) the **issue** it resolves — `https://github.com/jasonp2323/transformmynotes/issues/<issue#>`, (3) the **branch** — `https://github.com/jasonp2323/transformmynotes/tree/<branch>`. Label each line with its number (PR #, Issue #, branch name).
