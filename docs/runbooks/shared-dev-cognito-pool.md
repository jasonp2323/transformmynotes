# Shared dev Cognito pool (issue #460)

Ephemeral `pr-<N>` stages reference a single centralized Cognito user pool (owned by a
long-lived `dev` stage) instead of provisioning their own. This means test users persist
across PRs and no per-PR pool churn occurs. Production and any other named stage continue
to own their own pool exactly as before.

## Why

Before issue #460 every PR stage created its own Cognito user pool at deploy time. Because
pools are stateful (they hold user accounts, groups, and app clients) and cannot be created
instantly, this slowed PR deploys and wiped test users on every PR close. The fix is to
share one long-lived dev pool across all PR stages while keeping production isolated.

## How it works

`infra/auth.ts` checks `$app.stage.startsWith("pr-")`:

- **Non-PR stages** (production, `dev`, any other named stage): `new
  sst.aws.CognitoUserPool(...)` creates and owns the pool, including the post-confirmation
  Lambda trigger and the `allowAdminCreateUserOnly` transform.
- **PR stages**: `sst.aws.CognitoUserPool.get("UserPool", devCognitoUserPoolId.value)`
  returns a lightweight reference to the existing pool by id. The pool itself is NOT managed
  by the PR stage — only referenced.

Each PR stage still calls `userPool.addClient("Web", {...})` to create its own app client
on the shared pool. SST cannot yet reference an existing client, so this is the correct
approach — the expensive/stateful resource (the pool and its users) is shared; the
lightweight resource (the app client) is per-stage.

The `DEV_COGNITO_USER_POOL_ID` secret (`infra/secrets.ts`) carries the pool id. It is
seeded **only in the fallback Console environment** (which automatically covers all `pr-<N>`
stages). The production environment does NOT need it — the production path never accesses
`.value` on this secret.

Domain data (UserData table, Notes table) continues to live in each stage's own DynamoDB
tables — only Cognito identities are shared. The invite-redeem route writes to the stage's
OWN `UserData` table via the stage's own IAM role, so sharing the pool does not mis-route
application data.

## One-time setup

This is done once for the lifetime of the repository. Skip if the `dev` stage already
exists and `DEV_COGNITO_USER_POOL_ID` is set in the fallback Console environment.

### 1. Deploy the `dev` stage

```bash
npx sst deploy --stage dev
```

This creates the long-lived `dev` pool (SST resource name `UserPool`, AWS name
`transformmynotes-dev-UserPool-...`). The deploy output includes the pool id — copy it.

Alternatively retrieve it after the fact:

```bash
aws cognito-idp list-user-pools --max-results 60 --region us-east-1 \
  --query "UserPools[?contains(Name, 'dev')].[Id, Name]" --output table
```

The pool id looks like `us-east-1_XXXXXXXXX`.

### 2. Bootstrap groups and a test user in the dev pool

Follow the `bootstrap-admin.md` runbook targeting the `dev` stage pool id. At minimum
create the `admin` and `member` groups and seed a confirmed test user (admin or member as
needed for testing). These identities persist across all PR stages that reference this pool.

```bash
POOL_ID=us-east-1_XXXXXXXXX   # the dev pool id from step 1

# Create groups (safe to rerun — GroupExistsException is ignored)
aws cognito-idp create-group --user-pool-id $POOL_ID --group-name admin \
  --description "Administrators" --region us-east-1
aws cognito-idp create-group --user-pool-id $POOL_ID --group-name member \
  --description "Members" --region us-east-1
```

See `docs/runbooks/bootstrap-admin.md` for the full user-creation and profile-seeding steps.

### 3. Set the secret in the fallback Console environment

In the SST Console, open **Settings → Secrets → Fallback environment** and set:

```
DEV_COGNITO_USER_POOL_ID = us-east-1_XXXXXXXXX
```

Do NOT set this value in the production environment — production owns its own pool and
never reads this secret.

Or from the CLI — use the `--fallback` flag so the value applies to every stage that has
no stage-specific override (i.e. all `pr-<N>` stages). Do NOT use `--stage dev`: that would
scope the secret to the `dev` stage only and PR stages would never see it.

```bash
npx sst secret set DEV_COGNITO_USER_POOL_ID us-east-1_XXXXXXXXX --fallback
```

After this step all subsequent `pr-<N>` deploys will reference the dev pool instead of
creating their own.

## Caveats

- **Domain data is NOT shared.** Each `pr-<N>` stage has its own DynamoDB `UserData` and
  `Notes` tables. A Cognito user from the shared pool can sign in to a PR stage app but
  will have an empty account there (no notes, no profile) unless seeded. The invite-redeem
  route writes the profile to the PR stage's own `UserData` table.
- **Post-confirmation trigger.** The trigger Lambda is installed on the owned pool (the
  `dev`/production pool) only. It fires on `ConfirmSignUp` events. Because all pools use
  `allowAdminCreateUserOnly`, public sign-up is disabled and the trigger essentially never
  fires for admin-created users — this is safe.
- **App clients accumulate.** Every `pr-<N>` deploy creates a new app client on the shared
  pool. Closed PR stages are torn down (`sst remove`) which deletes the app client. Stale
  clients from abandoned/interrupted teardowns are harmless but can be cleaned up in the
  Cognito console.
- **Pool deletion.** Deleting the `dev` stage (`sst remove --stage dev`) would delete the
  shared pool and break all future PR deploys until step 1–3 are redone. Keep the `dev`
  stage long-lived.
