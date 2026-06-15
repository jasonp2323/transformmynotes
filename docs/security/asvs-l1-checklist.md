# OWASP ASVS Level 1 + OWASP Top 10 2021 — Self-Audit Checklist

## Purpose

This document maps OWASP Application Security Verification Standard (ASVS) Level 1 verification requirements and the OWASP Top 10 2021 categories to the specific files and mechanisms in the TransformMyNotes codebase that satisfy them. It is the capstone of the M11 Security Hardening milestone: by the time this file is committed, every M11 control is implemented, so there are zero unaddressed gaps.

ASVS Level 1 is the minimum baseline recommended for all applications. It is opportunistically verifiable — each control can be confirmed by an external tester without access to source code or the development team. This checklist is a living document: update it as new controls are implemented or as the codebase evolves.

**Out of scope for M11 (deferred):** Multi-factor authentication (MFA) is the single highest-priority hardening control not addressed in this milestone. Enabling TOTP or SMS MFA on the Cognito user pool requires changes to the Amplify `signIn` flow (TOTP challenge step), the proxy session flow, and the E2E `InitiateAuth` recipe. This is planned for a dedicated future milestone. See `docs/milestones/M11.md` — "Out of scope" and "Risks / MFA deferral".

---

## Column key

| Column | Meaning |
|---|---|
| **ASVS Control** | ASVS 4.0 control identifier in `Vx.y.z` form, or category where sub-requirements are collectively satisfied. |
| **Description** | Brief statement of what the control requires. |
| **Status** | `Implemented` — control is in place. `Implemented (Report-Only; enforcing flip pending clean monitoring)` — partially in place with a documented next step. |
| **File / Mechanism** | The file(s) or mechanism where this is enforced, with the specific function or directive. |

---

## V1 — Architecture, Design and Threat Modelling

| ASVS Control | Description | Status | File / Mechanism |
|---|---|---|---|
| V1.1 — Secure SDLC | Security requirements exist and are referenced in design documents. | Implemented | `docs/milestones/M11.md` documents the full M11 threat model, pillar-by-pillar mitigations, risks, and acceptance criteria; issues tracked on the GitHub Project board. |
| V1.2 — Authentication architecture | Authentication is centralised; components are not bypassed. | Implemented | `packages/application/proxy.ts` (`middleware`) is the single edge gate; all protected routes pass through JWT verification before reaching any handler. |
| V1.4 — Access control architecture | Access control is enforced server-side; clients are not trusted. | Implemented | `packages/application/proxy.ts` (`middleware`) enforces JWT verification and group-based admin gate server-side at the edge. `packages/application/lib/require-user.ts` (`requireActiveUser`) re-verifies token and profile status in Node runtime layouts. |
| V1.5 — Input validation architecture | Input validation is performed server-side; client-side validation is supplementary. | Implemented | All route handlers in `packages/application/app/api/**` validate request bodies server-side with Zod schemas from `packages/application/lib/auth-schemas.ts` before any business logic. |
| V1.6 — Cryptographic architecture | No hardcoded secrets; secrets managed externally. | Implemented | `infra/secrets.ts` — `turnstileSiteKey`, `turnstileSecretKey`, `resendApiKey`, `inviteFromAddress`, `bedrockInferenceProfileId` declared as `sst.Secret` with no empty fallbacks; values stored in AWS SSM Parameter Store, seeded via SST Console. `TURNSTILE_SECRET_KEY` consumed server-side only in `packages/application/lib/turnstile.ts` (`verifyTurnstile`). Per-user credentials are KMS-encrypted in DynamoDB, never a project-level secret. |
| V1.9 — Communications architecture | TLS is enforced for all communications. | Implemented | TLS enforced by CloudFront via ACM certificate (`infra/router.ts`); `Strict-Transport-Security` header set in both `packages/application/next.config.mjs` and `packages/marketing/next.config.mjs`. |
| V1.10 — Malicious software | Mechanisms exist to detect and prevent malicious code in the supply chain. | Implemented | `.github/workflows/codeql.yml` — CodeQL SAST on every PR + push to `master` + weekly schedule. `.github/dependabot.yml` — Dependabot for `npm` and `github-actions` ecosystems. GitHub secret scanning + push protection enabled (see `docs/security/secret-scanning.md`). |

