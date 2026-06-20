# M29 · Multi-factor authentication (TOTP + remembered devices)

> Size: XL · Depends on: M2 (Cognito auth, `proxy.ts`, Amplify sign-in), M3 (DynamoDB groups + admin panel + members roster)

## Goal

Add **opt-in/enforceable two-factor authentication** to the app using a **TOTP authenticator-app
code** (Google Authenticator / Authy / 1Password / etc.) as the second factor — the free,
Cognito-native option. MFA is **controllable per user from the admin panel** and **enforceable
across DynamoDB groups**: a user is required to have MFA if their per-user admin flag is set
**or** they belong to any group marked `mfaRequired`.

A required-but-unenrolled user is not locked out immediately — they get a **grace period**
(default **7 days**) during which they keep working under a nag banner, after which they are
hard-blocked until they enroll. Users who lose their authenticator recover **self-service** via
one-time **backup codes** (or, failing that, an **admin "Reset MFA"**). Enrolled users can
**"trust this device for 30 days"** (Cognito Remembered Devices) so they aren't re-challenged on
their own laptop/phone every sign-in.

## In scope

- **Cognito-native second factor**: set the user pool to `mfaConfiguration: OPTIONAL` with
  **software-token (TOTP) MFA** enabled, plus **device tracking in "user opt-in" mode**. Cognito
  issues the real `SOFTWARE_TOKEN_MFA` challenge at sign-in for enrolled users, so **token
  issuance (and therefore all API access) is genuinely gated** — not just the UI.
- **App-layer enforcement policy** (Cognito's pool MFA is binary, so "who is required" is computed
  by us): per-user admin toggle `mfaRequired` + per-group `mfaRequired`, combined into an
  effective requirement, with a **grace clock** and a hard block after the deadline.
- **Sign-in TOTP challenge**: implement the `confirmSignIn` TOTP step in the Amplify flow and the
  code-entry UI (the currently-stubbed "MFA not yet supported" branch in `auth-next-step.ts`).
- **Self-service enrollment & management** at `/account/mfa`: `setUpTOTP` → QR + manual secret →
  `verifyTOTPSetup` → `updateMFAPreference`; view enrolled status; disable MFA (only when not
  required); regenerate backup codes; manage trusted devices.
- **Backup codes**: on enrollment, mint N (10) one-time codes shown once + downloadable; stored
  **hashed** (sha256-keyed items, verify-only — not KMS, see decisions); regenerable.
- **Self-service recovery**: an unauthenticated "use a backup code" path that verifies password +
  consumes a backup code, disables the user's TOTP in Cognito, and forces re-enrollment.
- **Remembered devices**: a "Trust this device for 30 days" opt-in on the TOTP challenge screen,
  and a trusted-device list (forget a device) in `/account/mfa`.
- **Admin controls** on the existing M3 admin panel: per-user `mfaRequired` toggle + "Reset MFA"
  button + an MFA-status column on the members roster; a per-group `mfaRequired` toggle.
- Unit tests for all new pure logic (requirement/grace calculator, backup-code gen/hash),
  dynalite integration tests for the new access patterns, and browser UI tests for the
  enroll / sign-in-challenge / enforcement flows.

## Out of scope

- **SMS MFA** — costs per-message (SNS), needs origination setup + spend caps + fraud handling.
  Not in v1. (Could be a later phase; the enrollment UI is structured to allow adding a factor.)
- **Email-OTP MFA** — requires Cognito's paid **Essentials** feature tier. Not in v1.
- **Passkeys / biometric / WebAuthn sign-in** — requires the Cognito **Essentials tier** *and* a
  migration to the new managed-login UI + `USER_AUTH` choice-based auth flow (off our current
  `USER_PASSWORD_AUTH`/SRP Amplify flow). Tracked separately as **M30 · Passkey / biometric
  sign-in** (outline only).
- **Admins auto-required**: admin accounts follow the same per-user/group toggles as everyone
  else (no special-casing of the `admin` group) — a deliberate decision for this milestone.
