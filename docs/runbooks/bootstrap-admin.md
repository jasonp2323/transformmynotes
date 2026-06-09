# Bootstrap-admin runbook (per stage)

How to stand up the **first admin account** on a fresh stage — production or an ephemeral
`pr-<N>` stage. There is no in-app account-creation path in M2 (self-service signup is disabled
by design — see below), so this manual runbook is the mechanism that creates the very first
admin, who can then provision everyone else (Cognito console, the M3 Admin Panel, or invites).

A non-engineer with AWS Console access can complete it end-to-end in well under 15 minutes.

> **Why no signup?** The Cognito pool is provisioned with `allowAdminCreateUserOnly: true`
> (`infra/auth.ts`), so the public `SignUp` API is disabled. Every account is admin-created.
> This runbook bootstraps the first such admin by hand.

> **Validate on a PR stage first.** Every ephemeral `pr-<N>` stage gets its **own** Cognito user
> pool and its own `UserData` DynamoDB table (both are native AWS resources provisioned per
> stage). Run this entire procedure against a `pr-<N>` stage before touching production —
> substitute that stage's pool ID / table name wherever `<POOL_ID>` / `<TABLE>` appear. This is
> the recommended way to satisfy the milestone DoD for this runbook.

---

## ⚠️ The step everyone forgets: two records, not one

Creating the Cognito user is **not enough** to log in. As of the M2.8 route gate, every
notebook route (`/dashboard`, `/notes/**`, `/review/**`, `/account`) calls `requireActiveUser`
(`packages/application/lib/require-user.ts`), which loads the caller's profile from the
`UserData` table by their Cognito `sub` and **redirects to `/pending` unless that profile exists
with `status: "active"`**. Console-created users go through `AdminCreateUser`, **not** `SignUp`,
so the (dormant) Post-Confirmation Lambda never fires and **no profile is written for them
automatically**.

A bootstrapped admin therefore needs **two** records:

1. a **Cognito user** in the `admin` group (steps 1–4), and
2. a matching **`UserData` profile item** with `status: "active"`, `role: "admin"` (step 6).

Skip step 6 and even a correctly-grouped admin will be bounced to `/pending` forever.

---

## Prerequisites

- AWS Console access (or the AWS CLI with credentials) for the account that hosts
  TransformMyNotes.
- AWS CLI installed if you prefer CLI commands (`aws --version`).
- All commands target **`us-east-1`** — the deploy region pinned in `.github/workflows/`.

---

## 1. Find the Cognito user pool ID

The pool is defined in `infra/auth.ts` as the SST resource `"UserPool"`. SST names AWS resources
`<app>-<stage>-<resource>`, so the production pool appears in the Cognito console as something
like **`transformmynotes-production-UserPool`**.

**Console:**

