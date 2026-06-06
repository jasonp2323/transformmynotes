# Template setup — fill these in for a new project

This repo's `CLAUDE.md` and `.claude/` were templatized from a real, successful project.
Everything project-specific has been replaced with `{{DOUBLE_BRACE}}` placeholders. To adopt
the template on a new project, replace every placeholder below across `CLAUDE.md`, `.claude/`,
and any docs. Then delete this file (or keep it as a record).

Find every remaining placeholder at any time:

```bash
grep -rn "{{" CLAUDE.md .claude        # bash
```
```powershell
Select-String -Path .\CLAUDE.md, .\.claude\* -Pattern '\{\{' -Recurse   # PowerShell
```

## 1. Identity & hosting

| Placeholder | What it is | Example (from the source project) |
|---|---|---|
| `{{REPO}}` | Full GitHub slug `owner/repo` | `Token-Buzz/website` |
| `{{REPO_OWNER}}` | GitHub org / owner | `Token-Buzz` |
| `{{REPO_NAME}}` | GitHub repo name | `website` |
| `{{GH_USERNAME}}` | The `gh` CLI auth user | `jasonp2323` |
| `{{DEFAULT_BRANCH}}` | Default/trunk branch | `master` |
| `{{PKG_SCOPE}}` | npm scope for workspace packages | `@website` / `@monorepo-template` |
| `{{WEB_DOMAIN}}` | Apex production domain | `tokenbuzz.app` |
| `{{STAGING_DOMAIN}}` | Staging/preview domain | `staging.tokenbuzz.app` |
| `{{AWS_ACCOUNT_ID}}` | AWS account id | `421219980711` |
| `{{AWS_DEPLOY_ROLE_ARN}}` | IAM role the CI assumes via OIDC | `arn:aws:iam::421219980711:role/github-actions-deploy` |

## 2. GitHub Project board (cycle-time + Status + Size)

Create the Project (Projects v2) with single-select **Status** and **Size** fields, then
re-derive every node id at runtime — none of these are guessable, and they differ per project:

```bash
# Project number + node id
gh project list --owner {{REPO_OWNER}} --format json
# Field + option ids (Status, Size)
gh project field-list {{PROJECT_NUMBER}} --owner {{REPO_OWNER}} --format json
```

Fill in:

| Placeholder | What it is |
|---|---|
| `{{PROJECT_NAME}}` | Human name of the Project (e.g. "Acme Project") |
| `{{PROJECT_NUMBER}}` | Project number (e.g. `1`) |
| `{{PROJECT_ID}}` | Project node id (`PVT_…`) |
| `{{STATUS_FIELD_ID}}` | Single-select Status field id (`PVTSSF_…`) |
| `{{STATUS_BACKLOG}}` / `{{STATUS_READY}}` / `{{STATUS_INPROGRESS}}` / `{{STATUS_INREVIEW}}` / `{{STATUS_DONE}}` | Status option ids |
| `{{SIZE_FIELD_ID}}` | Single-select Size field id (`PVTSSF_…`) |
| `{{SIZE_XS}}` / `{{SIZE_S}}` / `{{SIZE_M}}` / `{{SIZE_L}}` / `{{SIZE_XL}}` | Size option ids |

The Project also needs these fields for cycle-time stamping (see CLAUDE.md → "Cycle-time
tracking"): `Actual Start` (DATE), `Actual Finish` (DATE), `Started At` (TEXT),
`Completed At` (TEXT), `Cycle Minutes` (NUMBER), `Cycle Time` (TEXT). The `packages/scripts`
`stamp` helper resolves their ids at runtime, so they don't need placeholders here.

## 3. Secrets to seed (SST `sst.Secret` + Console env)

The template ships the stack-standard secret names only. Seed them in both the production and
fallback Console environments (or via `npx sst secret set <NAME> <value> --stage <stage>`), and
**add your own app-specific secrets** to `infra/secrets.ts` as you build features:

`WEB_DOMAIN`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `RESEND_API_KEY`,
`CONTACT_TO_ADDRESS`, `CONTACT_FROM_ADDRESS`.

Auth (AWS Cognito) needs **no secret** here — the app reads the user-pool id + app-client id
from the `sst.Resource` binding (`infra/auth.ts`), and those are public values.

`CLOUDFLARE_API_TOKEN` is the exception: it's read from `process.env` in `app()` before secrets
load, so set it as a Console **environment variable** (and a GitHub Actions secret), not an
`sst.Secret`.

## 4. GitHub repository secrets (Actions)

Set under **Settings → Secrets and variables → Actions**:

- `AWS_ROLE_ARN` → `{{AWS_DEPLOY_ROLE_ARN}}`
- `CLOUDFLARE_API_TOKEN`
- `CLAUDE_CODE_OAUTH_TOKEN` — used by `release.yml` to AI-author GitHub Release notes.
  (`GITHUB_TOKEN` is provided automatically by Actions — no setup needed.)
- (Only for the opt-in `[E2E]` authed app job) `COGNITO_TEST_USERNAME` + `COGNITO_TEST_PASSWORD`
  for the seeded test user, plus `COGNITO_TEST_USER_POOL_ID` + `COGNITO_TEST_CLIENT_ID` **only if**
  the job targets a real dev/test Cognito pool instead of the offline `cognito-local` emulator.
  Never a production user.

### Workflow companion files (not in `.github/`)

`deploy.yml` / `release.yml` reference repo-root files and scripts you must also provide for a
new project (the `.github/` folder alone isn't enough):

- `release-please-config.json` + `.release-please-manifest.json` — release-please config/manifest (repo root).
- `packages/scripts/src/release-notes.ts` — the AI release-notes script `release.yml` runs.
- `npm run` scripts the workflows call: `lint`, `typecheck`, `test:unit`, `test:integration`,
  `test:e2e`, `test:e2e:application`.
- `pr-screenshots.yml` expects verification images committed under `docs/verification/<slug>/`
  (the `/verify` skill produces these).
- Replace the literal `{{DEFAULT_BRANCH}}` in the workflow `on:` triggers — a workflow won't fire
  until that's a real branch name.

## 5. Define your own domain model

The template describes the DynamoDB single-table **pattern** but ships no concrete domain
tables. In `infra/db.ts` define your tables + GSIs, add key builders in
`packages/core/src/db/keys.ts`, and document the GSI conventions in CLAUDE.md →
"Persistence". A `UserData` table (per-user records, BYOK creds, settings) is a good generic
starting point most apps need.

## 6. Machine-local file

`.claude/settings.local.json` is per-machine and usually git-ignored. The template ships it
empty. Let it accumulate local permission grants naturally; don't commit machine paths.