---

## V2 — Authentication

| ASVS Control | Description | Status | File / Mechanism |
|---|---|---|---|
| V2.1.1 — Password length | Passwords of at least 12 characters are permitted. | Implemented | Cognito user pool (`infra/auth.ts`) enforces password policy; invite-redeem Zod schema (`inviteRedeemBodySchema` in `packages/application/lib/auth-schemas.ts`) enforces `password: z.string().min(8)` at the API layer as the minimum floor. |
| V2.1.12 — No credential leakage | Authentication credentials are not logged or returned in responses. | Implemented | `packages/application/app/api/auth/login/route.ts` — Cognito errors (`UserNotFoundException`, `NotAuthorizedException`) are mapped to a uniform `{ error: 'Invalid email or password.' }` 401; no Cognito error detail reaches the response body. `console.error` is used for unexpected errors (CloudWatch only). |
| V2.2 — Authenticator security | A bot-protection mechanism is applied to authentication endpoints. | Implemented | Cloudflare Turnstile widget (`packages/application/src/components/auth/TurnstileWidget.tsx`) on login, forgot-password, reset-password, invite-redeem, and request-access pages. Server-side verification via `packages/application/lib/turnstile.ts` (`verifyTurnstile`) — called before any Cognito operation; throws `TurnstileError` on failure; route handler returns `400` with a generic bot-check message. |
| V2.5.1 — Credential recovery — no hints | Forgot-password responses do not leak whether an email exists. | Implemented | `packages/application/app/api/auth/forgot-password/route.ts` — Cognito `ForgotPassword` errors are swallowed entirely (`console.error` for observability, never surfaced); the route always returns `{ ok: true }` regardless of whether the email exists. |
| V2.5.2 — No default credentials | No default credentials exist; invite-only registration enforces admin creation. | Implemented | `infra/auth.ts` (`createOwnedPool`) — `adminCreateUserConfig: { allowAdminCreateUserOnly: true }` prevents self-registration; all users are created via the admin invite flow (`packages/application/app/api/auth/invite/redeem/route.ts`). |
| V2.7 — Credential reset | Password reset is rate-limited and verified server-side. | Implemented | `packages/application/app/api/auth/forgot-password/route.ts` and `reset-password/route.ts` — both call `enforceRateLimit('forgot-password', ip, 5, 60)` via `packages/application/lib/rate-limit.ts` and require a valid Turnstile token before any Cognito call. |
| V2.8 — One-time verifier | Rate limiting and bot protection are applied to one-time-verifier endpoints (invite redemption). | Implemented | `packages/application/app/api/auth/invite/redeem/route.ts` — both in-memory (`rateLimit`) and DynamoDB-backed (`enforceRateLimit('invite-redeem', ip, 5, 60)`) rate limiting, plus `verifyTurnstile(turnstileToken)`, are enforced before any invite lookup or Cognito `AdminCreateUser` call. |

---

## V3 — Session Management