- **Admin-configurable grace window**: the grace period is a single `MFA_GRACE_PERIOD_DAYS`
  constant (default 7) this milestone; making it an admin setting is a later enhancement.
- **Per-device step-up / risk-based MFA**, **WebAuthn as a *second* factor**, and **changing the
  SRP/password sign-in mechanics** beyond adding the TOTP challenge.

## Architecture & decisions

### The one decision everything hangs on — Cognito does the factor, the app owns the policy

Cognito's pool-level MFA is **binary** (`OFF` / `OPTIONAL` / `ON-for-everyone`); it cannot
natively require MFA for *some* users or groups. So:

- **Cognito = `OPTIONAL` software-token MFA.** It owns the cryptographic second-factor challenge
  (`SOFTWARE_TOKEN_MFA`) and gates token issuance for users who have enrolled + set a preference.
  This is what makes MFA *real* (API routes are protected, not just pages).
- **The app owns "who must have it."** We compute an **effective requirement** per user
  (`userMfaRequired || anyGroupRequiresMfa`) and enforce enrollment via an app-layer gate with a
  grace period. We do **not** flip the pool to `ON` (that would force *everyone* immediately).

### Cognito / infra changes (`infra/auth.ts`, `infra/application.ts`)

- Set `mfaConfiguration: OPTIONAL` and enable **software-token MFA** on the pool, and enable
  **device tracking** in **"user opt-in"** mode (`DeviceConfiguration`:
  `ChallengeRequiredOnNewDevice: true`, `DeviceOnlyRememberedOnUserPrompt: true`).
  > **Implementation note / risk:** `sst.aws.CognitoUserPool` may not expose `mfaConfiguration` /
  > `softwareTokenMfaConfiguration` / `deviceConfiguration` directly — likely set via SST
  > `transform` onto the underlying Pulumi `aws.cognito.UserPool`. Verify this during M29.1, and
  > verify that **OFF → OPTIONAL is an in-place update** (must NOT trigger pool replacement).
- IAM (`infra/application.ts`): add `cognito-idp:AdminSetUserMFAPreference` (admin "Reset MFA" +
  self-service recovery disable) and `cognito-idp:AdminForgetDevice` /
  `cognito-idp:AdminUpdateDeviceStatus` (admin device handling) scoped to the pool ARN.
  `AdminGetUser` / `AdminInitiateAuth` are already granted.

### Data model — additions only (no new table)

**`UserProfileItem`** (`USER#<sub>` / `PROFILE`, `packages/core/src/auth/profile.ts`) — new
optional fields (all backward-compatible; absent = falsy/unset):

```
mfaRequired?     boolean   per-user admin toggle (effective requirement also OR's group flags)
mfaEnabled?      boolean   cached enrollment status — set true on verifyTOTPSetup success,
                           false on admin/self reset. Cognito remains the source of truth for
                           the actual factor; this is the hot-path cache the gate reads.
mfaGraceStartedAt? string  ISO-8601 — stamped (idempotently) the first time the effective
                           requirement is true while unenrolled; cleared on enroll or when the
                           requirement drops.
```

**Backup-code items** — stored as **individual sha256-keyed items** under the user partition so a
recovery attempt is an O(1) `GetItem` + a conditional consume (no read-modify-write race on an
array):

```
PK: USER#<sub>   SK: MFACODE#<sha256(code)>
attrs: createdAt, usedAt?  (consumed via a conditional UpdateItem)
```

`mfaKeys.backupCodeItem(sub, code)` / `mfaKeys.backupCodePrefix(sub)` go in
`packages/core/src/db/keys.ts`. **Why hashing, not KMS:** backup codes are verify-only,
high-entropy random secrets — we never need the plaintext back, so a one-way hash is the correct
primitive (like a password), and sha256 (not a slow KDF) is fine because the codes carry full
entropy, with no brute-force surface. This intentionally diverges from the "per-user creds → KMS"
rule, which is for credentials that must be *decrypted* and reused.

**Group `#META`** (`GROUP#<groupId>` / `META`) — add `mfaRequired?: boolean`. A reader
`anyGroupRequiresMfa(groupIds)` batch-gets the user's group metas and returns whether any
requires MFA. (At current scale a user has few groups; revisit caching only if that changes.)

