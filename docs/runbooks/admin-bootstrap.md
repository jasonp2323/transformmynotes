# Admin Bootstrap: Promote First User to `admin` Group

This runbook walks through promoting the first user to the `admin` Cognito group in the **production** stage. There is no code path for this at M0 — this runbook is the mechanism. Estimated time: under 10 minutes.

> **Tip — validate on a PR stage first.** Every ephemeral `pr-<N>` stage gets its own Cognito user pool (Cognito is a native AWS resource provisioned per-stage). You can run through this entire procedure on a `pr-<N>` stage before touching production: substitute the PR stage's pool ID wherever `<POOL_ID>` appears below. This is the recommended way to satisfy the milestone DoD for this runbook.

---

## Prerequisites

- AWS Console access (or AWS CLI with credentials) for the account that hosts TransformMyNotes.
- The AWS CLI installed and configured if you prefer CLI commands (`aws --version`).
- All commands target **`us-east-1`** — the deploy region pinned in `.github/workflows/`.

---

## 1. Find the Cognito user pool ID

The user pool is defined in `infra/auth.ts` as:

```ts
export const userPool = new sst.aws.CognitoUserPool("UserPool", { ... });
```

SST names AWS resources using the pattern `<app>-<stage>-<resource>`, so in the production stage the pool appears in the Cognito console as something like **`transformmynotes-production-UserPool`** (the exact name contains the SST resource name `"UserPool"` and the stage `production`).

**In the AWS Console:**

1. Open the [Amazon Cognito console](https://console.aws.amazon.com/cognito/v2/idp/user-pools).
2. Confirm the region selector (top-right) is set to **US East (N. Virginia) — `us-east-1`**.
3. Locate the pool whose name contains `production` and `UserPool`.
4. Click the pool name to open it. The **Pool ID** (format `us-east-1_XXXXXXXXX`) is shown on the overview page — click the copy icon next to it.

**Via the AWS CLI:**

```bash
aws cognito-idp list-user-pools --max-results 20 --region us-east-1 \
  --query "UserPools[?contains(Name, 'production')].[Id, Name]" \
  --output table
```

Note the `Id` value (`us-east-1_XXXXXXXXX`) — this is `<POOL_ID>` in all commands below.

---

## 2. Pre-create the `admin` group

The group must exist before you can add a user to it.

**AWS CLI:**

```bash
aws cognito-idp create-group \
  --user-pool-id <POOL_ID> \
  --group-name admin \
  --description "Administrators" \
  --region us-east-1
```

**Console alternative:**

1. Inside the user pool, open the **Groups** tab.
2. Click **Create group**.
3. Enter `admin` as the group name and optionally add a description.
4. Click **Create group**.

If the group already exists (e.g. you ran this before), the CLI returns an error `GroupExistsException` — that is safe to ignore; continue to the next step.

---

## 3. Find or create the first admin user

> Self sign-up is disabled (`allowAdminCreateUserOnly: true` in `infra/auth.ts`), so all users are created by an admin. Usernames are email addresses (`usernames: ["email"]` in `infra/auth.ts`).

**If the user already exists** (they were invited earlier), skip to step 4.

**If you need to create the user now:**

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <POOL_ID> \
  --username <email> \
  --user-attributes Name=email,Value=<email> Name=email_verified,Value=true \
  --region us-east-1
```

Replace `<email>` with the user's email address (e.g. `admin@example.com`). Cognito will send them a temporary password by email — they will be prompted to set a permanent password on first sign-in.

**To find an existing user in the Console:**

1. Inside the user pool, open the **Users** tab.
2. Search by email or scroll to find the target user.
3. Note the exact **Username** value shown — use it as `<email>` in the commands below.

---

## 4. Add the user to the `admin` group

**AWS CLI:**

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <POOL_ID> \
  --username <email> \
  --group-name admin \
  --region us-east-1
```

A successful call returns no output (HTTP 200 with an empty body).

**Console alternative:**

1. Inside the user pool, open the **Users** tab and click the target user.
2. Scroll to the **Group memberships** section.
3. Click **Add user to group**.
4. Select `admin` from the list and confirm.

---

## 5. Verify admin group membership

**AWS CLI:**

```bash
aws cognito-idp admin-list-groups-for-user \
  --user-pool-id <POOL_ID> \
  --username <email> \
  --region us-east-1
```

Expected output — a `Groups` array containing an entry with `GroupName: "admin"`:

```json
{
    "Groups": [
        {
            "GroupName": "admin",
            "UserPoolId": "us-east-1_XXXXXXXXX",
            "Description": "Administrators",
            "LastModifiedDate": "...",
            "CreationDate": "..."
        }
    ]
}
```

If the `Groups` array is empty, re-check step 4 and confirm the correct pool ID and username were used.

---

## 6. Sign out and sign back in

Cognito embeds group membership in the **ID token** as the `cognito:groups` claim. This claim is set at token-issuance time, so the user must **sign out and sign back in** for it to appear.

**To verify the claim in a browser after signing in:**

1. Open browser DevTools → Application → Cookies (or Storage).
2. Locate the Cognito ID token cookie or `localStorage` key.
3. Copy the JWT (the middle segment, between the two `.` characters).
4. In the browser console, decode it:
   ```js
   JSON.parse(atob('<paste-middle-segment-here>'))
   ```
5. Confirm `cognito:groups` includes `"admin"`:
   ```json
   {
     "cognito:groups": ["admin"],
     "email": "admin@example.com",
     ...
   }
   ```

---

## Summary

| Step | Action | CLI command |
|------|--------|-------------|
| 1 | Find pool ID | `list-user-pools` |
| 2 | Create `admin` group | `create-group` |
| 3 | Find or create user | `admin-create-user` (if needed) |
| 4 | Add user to group | `admin-add-user-to-group` |
| 5 | Verify membership | `admin-list-groups-for-user` |
| 6 | Re-issue token | Sign out → sign back in |

All commands use `--region us-east-1` (the deploy region pinned in `.github/workflows/deploy.yml` and `.github/workflows/teardown.yml`).

---

## Using this runbook on a PR stage

Substitute the `pr-<N>` stage's pool ID for `<POOL_ID>` in every command. To find it:

```bash
aws cognito-idp list-user-pools --max-results 20 --region us-east-1 \
  --query "UserPools[?contains(Name, 'pr-')].[Id, Name]" \
  --output table
```

Look for the pool whose name contains the PR number (e.g. `transformmynotes-pr-42-UserPool`). Everything else — group creation, user creation, membership assignment, and token verification — is identical.