1. Open the [Amazon Cognito console](https://console.aws.amazon.com/cognito/v2/idp/user-pools).
2. Confirm the region (top-right) is **US East (N. Virginia) — `us-east-1`**.
3. Find the pool whose name contains your stage (`production` or `pr-<N>`) and `UserPool`.
4. Open it; copy the **Pool ID** (`us-east-1_XXXXXXXXX`) from the overview — this is `<POOL_ID>`.

**CLI:**

```bash
aws cognito-idp list-user-pools --max-results 60 --region us-east-1 \
  --query "UserPools[?contains(Name, '<stage>')].[Id, Name]" --output table
```

---

## 2. Pre-create the `admin` group

The group must exist before a user can join it.

```bash
aws cognito-idp create-group \
  --user-pool-id <POOL_ID> \
  --group-name admin \
  --description "Administrators" \
  --region us-east-1
```

`GroupExistsException` is safe to ignore — it means a prior run already created it.

**Console:** pool → **Groups** tab → **Create group** → name `admin` → **Create group**.

---

## 3. Create (or find) the admin user

Usernames are email addresses (`usernames: ["email"]` in `infra/auth.ts`).

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <POOL_ID> \
  --username <email> \
  --user-attributes Name=email,Value=<email> Name=email_verified,Value=true \
  --region us-east-1
```

Cognito emails a temporary password; the user sets a permanent one on first sign-in. To find an
existing user instead: pool → **Users** tab → search by email and note the exact **Username**.

**Capture the user's `sub`** — you need it for the profile item in step 6:

```bash
aws cognito-idp admin-get-user \
  --user-pool-id <POOL_ID> --username <email> --region us-east-1 \
  --query "UserAttributes[?Name=='sub'].Value" --output text
```

This prints the UUID `sub` (e.g. `9f1c…`) — call it `<SUB>` below.

---

## 4. Add the user to the `admin` group

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <POOL_ID> \
  --username <email> \
  --group-name admin \
  --region us-east-1
```

A successful call returns no output. **Console:** Users → the user → **Group memberships** →
**Add user to group** → `admin`.

This drives the **admin-route** gate: `proxy.ts` reads `cognito:groups` from the verified ID
token, so `/admin/**` requires this group. (The status gate in step 6 is separate.)

---

## 5. First sign-in (set a permanent password)

Sign in to the app at `https://app.transformmynotes.com` (production) or the stage's
`pr-<N>` app URL with the email + **temporary** password, and complete the forced password
change. This both activates the Cognito user and lets you confirm the credentials work — but you
will be redirected to `/pending` until step 6 is done. That redirect is expected.

---

## 6. Seed the `UserData` profile (`status: active`, `role: admin`)

This is the record that satisfies `requireActiveUser`. The item shape comes from
`buildUserProfileItem` (`packages/core/src/auth/profile.ts`) and the key builders in
`packages/core/src/db/keys.ts`:

| Attribute | Value |
|---|---|
| `pk` | `USER#<SUB>` |
| `sk` | `PROFILE` |
| `gsi1pk` | `STATUS#active` |
| `gsi1sk` | `<createdAt>` (ISO-8601) |
| `sub` | `<SUB>` |
| `email` | `<email>` |
| `name` | the admin's display name |
| `status` | `active` |
| `role` | `admin` |
| `groupIds` | `[]` |
| `noteCount` | `0` |
| `createdAt` / `updatedAt` | ISO-8601 timestamp |

The `UserData` table is the SST resource `"UserData"` (`infra/db.ts`), so it appears in DynamoDB
as **`transformmynotes-<stage>-UserData...`** — call it `<TABLE>`. Find it with:

```bash
aws dynamodb list-tables --region us-east-1 \
  --query "TableNames[?contains(@, '<stage>') && contains(@, 'UserData')]" --output text
```

### Option A — CLI `put-item` (quickest)

```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
aws dynamodb put-item --region us-east-1 --table-name <TABLE> --item '{
  "pk":        {"S": "USER#<SUB>"},
  "sk":        {"S": "PROFILE"},
  "gsi1pk":    {"S": "STATUS#active"},
  "gsi1sk":    {"S": "'"$NOW"'"},
  "sub":       {"S": "<SUB>"},
  "email":     {"S": "<email>"},
  "name":      {"S": "<Admin Name>"},
  "status":    {"S": "active"},
  "role":      {"S": "admin"},
  "groupIds":  {"L": []},
  "noteCount": {"N": "0"},
  "createdAt": {"S": "'"$NOW"'"},
  "updatedAt": {"S": "'"$NOW"'"}
}'
```

> Keep `gsi1sk` equal to `createdAt` so GSI1 (`STATUS#<status>` partition, `createdAt` sort)
> lists users chronologically — this is the partition the M3 admin queue reads.

### Option B — Console

DynamoDB console → **Tables** → `<TABLE>` → **Explore table items** → **Create item** → switch
to **JSON** view → paste the object above (real values for `<SUB>`, `<email>`, `<Admin Name>`,
timestamps) → **Create item**.

---

## 7. Re-issue the token and verify

Group membership is embedded in the **ID token** at issuance, so **sign out and sign back in**
after step 4/6 for `cognito:groups` to appear.

**Verify the admin claim** (browser): DevTools → Application → Cookies → find the
`CognitoIdToken` value → in the console decode its payload:

```js
JSON.parse(atob('<middle-segment-of-the-jwt>'))
```

Confirm it includes `"cognito:groups": ["admin"]` and the right `sub`.

**Verify the profile gate:** navigating to `/dashboard` should now load (not redirect to
`/pending`), and `/admin` should load (not redirect to `/dashboard?forbidden=1`).

**Verify group membership via CLI:**

```bash
aws cognito-idp admin-list-groups-for-user \
  --user-pool-id <POOL_ID> --username <email> --region us-east-1
```

Expect a `Groups` array containing `GroupName: "admin"`.

---

## Creating a regular member by hand (variant)

Same procedure with two changes: **skip step 4** (no `admin` group), and in step 6 set
`"role": {"S": "member"}`. The user still needs the `status: "active"` profile item or they'll be
held at `/pending`. (Most members will instead be created via the M3 Admin Panel or an invite —
this manual path is mainly for bootstrapping/test stages.)

---

## Summary

| Step | Action | Mechanism |
|------|--------|-----------|
| 1 | Find pool ID | `list-user-pools` |
| 2 | Create `admin` group | `create-group` |
| 3 | Create user + grab `sub` | `admin-create-user` / `admin-get-user` |
| 4 | Add to `admin` group | `admin-add-user-to-group` |
| 5 | First sign-in (set password) | App login (redirects to `/pending` — expected) |
| 6 | **Seed `UserData` profile** (`status:active`, `role:admin`) | `put-item` / Console |
| 7 | Re-issue token + verify | Sign out/in; decode ID token; `/dashboard` + `/admin` load |

All CLI commands use `--region us-east-1` (the deploy region pinned in
`.github/workflows/deploy.yml` + `teardown.yml`).

For automated `pr-<N>` test stages, the E2E harness seeds the test user via `cognito-local` and
its profile via dynalite, so this manual runbook is not run there.
