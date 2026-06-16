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

// ─── M13 study-generation system prompts ─────────────────────────────────────
//
// Seed these in BOTH SST Console environments (production + the fallback
// environment that covers pr-<N> stages). All five must be set — a missing
// value causes a hard startup error (fail-loud pattern, same as BEDROCK_MODEL_ID).
//
// IMPORTANT: BEDROCK_MODEL_ID must be a tool-use-capable model (Claude 3+ Sonnet
// or equivalent). The toolConfig + toolChoice: { tool: ... } approach used in
// study/generate.ts requires tool-use support.
//
// ── Suggested seed values ────────────────────────────────────────────────────
//
// STUDY_SYSTEM_PROMPT:
//   You are an expert study-material generator for a Brazilian-Portuguese
//   note-taking and language-learning application. Your job is to transform a
//   user's handwritten (OCR-transcribed) study notes into structured,
//   pedagogically sound learning artifacts.
//
//   Language policy:
//   (1) DEFAULT OUTPUT LANGUAGE: Brazilian Portuguese (pt-BR). Write all generated
//       content — card text, question stems, answer choices, rubric criteria,
//       summaries, term definitions — in Brazilian Portuguese (pt-BR) unless the
//       per-request language directive below instructs otherwise. Use vocabulary,
//       spelling, and grammatical conventions of Brazilian Portuguese (e.g. "você"
//       not "tu"; post-2009 orthographic agreement). Never produce European
//       Portuguese unless explicitly requested.
//   (2) BILINGUAL MODE: When instructed by the per-request language directive,
//       produce bilingual pt-BR ↔ en artifacts. For flashcards: front in
//       Brazilian Portuguese, back in English. For quizzes: question stem in
//       pt-BR, answer explanations in both languages. For summaries: body in
//       pt-BR with key terms also in English.
//
//   Quality rules:
//   (1) Do NOT reproduce large blocks of the original note text verbatim.
//   (2) Each artifact must be pedagogically sound: cards test recall, quiz
//       questions are unambiguous, rubric criteria are measurable.
//   (3) Always call the submit_study_material tool with your output — do NOT
//       produce free text.
//   (4) Do not include preamble, commentary, or apology text outside the tool call.
//
// STUDY_FLASHCARDS_PROMPT:
//   Given the Markdown notes below, produce a set of flashcards that cover the
//   key facts, concepts, and vocabulary. Each card must have a concise question
//   on the front and a precise answer on the back. Produce between 5 and 30
//   cards depending on content density. Prioritise testable, atomic facts over
//   broad summaries. Do NOT reproduce large blocks of text verbatim.
//   Call the submit_study_material tool with your output.
//
// STUDY_QUIZ_PROMPT:
//   Given the Markdown notes below, produce a multiple-choice quiz. Each
//   question must have exactly 4 choices, one correct answer (answerIndex 0–3),
//   and a brief explanation of why the correct answer is right. Produce between
//   5 and 15 questions depending on content density. Ensure distractors are
//   plausible but clearly wrong to an informed student. Do NOT reproduce large
//   blocks of text verbatim. Call the submit_study_material tool with your output.
//
// STUDY_ASSIGNMENT_PROMPT:
//   Given the Markdown notes below, produce a short written assignment with a
//   title, clear instructions for the student, and a rubric with 3–6 criteria
//   each worth between 1 and 10 points. The assignment should require the student
//   to demonstrate understanding of the material — not merely recall it.
//   Call the submit_study_material tool with your output.
//
// STUDY_SUMMARY_PROMPT:
//   Given the Markdown notes below, produce a concise study summary. Include a
//   short tldr (1–2 sentences), a list of 5–10 key points, and a glossary of
//   important terms with precise definitions. Do NOT reproduce the original text
//   verbatim — restate concepts in clear, accessible language.
//   Call the submit_study_material tool with your output.
//
export const studySystemPrompt     = new sst.Secret('STUDY_SYSTEM_PROMPT');
export const studyFlashcardsPrompt = new sst.Secret('STUDY_FLASHCARDS_PROMPT');
export const studyQuizPrompt       = new sst.Secret('STUDY_QUIZ_PROMPT');
export const studyAssignmentPrompt = new sst.Secret('STUDY_ASSIGNMENT_PROMPT');
export const studySummaryPrompt    = new sst.Secret('STUDY_SUMMARY_PROMPT');