| ASVS Control | Description | Status | File / Mechanism |
|---|---|---|---|
| V3.2.1 — Server-generated tokens | Session tokens are generated server-side by a trusted party. | Implemented | Cognito ID tokens are generated and signed by AWS Cognito; the session cookie is set server-side only. |
| V3.2.3 — HttpOnly session cookies | Session cookie carries `HttpOnly` attribute. | Implemented | `packages/application/app/api/auth/login/route.ts` — `res.cookies.set('CognitoIdToken', ..., { httpOnly: true, ... })`. `packages/application/app/api/auth/set-session/route.ts` — same attributes. Cookie is never set by client-side JavaScript. |
| V3.3.1 — Session timeout | Session tokens expire (Cognito ID token has a bounded lifetime). | Implemented | Cognito ID tokens expire per the user pool's token validity settings (default 60 minutes); the cookie is not explicitly long-lived; expiry is enforced by `aws-jwt-verify` in `packages/application/lib/verify-id-token.ts` (`verifyIdToken`). |
| V3.4.1 — Cookie security attributes | Session cookie carries `Secure` and `SameSite=Lax` attributes. | Implemented | `packages/application/app/api/auth/login/route.ts` — `{ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }`. Same attributes in `set-session/route.ts`. |
| V3.5 — Token-based session management | JWT signature is verified on every request; expired/invalid tokens are rejected. | Implemented | `packages/application/proxy.ts` (`middleware`) calls `verifyIdToken(token)` via `packages/application/lib/verify-id-token.ts` (`CognitoJwtVerifier` from `aws-jwt-verify`); invalid tokens redirect to `/login`. |
| V3.6 — Federated session management | Sign-out clears the session token. | Implemented | `packages/application/app/api/auth/sign-out/route.ts` — sets `CognitoIdToken` cookie to `''` with `maxAge: 0`, effectively deleting it. |

---

## V4 — Access Control

| ASVS Control | Description | Status | File / Mechanism |
|---|---|---|---|
| V4.1.1 — Deny by default | All routes deny access unless explicitly permitted; unauthenticated requests are rejected. | Implemented | `packages/application/proxy.ts` (`middleware`) — redirects to `/login` if `CognitoIdToken` cookie is absent or token verification fails. All `app/(app)/` routes are protected by this middleware. |
| V4.1.2 — Attribute-based access control | Admin-only routes are gated by a verified claim from the token. | Implemented | `packages/application/lib/auth-gate.ts` (`isAdmin`, `isAdminRoute`) — `cognito:groups` claim checked for `'admin'` membership; admin routes return 302 to `/dashboard?forbidden=1` if the claim is absent. Logic enforced in `packages/application/proxy.ts`. |
| V4.1.3 — User-enforced data isolation | User data is scoped by the Cognito `sub` claim from the verified token. | Implemented | DynamoDB access patterns in `packages/core/src/db/keys.ts` key all user records on `USER#<sub>`; the `sub` is always sourced from the verified JWT (never from client input). `packages/application/lib/require-user.ts` (`requireActiveUser`) extracts the `sub` from verified claims. |
| V4.2.1 — Trusted service layer | All access-control decisions are made server-side. | Implemented | No resource access or privilege check occurs client-side; all data operations go through server route handlers or Server Components that verify the JWT and inspect claims first. |
| V4.3 — Account status gate | Disabled users are blocked even with a valid token. | Implemented | `packages/application/lib/require-user.ts` (`requireActiveUser`) loads the `UserData` profile and calls `gateDecision(profile?.status)` — status `'disabled'` redirects to `/login`. |

---

## V5 — Validation, Sanitisation and Encoding

| ASVS Control | Description | Status | File / Mechanism |
|---|---|---|---|
| V5.1.1 — HTTP parameter pollution | Route handlers validate the full request body; unexpected fields are rejected. | Implemented | Zod `z.object(...)` schemas in `packages/application/lib/auth-schemas.ts` strip unknown keys by default (`stripUnknown` behaviour); `safeParse` failures return a generic `400`. |
| V5.1.2 — HTTP parameter binding | Request bodies are validated against a strict schema before any business logic. | Implemented | All auth route handlers (`login`, `forgot-password`, `reset-password`, `set-session`, `invite/redeem`, `request-access`) call `<schema>.safeParse(body)` as the first operation after JSON parsing; parse failures return `{ error: 'Invalid request.' }` 400. |
| V5.1.3 — Input validation — type and range | Inputs are validated for type, format, and minimum/maximum length. | Implemented | `loginBodySchema` — `email: z.string().email()`, `password: z.string().min(1)`, `turnstileToken: z.string().min(1)`. `inviteRedeemBodySchema` — `password: z.string().min(8)`, `email: z.string().trim().email()`. All defined in `packages/application/lib/auth-schemas.ts`. |
| V5.2.1 — Sanitisation | User-supplied strings are not rendered into HTML without sanitisation; no `dangerouslySetInnerHTML` with unsanitised input. | Implemented | No `dangerouslySetInnerHTML` usage in auth or dashboard components. All user-visible strings are rendered via React's default JSX escaping. |
| V5.3.3 — Output encoding — SQL | No SQL is used; DynamoDB expressions use parameterised `ExpressionAttributeValues` throughout. | Implemented | All DynamoDB writes and queries in `packages/core/src/db/` use the AWS SDK `DocumentClient` with `ExpressionAttributeValues` — no string interpolation into condition expressions. |
| V5.5.1 — Sensitive data in URLs | Sensitive data (tokens, codes) is transmitted in request bodies, not URL query strings. | Implemented | Invite codes and Turnstile tokens are submitted as POST body fields. Session tokens are set as `HttpOnly` cookies by the server, never in URLs. |

