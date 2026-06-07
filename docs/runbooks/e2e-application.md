# E2E: Authed Application Suite

The authed application E2E suite (`e2e/application/`) drives the Next.js app at port 3002 through real browser interactions in a fully offline environment — no AWS connectivity required.

## How it works

The Playwright `globalSetup` (`e2e/application/global-setup.ts`) boots all services before any test runs:

1. **dynalite** (port 4570) — in-memory DynamoDB with the `UserData` table
2. **cognito-local** (port 9229) — local Cognito emulator; a test user pool, app client, and confirmed user are created programmatically
3. **next dev** (port 3002) — the application server, launched with env vars pointing at both dynalite and cognito-local

The Playwright config (`playwright.application.config.ts`) has **no `webServer` block** — all startup is handled in `globalSetup`, which also returns a teardown function that kills the child processes and closes dynalite after the run.

JWT verification in offline mode uses `jose` with a HTTP JWKS URI (cognito-local exposes its public key over plain HTTP). The `COGNITO_JWKS_URI` env var switches `packages/application/lib/verify-id-token.ts` from the production `CognitoJwtVerifier` (requires HTTPS) to a `jose` + `createRemoteJWKSet` verifier that works over HTTP.

## Running locally

1. Install Playwright browsers once (not committed):
   ```
   npx playwright install chromium
   ```

2. Run the suite from the repo root:
   ```
   npm run test:e2e:application
   ```

No AWS credentials, no `.env` file, and no additional setup are required — `global-setup.ts` creates the user pool and test user at runtime.

## CI gate — opt-in via `[E2E]` tag

The suite is opt-in in CI. It runs only on pushes to `master` whose **head commit message contains the literal string `[E2E]`**. It never runs on PR branches. When triggered, it blocks the production deploy if any test fails.

To trigger it, include `[E2E]` anywhere in the squash/merge commit message:
```
feat(application): add dashboard widget [E2E]
```

## Required GitHub Actions secrets

These secrets are read by the CI job that runs the authed E2E suite:

| Secret | Description |
|--------|-------------|
| `COGNITO_TEST_USERNAME` | Username (typically an email) of the seeded test user. When running against `cognito-local` any value works — it is created at setup time. Must match a confirmed user in the pool if pointing at a real dev/test pool instead. |
| `COGNITO_TEST_PASSWORD` | Password for the test user. Same rules: arbitrary when using `cognito-local`; must be valid if using a real pool. **Never a production user.** |
| `COGNITO_TEST_USER_POOL_ID` | _(Optional)_ User pool ID to use instead of `cognito-local`. Omit when running fully offline. |
| `COGNITO_TEST_CLIENT_ID` | _(Optional)_ App client ID paired with `COGNITO_TEST_USER_POOL_ID`. Omit when running fully offline. |

When running fully offline (the default), `COGNITO_TEST_USERNAME` and `COGNITO_TEST_PASSWORD` can be any valid email / password — the global setup creates the user pool and confirms the user with those credentials each run.

## Defaults

If `COGNITO_TEST_USERNAME` / `COGNITO_TEST_PASSWORD` are not set, the suite falls back to:
- Username: `e2e-user@example.com`
- Password: `Test1234!Password`