### Effective-requirement + grace calculator (pure logic, unit-tested)

`packages/core/src/auth/mfa-policy.ts` — a pure function the gate calls:

```
computeMfaState({
  userMfaRequired, groupMfaRequired, mfaEnabled, graceStartedAt?, graceDays, now
}) => {
  required: boolean,
  enrolled: boolean,
  state: 'ok' | 'grace' | 'blocked',
  graceDeadline?: string,        // when state is 'grace'
  stampGraceStartedAt?: string,  // gate must persist this if newly stamped
  clearGrace?: boolean           // gate must clear graceStartedAt when true
}
```

Rules: `required = userMfaRequired || groupMfaRequired`. If `!required` → `ok` (+ `clearGrace` if
a stamp exists). If `required && enrolled` → `ok` (+ `clearGrace`). If `required && !enrolled`:
no `graceStartedAt` yet → stamp `now`, `state: 'grace'`, deadline `now + graceDays`; else
deadline `graceStartedAt + graceDays` → `grace` while `now < deadline`, otherwise `blocked`.
`MFA_GRACE_PERIOD_DAYS = 7` lives here as a documented constant.

### Sign-in TOTP challenge (`auth-next-step.ts` + sign-in UI)

Amplify `signIn` returns `nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE'` for enrolled
users. Un-stub the "not yet supported" branch, surface a 6-digit code-entry screen, and call
`confirmSignIn({ challengeResponse: code })`. The code-entry screen also carries the **"Trust this
device for 30 days"** opt-in (passed to `confirmSignIn` so Cognito remembers the device) and a
link to **"Can't access your authenticator? Use a backup code"** (the recovery path).

### Enrollment & management (`/account/mfa`)

1. `setUpTOTP()` → render the QR (otpauth URI) + the manual secret.
2. User enters a code → `verifyTOTPSetup({ code })` → `updateMFAPreference({ totp: 'PREFERRED' })`.
3. `POST /api/account/mfa/enroll` persists `mfaEnabled = true`, **clears** `mfaGraceStartedAt`,
   and **mints + stores** N hashed backup codes, returning the **plaintext once** for display.