---

## V7 — Error Handling and Logging

| ASVS Control | Description | Status | File / Mechanism |
|---|---|---|---|
| V7.1.1 — No sensitive data in logs | Logs do not contain credentials, session tokens, or PII beyond what is needed for debugging. | Implemented | Route handlers log via `console.error('[route] ...')` with the error object only; request bodies (containing passwords or tokens) are never logged. CloudWatch receives the console output. |
| V7.1.2 — No sensitive data in error responses | Error responses to clients never include stack traces, Cognito error names, Zod paths, or internal details. | Implemented | All route handlers return only generic messages (`'Invalid request.'`, `'Something went wrong. Please try again.'`, `'Bot check failed. Please try again.'`, `'Invalid email or password.'`) — confirmed in `packages/application/app/api/auth/login/route.ts`, `forgot-password/route.ts`, `invite/redeem/route.ts`, and `set-session/route.ts`. Raw `err.message` and `err.name` are never included in response bodies. |
| V7.2.1 — Minimal information disclosure | HTTP error responses are generic; they do not distinguish "email not found" from "wrong password". | Implemented | `packages/application/app/api/auth/login/route.ts` — `AUTH_FAILURE_NAMES` set includes `UserNotFoundException` and `NotAuthorizedException`; both return an identical `{ error: 'Invalid email or password.' }` 401. `forgot-password/route.ts` swallows all Cognito errors and always returns `{ ok: true }`. |
| V7.4.1 — Error handling — catch-all | Every route handler wraps business logic in a `try/catch`; unexpected errors produce a generic 500 and are logged server-side. | Implemented | Every route handler in `packages/application/app/api/auth/**` has a top-level `try/catch` that calls `console.error(...)` and returns `{ error: 'Something went wrong. Please try again.' }` with status 500. Verified in `login/route.ts`, `forgot-password/route.ts`, `invite/redeem/route.ts`, `set-session/route.ts`. |

---

## V9 — Communication

| ASVS Control | Description | Status | File / Mechanism |
|---|---|---|---|
| V9.1.1 — TLS everywhere | All connections use TLS; HTTP is not served. | Implemented | CloudFront distribution with ACM certificate (`infra/router.ts`) terminates TLS; HTTP requests are redirected to HTTPS by CloudFront default behaviour. |
| V9.1.2 — HSTS | `Strict-Transport-Security` header is set with a long `max-age` and `includeSubDomains`. | Implemented | `packages/application/next.config.mjs` and `packages/marketing/next.config.mjs` — `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` on all routes via `headers()`. |
| V9.1.3 — Current TLS protocols | Only current TLS protocol versions and cipher suites are used. | Implemented | Enforced by CloudFront's managed security policies (TLSv1.2 minimum); no application-level TLS configuration is required or overridden. |
| V9.2.2 — Clickjacking protection | `X-Frame-Options` prevents the app from being embedded in a frame on another origin. | Implemented | `packages/application/next.config.mjs` and `packages/marketing/next.config.mjs` — `X-Frame-Options: DENY`. Additionally, CSP `frame-ancestors 'none'` provides belt-and-suspenders coverage for modern browsers. |
| V9.2.3 — Content type sniffing protection | `X-Content-Type-Options: nosniff` prevents MIME-type sniffing. | Implemented | `packages/application/next.config.mjs` and `packages/marketing/next.config.mjs` — `X-Content-Type-Options: nosniff` on all routes. |
| V9.2.4 — Content Security Policy | A CSP restricts the origins from which scripts, styles, frames, and connections are allowed. | Implemented (Report-Only; enforcing flip pending clean monitoring) | `packages/application/next.config.mjs` — `Content-Security-Policy-Report-Only` with directives: `default-src 'self'`, `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com`, `connect-src 'self' https://cognito-idp.us-east-1.amazonaws.com ... https://challenges.cloudflare.com`, `frame-src https://challenges.cloudflare.com`, `frame-ancestors 'none'`, `object-src 'none'`. Currently report-only per M11.1.2 plan: switch to `Content-Security-Policy` (enforcing) after monitoring a clean pr-<N> deploy and replacing `'unsafe-inline'` with a per-request nonce. `packages/marketing/next.config.mjs` ships the same structure for the public site. |

