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

// M12 Android App Links — the release keystore's SHA-256 cert fingerprint(s),
// served at /.well-known/assetlinks.json. This is NOT an sst.Secret: the
// fingerprint is a PUBLIC value (it is literally published in assetlinks.json
// for the world to read), and — like DEV_COGNITO_USER_POOL_ID (#460) — a
// declared-but-unset sst.Secret throws SecretMissingError at deploy for EVERY
// stage because its .value Output resolves eagerly. Since the fingerprint does
// not even exist until the release keystore is created (Wave 3 / #382), making
// it a secret would block all deploys. Instead it is a plain env var read from
// a GitHub Actions repository variable (forwarded by deploy.yml), threaded into
// the app environment in infra/application.ts and read via process.env in the
// assetlinks route — which fails loudly at request time if unset.

// Issue #460 — the shared dev Cognito pool id is NOT an sst.Secret. A declared
// sst.Secret with no value throws SecretMissingError at deploy for EVERY stage
// (the value Output resolves eagerly, regardless of whether it's referenced),
// which would break production + the dev stage that owns the pool, and creates a
// chicken-and-egg (the dev stage mints the pool whose id the secret would hold).
// The pool id is a public value (already exposed via NEXT_PUBLIC_), so it is read
// from a plain env var (process.env.DEV_COGNITO_USER_POOL_ID) on the pr-<N> code
// path only — see infra/auth.ts. Set it as a GitHub Actions variable (deploy.yml)
// / shell env, mirroring how CLOUDFLARE_API_TOKEN is handled.

// M18 Brazilian-Portuguese TTS (Amazon Polly) needs NO secrets. The Polly voice
// id, engine, and speed are runtime-configurable via the M19 admin AI settings
// (AiConfig.pollyVoiceId / pollyEngine / speedRate, stored in CONFIG#AI/CURRENT
// and resolved by resolveAiConfig()), not via SST secrets. Only the IAM grant
// (polly:SynthesizeSpeech) is needed — see infra/application.ts.

// M13 study-generation prompts are no longer SST secrets. They live as
// committed text files in `/prompts/*.txt` and are loaded at Lambda startup
// into process.env by `study-prompts.ts`, bypassing the AWS Lambda 4 KB
// env-var limit.
