# Production launch runbook — Resend domain + DNS cutover (M10.3.2)

The steps here are **operational** — they require Cloudflare, Resend, and AWS
(SST deploy) credentials and are executed by a human operator, not in CI. They are
the last gate before `transformmynotes.com` / `app.transformmynotes.com` go live.

> Source of truth for the architectural decisions behind these steps:
> [`docs/milestones/M10.md`](../milestones/M10.md) → "Architecture & decisions"
> (Production DNS cutover sequence) and the Manual test plan. This runbook is the
> executable checklist; M10.md is the rationale.

Prerequisite: a deployed `production` stage is what creates the ACM cert + the
CloudFront distributions, so the deploy and the DNS steps are interleaved (the
ordering below matters — getting it wrong stalls ACM validation).

---

## Step 1 — Resend sending domain

Goal: send invite/transactional email from `noreply@transformmynotes.com` instead
of a Resend test address.

1. In the Resend dashboard, add `transformmynotes.com` as a sending domain. Resend
   shows the DNS records to add (an SPF/MX `send.` record + a DKIM `resend._domainkey`
   TXT record; the exact host/values are Resend-generated).
2. Add those records to the `transformmynotes.com` **Cloudflare** zone, **DNS-only
   (grey cloud)**:
   - SPF (TXT): `v=spf1 include:amazonses.com ~all`
   - DKIM (TXT): the `resend._domainkey` value Resend provides.
3. Wait for Resend to show the domain as **Verified** (usually a few minutes).
4. Set the from-address secret in **both** SST Console environments (production +
   the fallback env used by `pr-<N>`):
   - `CONTACT_FROM_ADDRESS = noreply@transformmynotes.com`
     (the contact/invite from-address secret — confirm the exact secret name in
     `infra/secrets.ts` before seeding; seed the real value, never an empty fallback).

Verify: send a test message (admin invite or contact form) and confirm an email
arrives from `noreply@transformmynotes.com` within ~2 minutes.

---

## Step 2 — Cognito Hosted UI custom domain (code change, DNS-gated)

> **Decision / status:** NOT applied in code yet — deliberately. The app signs in via
> **AWS Amplify Auth against custom `/login`/`/signup` pages**, not the Cognito Hosted
> UI, so `auth.transformmynotes.com` is not on the critical sign-in path. Setting a
> custom Hosted-UI domain is also **destructive to change later** (Cognito requires
> deleting+recreating the user pool to change it — see M10.md "Risks"), so it must be
> locked in *before any production users exist*, and only once the DNS + ACM cert for
> `auth.transformmynotes.com` are confirmed. `infra/auth.ts` carries a `TODO(prod)`
> marking exactly where this goes.

When you do want it (before first prod user): in `infra/auth.ts`, add a
`userPool.addDomain(...)` for `auth.${WEB_DOMAIN}` gated on `isProd`
(`$app.stage === "production"`). Ephemeral stages keep the default Cognito domain.
This needs an ACM cert in `us-east-1` for `auth.transformmynotes.com` and the
matching Cloudflare record kept **DNS-only permanently** (Cloudflare free Universal
SSL does not cover second-level wildcards). Deploy `production`, then point the
`auth.` record at the Cognito domain target.

---

## Step 3 — Production DNS cutover (order matters to avoid ACM timeout)

1. In Cloudflare, set the records for `transformmynotes.com`, `app.transformmynotes.com`,
   and `auth.transformmynotes.com` to **DNS-only (grey cloud / proxy disabled)**. ACM
   cannot complete its challenge through Cloudflare's proxy.
2. Tear down any open ephemeral `pr-<N>` stages first so a stale CloudFront
   distribution doesn't claim the ACM cert: `npx sst remove --stage pr-<N>` for each.
3. Set `WEB_DOMAIN=transformmynotes.com` in the **production** Console environment.
4. Deploy: `npx sst deploy --stage production`. SST creates the ACM certificate and
   triggers DNS validation.
5. Add the ACM CNAME validation records SST surfaces into Cloudflare (**DNS-only**).
   Wait for ACM to reach **ISSUED** (typically 2–5 min; first issuance can take up to
   ~30 min — keep old records until issued to avoid downtime).
6. Confirm the CloudFront distributions are **Deployed/active**. Point the apex and
   subdomain CNAME/ALIAS records at the CloudFront domains from the deploy output
   ("Surface deployment URLs" in the run, or `npx sst deploy` stdout).
7. Re-enable the Cloudflare proxy (**orange cloud**) on `transformmynotes.com` and
   `app.transformmynotes.com` once ACM is issued and CloudFront is serving. Keep
   `auth.transformmynotes.com` **DNS-only permanently**.
8. Verify HTTPS in a browser on all three domains.

---

## Acceptance checks (issue #113)

- `https://transformmynotes.com` serves marketing over HTTPS; cert issued by AWS ACM
  (browser DevTools → Security).
- `curl -I https://transformmynotes.com` → `HTTP/2 200` and `server: CloudFront`.
- `https://app.transformmynotes.com` serves the application; sign-in completes.
- Contact-form / invite email is delivered from `noreply@transformmynotes.com`.
- Resend dashboard shows `transformmynotes.com` as **Verified**.

See the full post-deploy smoke test in [`docs/milestones/M10.md`](../milestones/M10.md)
→ "Manual test plan".