---

## V10 — Malicious Code

| ASVS Control | Description | Status | File / Mechanism |
|---|---|---|---|
| V10.2.1 — Malicious code search | Source code is scanned for indicators of malicious code or unexpected behaviour. | Implemented | `.github/workflows/codeql.yml` — CodeQL SAST targeting `javascript-typescript`, triggered on every PR, on push to `master`, and on a weekly schedule (`cron: '0 2 * * 1'`). Results surface in the repo's Security tab → Code scanning alerts. |
| V10.3.1 — Dependency integrity | Third-party dependencies are verified and kept current. | Implemented | `.github/dependabot.yml` — Dependabot for `npm` (monorepo root, weekly, minor/patch grouped) and `github-actions` (weekly, minor/patch grouped); major bumps as individual PRs. `package-lock.json` at the root pins all dependency trees with integrity hashes verified by `npm ci` on every CI run. |
| V10.3.2 — Supply chain integrity — secrets | No credentials or secrets are committed to source code. | Implemented | GitHub secret scanning + push protection enabled on the repo (`docs/security/secret-scanning.md`). All secrets are `sst.Secret` entries stored in AWS SSM Parameter Store (`infra/secrets.ts`). Push protection blocks any future commit that matches a known secret pattern before it reaches the remote. |

---

## OWASP Top 10 2021