4. Management: view status; **disable** MFA (only allowed when the effective requirement is
   false — `updateMFAPreference({ totp: 'DISABLED' })` + `mfaEnabled = false`); **regenerate**
   backup codes (delete old `MFACODE#` items, write new, show once); **trusted devices** list
   (`fetchDevices` / `forgetDevice` via the user's own Amplify session).

### Enforcement gate (authed app layout)

A server-side check in the authed shell (`packages/application/app/(app)/layout.tsx` or a shared
server helper) on every authed navigation:

1. Load the profile (`mfaRequired`, `mfaEnabled`, `mfaGraceStartedAt`) + `anyGroupRequiresMfa`.
2. `computeMfaState(...)`. Persist `stampGraceStartedAt` / `clearGrace` deltas back to the profile.
3. `state === 'grace'` → render the **nag banner** (deadline countdown + "Set up MFA" CTA) but
   allow the page. `state === 'blocked'` → **redirect to `/account/mfa`** (forced setup).
   The gate **allowlists** `/account/mfa` and sign-out so a blocked user can still enroll/leave.

### Self-service recovery (unauthenticated)

`POST /api/auth/mfa/recover` — solves the chicken-and-egg that a backup code **cannot** satisfy
Cognito's TOTP challenge directly; instead it performs a **gated self-service reset**:

1. Input `{ username, password, backupCode }`. Verify the password via `AdminInitiateAuth`
   (`USER_PASSWORD_AUTH`) — a `SOFTWARE_TOKEN_MFA` challenge response proves the password is
   correct (we do **not** complete it).
2. Resolve the user's `sub`; `GetItem` `MFACODE#<sha256(backupCode)>`; reject if missing/used;
   **consume** it with a conditional `UpdateItem` (sets `usedAt`).
3. `AdminSetUserMFAPreference` → disable software-token MFA; set profile `mfaEnabled = false`.
4. Respond "MFA reset — sign in with your password, then you'll be asked to set up MFA again."
   On next sign-in there's no TOTP challenge; the enforcement gate then forces re-enrollment.

Linked from the sign-in TOTP screen. Rate-limit / generic-error to avoid user enumeration.

### Admin controls (M3 admin panel)

- **Per-user** (`packages/application/app/(admin)/admin/members` + a new
  `PATCH /api/admin/users/[sub]/mfa`): a `mfaRequired` toggle, a **"Reset MFA"** action
  (`AdminSetUserMFAPreference` disable + clear profile `mfaEnabled`/grace → forces re-enroll), and
  an **MFA status column** (Required? / Enrolled? / In grace until …).
- **Per-group** (group settings + `PATCH /api/admin/groups/[groupId]/mfa`): a `mfaRequired`
  toggle on the group `#META`.

### Infra / secrets

No new table, GSI, or `sst.Secret`. New IAM actions only (listed above). No Bedrock. No SNS.

## Sub-issues — dependency waves

### Phase M29.1 · Foundation (Wave 1 — parallel)

**M29.1.1 · (S) Infra — Cognito OPTIONAL TOTP + device tracking + IAM**
Enable `mfaConfiguration: OPTIONAL` + software-token MFA + user-opt-in device tracking in
`infra/auth.ts` (via `transform` if the SST component doesn't expose them); add the new Cognito
IAM actions in `infra/application.ts`. **Verify in-place update (no pool replacement) on a
`pr-<N>` stage.** DoD: `pr-<N>` deploys clean; `DescribeUserPool`/`GetUserPoolMfaConfig` show
OPTIONAL + software token + device config; no pool replacement in the SST diff.

**M29.1.2 · (M) Core data model — profile + group + key builders**
Add the profile MFA fields + update helpers (`setMfaEnabled`, `setMfaRequired`, `stampGrace`,
`clearGrace`); add group `mfaRequired` + `anyGroupRequiresMfa(groupIds)`; add `mfaKeys`
backup-code item builders in `keys.ts`. DoD: typecheck green; helpers covered by the M29.1.4 test.

**M29.1.3 · (S) Core pure logic + unit tests**
`mfa-policy.ts` (`computeMfaState` + `MFA_GRACE_PERIOD_DAYS`) and `mfa-backup-codes.ts`
(generate N codes + sha256 hash). Unit tests cover: not-required → ok+clear; required+enrolled →
ok+clear; required+unenrolled+no-stamp → stamp+grace; within deadline → grace; past deadline →
blocked; backup-code format + hash determinism + uniqueness. DoD: `test:unit` green.

**M29.1.4 · (S) Dynalite integration test — backup codes + group flag**
Real write→read: write N `MFACODE#` items, consume one (conditional update sets `usedAt`),
re-consume fails; a group meta with `mfaRequired:true` is read by `anyGroupRequiresMfa`. DoD:
`test:integration` green.

### Phase M29.2 · Sign-in TOTP challenge (depends on M29.1.1)

**M29.2.1 · (M) `confirmSignIn` TOTP step + code-entry UI**
Un-stub the TOTP branch in `auth-next-step.ts`; render the 6-digit entry screen; call
`confirmSignIn`. (Trust-device opt-in + backup-code link are wired in M29.4 / M29.6.) DoD: an
enrolled user can complete sign-in with a TOTP code; wrong code shows an inline error; browser UI
test of the challenge step.

**M29.2.2 · (XS) Unit tests — next-step mapper**
Cover the TOTP next-step mapping (and that other steps are unchanged). DoD: `test:unit` green.

### Phase M29.3 · Enrollment & management UI (depends on M29.1, M29.2)

**M29.3.1 · (M) Enroll flow + `POST /api/account/mfa/enroll`**
`setUpTOTP` → QR + secret → `verifyTOTPSetup` → `updateMFAPreference`; route persists
`mfaEnabled`, clears grace, mints + stores hashed backup codes, returns plaintext once. DoD:
a user enrolls end-to-end; `mfaEnabled` true; backup codes shown once; browser UI test.

**M29.3.2 · (M) Backup-code display/regenerate + disable-MFA management**
Show-once + download UI; `POST /api/account/mfa/backup-codes/regenerate` (delete old + mint new);
disable MFA only when effective requirement is false. DoD: regenerate invalidates old codes;
disable blocked when required (clear inline reason); browser UI test.

**M29.3.3 · (S) Account-page MFA card**
Add an MFA card to `/account` (status + link to `/account/mfa`). DoD: card reflects
enabled/required/grace state; browser UI test.

### Phase M29.4 · Remembered devices (depends on M29.2, M29.3)

**M29.4.1 · (M) "Trust this device" opt-in + trusted-device list**
Add the "Trust this device for 30 days" opt-in to the TOTP challenge screen (passed to
`confirmSignIn`); add a trusted-device list (`fetchDevices` / `forgetDevice`) in `/account/mfa`.
DoD: a trusted device skips the TOTP prompt on next sign-in; forgetting it restores the prompt;
browser UI test (or a documented manual check if device-trust can't be exercised offline).

**M29.4.2 · (S) Trusted-device management polish + tests**
Device labels (last-used / name), confirm-before-forget, empty state. DoD: list renders + forget
works; unit test for any device-list formatting logic.

### Phase M29.5 · Enforcement gate (depends on M29.1, M29.3)

**M29.5.1 · (M) Authed-layout gate — grace nag vs hard block**
Server-side `computeMfaState` in the authed shell; persist grace stamp/clear; allowlist
`/account/mfa` + sign-out; redirect when blocked. DoD: a required+unenrolled user sees the nag in
grace and is redirected to `/account/mfa` after the deadline; an enrolled or not-required user is
unaffected; browser UI test across all three states (mock clock for deadline).

**M29.5.2 · (S) Nag banner component**
Deadline countdown + "Set up MFA" CTA. DoD: renders with correct remaining days; dismiss is
session-only (re-appears next navigation); unit test for the countdown formatter.

### Phase M29.6 · Self-service recovery (depends on M29.1, M29.2, M29.3)

**M29.6.1 · (M) `POST /api/auth/mfa/recover` (unauthenticated reset)**
Verify password (AdminInitiateAuth) + consume backup code + `AdminSetUserMFAPreference` disable +
clear profile `mfaEnabled`. Generic errors (no enumeration); basic rate-limit. DoD: a valid
username+password+unused-code resets MFA; used/invalid code rejected; integration/unit test of the
consume + disable logic.

**M29.6.2 · (S) "Use a backup code" recovery page**
Page + link from the TOTP challenge screen; on success, instruct to sign in again. DoD: flow
reaches re-enrollment; browser UI test.

### Phase M29.7 · Admin controls (depends on M29.1; UI builds on M3 admin panel)

**M29.7.1 · (M) Per-user — toggle + reset + status column**
`PATCH /api/admin/users/[sub]/mfa` (toggle `mfaRequired`; "Reset MFA" =
`AdminSetUserMFAPreference` disable + clear flags); members-roster MFA status column + controls.
DoD: admin can require/un-require + reset a user; status column shows Required/Enrolled/grace;
403 for non-admins; integration test for the toggle write→read; browser UI test.

**M29.7.2 · (M) Per-group — `mfaRequired` toggle**
`PATCH /api/admin/groups/[groupId]/mfa` + the group-settings toggle; the user's effective
requirement reflects it via `anyGroupRequiresMfa`. DoD: setting a group required makes its members
required (verified by the gate); integration test for the meta write→read; browser UI test.

**M29.7.3 · (S) Admin integration tests**
Round-trip tests for per-user + per-group toggles and that the calculator sees them. DoD:
`test:integration` green.

## Milestone acceptance criteria (DoD)

- CI green: lint, typecheck, `test:unit`, `test:integration`; deploys clean to `pr-<N>` with the
  Cognito pool updated **in place** (OPTIONAL + software token + device tracking; no replacement).
- An enrolled user signs in with a TOTP code; a not-enrolled user signs in normally.
- A user can self-enroll TOTP at `/account/mfa`, receives one-time backup codes, and can
  regenerate them; a trusted device skips the prompt for ~30 days.
- A required user (per-user flag **or** group `mfaRequired`) who hasn't enrolled sees the grace
  nag, then is hard-blocked to `/account/mfa` after the deadline (default 7 days); an enrolled or
  not-required user is unaffected.
- A user who lost their authenticator recovers self-service with a backup code (or an admin
  "Reset MFA"), then is forced to re-enroll.
- Admins can require/un-require MFA per user and per group and reset a user's MFA, with an MFA
  status column on the roster; all admin routes are 403 for non-admins.
- All new keys use `keys.ts` builders (no inline `pk`/`sk`); new pure logic has unit tests; new
  access patterns have dynalite integration tests; new UI has browser tests.
- No new `sst.Secret`, table, or GSI; only the documented new Cognito IAM actions.

## Risks / open questions

- **SST exposure of MFA/device config.** `sst.aws.CognitoUserPool` may not surface
  `mfaConfiguration` / `softwareTokenMfaConfiguration` / `deviceConfiguration`; expect to use a
  `transform` onto the underlying Pulumi resource. Resolve in M29.1.1.
- **In-place pool update.** OFF → OPTIONAL must not replace the pool (would orphan all users).
  Verify the SST diff on a `pr-<N>` stage before merging M29.1.
- **Backup code can't satisfy Cognito's challenge.** Codes power a *reset* path, not a direct
  challenge response — designed accordingly (M29.6). Don't let an implementer wire a code into
  `confirmSignIn`.
- **Grace clock from group membership.** The effective requirement can flip on group changes; the
  grace stamp is idempotent (stamped once while required+unenrolled, cleared when requirement
  drops or on enroll), computed by the gate — keep that logic only in `computeMfaState`.
- **Offline test coverage for remembered devices.** Device trust may be hard to exercise in the
  offline `cognito-local` harness; if so, cover the wiring with a unit/UI test and document a
  manual `pr-<N>` check rather than claiming an offline E2E.
- **Self-enrollment hot-path cache (`mfaEnabled`).** Cognito is the source of truth; the cached
  flag can drift if a reset path forgets to clear it — every disable/reset MUST clear it.
- **User enumeration on recovery.** `/api/auth/mfa/recover` must return generic errors and be
  rate-limited.

## Manual test plan

Test on the deployed `pr-<N>` stage:

1. **Enroll TOTP.** `/account/mfa` → scan QR in an authenticator → enter code → success; backup
   codes shown once; download them.
2. **Sign-in challenge.** Sign out, sign in → prompted for a TOTP code → wrong code errors →
   correct code signs in.
3. **Trust this device.** On the TOTP screen tick "Trust this device for 30 days", sign in; sign
   out + back in → **no** TOTP prompt. Forget the device in `/account/mfa` → prompt returns.
4. **Per-user requirement + grace.** As admin, require MFA for a *non-enrolled* test user. As that
   user, sign in → see the grace nag, app still usable. (Use a short grace or the admin reset to
   exercise the deadline.) After the deadline → redirected to `/account/mfa` and blocked until
   enrolled.
5. **Group requirement.** Mark a group `mfaRequired`; a non-enrolled member sees the same
   grace→block behavior; removing the flag (and the user not otherwise required) clears it.
6. **Backup-code recovery.** Sign out; at the TOTP screen click "Use a backup code"; enter
   username + password + a backup code → "MFA reset"; sign in with password only → forced to
   re-enroll.
7. **Regenerate codes.** In `/account/mfa` regenerate backup codes → an old code no longer works
   for recovery; a new one does.
8. **Admin reset.** As admin, "Reset MFA" on an enrolled user → that user signs in with password
   only and is forced to re-enroll.
9. **Disable when allowed.** A not-required enrolled user can disable MFA from `/account/mfa`; a
   required user cannot (the control explains why).
10. **Non-admin lockout.** A member hitting the admin MFA routes gets 403.
