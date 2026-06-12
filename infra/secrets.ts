/// <reference path="../.sst/platform/config.d.ts" />

// Seeded per-stage via the SST Console (production env + the fallback env that
// covers pr-<N>). No empty/placeholder fallbacks — a missing value fails loudly
// at deploy when its .value is accessed (WEB_DOMAIN is used for the production
// custom domain only). App-specific secrets (e.g. transactional email) are added
// in the milestone that introduces the feature that consumes them.
export const webDomain = new sst.Secret("WEB_DOMAIN");

export const bedrockInferenceProfileId = new sst.Secret("BEDROCK_MODEL_ID");

// M3 transactional email (Resend).
export const resendApiKey = new sst.Secret("RESEND_API_KEY");
export const inviteFromAddress = new sst.Secret("INVITE_FROM_ADDRESS");

// M11 Cloudflare Turnstile bot protection. Seeded in both Console environments
// (production = live keys; fallback/pr-<N> = Cloudflare documented test keys).
// TURNSTILE_SITE_KEY is exposed publicly as NEXT_PUBLIC_TURNSTILE_SITE_KEY; the
// secret value is read server-side only in packages/application/lib/turnstile.ts.
export const turnstileSiteKey = new sst.Secret("TURNSTILE_SITE_KEY");
export const turnstileSecretKey = new sst.Secret("TURNSTILE_SECRET_KEY");

// Issue #460 — shared development Cognito pool. PR stages (pr-<N>) reference an
// existing centralized dev user pool by id instead of provisioning their own,
// so test users persist across PRs and pools don't churn. Seeded in the FALLBACK
// Console environment (which covers all pr-<N> stages) with the id of the pool
// owned by the long-lived `dev` stage. Unset/unused for production (which owns
// its own pool) — its `.value` is only accessed on the pr-<N> code path, and a
// missing value fails loudly at deploy on that path (no empty fallback).
export const devCognitoUserPoolId = new sst.Secret("DEV_COGNITO_USER_POOL_ID");