| Category | Description | Mitigation in this codebase |
|---|---|---|
| **A01 — Broken Access Control** | Failures that allow users to act outside their intended permissions. | `packages/application/proxy.ts` (`middleware`) — JWT verified on every request to protected routes; unauthenticated requests redirect to `/login`. `packages/application/lib/auth-gate.ts` (`isAdmin`, `isAdminRoute`) — admin routes additionally require `cognito:groups` claim containing `'admin'`. `packages/application/lib/require-user.ts` (`requireActiveUser`) — Node-runtime layouts re-verify the token, load the DynamoDB profile, and block `'disabled'` users. All data access keyed by `sub` from verified token (never from client input). |
| **A02 — Cryptographic Failures** | Sensitive data exposed in transit or at rest due to weak or absent encryption. | TLS enforced end-to-end via CloudFront + ACM (`infra/router.ts`). HSTS (`max-age=63072000; includeSubDomains; preload`) in `packages/application/next.config.mjs` and `packages/marketing/next.config.mjs`. Session cookie carries `Secure` attribute (set in `packages/application/app/api/auth/login/route.ts` and `set-session/route.ts`). No sensitive data stored client-side. Per-user credentials KMS-encrypted in DynamoDB. |
| **A03 — Injection** | Untrusted data sent to an interpreter (SQL, NoSQL, OS command, etc.). | No SQL used; all DynamoDB operations use AWS SDK `DocumentClient` with `ExpressionAttributeValues` — no string interpolation. All request inputs validated with Zod schemas in `packages/application/lib/auth-schemas.ts` before any downstream operation. React JSX escaping prevents XSS by default; no `dangerouslySetInnerHTML` with unsanitised input. |
| **A04 — Insecure Design** | Missing or ineffective security controls by design. | Defense-in-depth layering: IP-based DynamoDB rate limiting (`packages/application/lib/rate-limit.ts`) → Cloudflare Turnstile bot check (`packages/application/lib/turnstile.ts`) → Zod schema validation → Cognito authentication — each layer independently blocks abuse even if earlier layers are bypassed. Invite-only registration (`infra/auth.ts` — `allowAdminCreateUserOnly: true`) eliminates self-registration attack surface. Server-side invite re-validation in `packages/application/app/api/auth/invite/redeem/route.ts` — invite status re-checked from DynamoDB, never trusted from client state. |
| **A05 — Security Misconfiguration** | Insecure default configurations, unnecessary features, or missing hardening. | Security response headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, CSP) applied to all routes in both packages. No secrets with empty fallbacks (`infra/secrets.ts`). `infra/auth.ts` — `allowAdminCreateUserOnly: true` disables public self-registration. CodeQL + Dependabot flag misconfigurations and outdated dependencies continuously. |
| **A06 — Vulnerable and Outdated Components** | Use of components with known vulnerabilities or that are no longer maintained. | `.github/dependabot.yml` — Dependabot monitors `npm` and `github-actions` ecosystems weekly; minor/patch updates grouped into a single PR. `.github/workflows/codeql.yml` — CodeQL SAST scans all JavaScript/TypeScript on every PR and weekly to flag vulnerable patterns. `package-lock.json` pins all dependency trees; `npm ci` verifies integrity hashes on every CI run. |
| **A07 — Identification and Authentication Failures** | Broken or absent authentication, session management, or credential protection. | AWS Cognito user pool (`infra/auth.ts`) for credential storage and authentication. Server-side JWT verification via `aws-jwt-verify` (`packages/application/lib/verify-id-token.ts`). `HttpOnly; Secure; SameSite=Lax` session cookie (`packages/application/app/api/auth/login/route.ts`). Cloudflare Turnstile bot protection on all auth endpoints. DynamoDB-backed fixed-window rate limiting (10/60s login; 5/60s forgot-password/reset/invite-redeem) via `packages/application/lib/rate-limit.ts`. No email enumeration on login or forgot-password. Sign-out clears cookie server-side (`packages/application/app/api/auth/sign-out/route.ts`). |
| **A08 — Software and Data Integrity Failures** | Code and infrastructure that does not protect against integrity violations; insecure CI/CD pipelines. | GitHub secret scanning + push protection blocks credential injection before it reaches the repo (`docs/security/secret-scanning.md`). CodeQL SAST on every PR prevents malicious or vulnerable code from merging undetected. `npm ci` (not `npm install`) in CI verifies `package-lock.json` integrity. OIDC-based AWS authentication in CI (`deploy.yml`) — no long-lived AWS credentials stored in GitHub. |
| **A09 — Security Logging and Monitoring Failures** | Insufficient logging to detect, escalate, or investigate attacks. | All route handlers emit `console.error(...)` for unexpected errors and security-relevant events (rate-limit failures, Turnstile errors, Cognito errors), routed to AWS CloudWatch Logs by the Next.js Lambda function environment. Logs include route context (`[login]`, `[invite/redeem]`, etc.) but never include credentials or session tokens. DynamoDB rate-limit counters provide a persistent, per-IP request-count record for post-incident analysis. |
| **A10 — Server-Side Request Forgery (SSRF)** | The server fetches a remote resource using a URL supplied or influenced by the user. | Minimal external-fetch surface: the only outbound server-side `fetch` is the fixed, hardcoded Cloudflare Turnstile siteverify URL (`https://challenges.cloudflare.com/turnstile/v0/siteverify`) in `packages/application/lib/turnstile.ts` — no user-controlled URL or host is ever passed to `fetch`. No proxy, webhook delivery, or URL-redirect endpoints exist that would expose an SSRF surface. |

---

*Last updated: 2026-06-15 as part of M11.3.2 (#176). Update this document whenever a new route, external fetch, or security control is added to the codebase.*
