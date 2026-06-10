# TransformMyNotes — Roadmap

Mobile-first web app that digitizes handwritten study notes: photograph a page → Amazon
Bedrock (Claude vision) transcribes the handwriting (primarily **Brazilian Portuguese**) into
Markdown → review/edit in a **Notion-like block editor** → save into a personal, full-text
searchable Markdown notebook. Access is invite/approval-gated and managed via an admin panel.

This folder holds the version-controlled source of truth for each milestone (`M*.md`). Each
file is mirrored in full into its **epic issue** on GitHub, and live status lives in that epic
issue's "Status / Next steps / Gotchas" section + the **Transform My Notes** Project board.

> 📅 **Delivery schedule, dependency graph, Gantt chart, and the parallel-dispatch (Wave) plan
> live in [`ROADMAP.md`](./ROADMAP.md)** — mirrored onto board #5's `Wave` / `Start date` /
> `Target date` fields and the GitHub milestone due dates.

## Locked stack & decisions

- **AWS serverless**, **Next.js App Router** (frontend + route handlers), **SST v4** (`sst.aws.Nextjs`).
- **S3** for Markdown note bodies + original images; **DynamoDB** for metadata / invites / search /
  groups / review cards / shares; **Cognito** auth (groups `admin` / `member`); **Resend** for
  transactional email; **CloudFront** via SST; domain **transformmynotes.com**; region **us-east-1**.
- **Full template split kept:** marketing site at apex `transformmynotes.com` (`packages/marketing`)
  + authed app at `app.transformmynotes.com` (`packages/application`).
- **Full feature scope:** courses/groups, a spaced-repetition **review deck**, and **shared notes**
  between members — beyond the base requirements, per product decision.
- **Editor:** Notion-like **TipTap/ProseMirror** block editor is the **primary** experience; a raw
  **Markdown** editor is the **secondary** toggle. Markdown is the canonical stored format (round-trip).
- **Bedrock:** `bedrock-runtime` **Converse** API, a **cross-region inference profile** (`us.` prefix)
  for a Claude **Sonnet** vision model, explicit `maxTokens`, a **pt-BR-aware** prompt; verify the
  current model/profile id and model access in `us-east-1` at setup. The model is selected by the
  configurable **`BEDROCK_MODEL_ID`** env var/secret (introduced in M4) — no model id is hardcoded,
  so swapping models or version-bumping is a secret update, not a code deploy.
- **Auth/onboarding:** self sign-up lands in a **pending** queue (admin approves); a valid **invite
  bypasses approval** and activates immediately. Invites are **hashed** (sha256), single-use email
  invites + reusable **capped** shareable codes, **30-day** default expiry, revocation immediate.
- **Bootstrap admin:** documented **manual AWS Cognito console** runbook per stage (no code).
- **Security:** least-privilege IAM (no wildcards — scope `bedrock:InvokeModel` to the profile, the
  one bucket, the specific tables); secrets only in SST; resource tagging; rate-limited registration
  + redemption; no email enumeration; resilient/retryable uploads + OCR.

## Milestones

| # | Milestone | Size | Depends on |
|---|---|---|---|
| **M0** | Monorepo & infra bootstrap (workspaces, core, application, marketing, infra, `sst.config.ts`, CI→`master`, offline dev) | XL | — |
| **M1** | Design-system port (self-hosted fonts, tokens, component library, Lucide, app shells, Markdown renderer) | L | M0 |
| **M2** | Auth & onboarding (Cognito + Amplify, login/register/pending/invite-accept, `proxy.ts` gating, console-admin runbook) | L | M0, M1 |
| **M3** | Invites, groups & admin panel (hashed/expiring invites + reusable codes, Resend email, groups, pending queue, user & invite mgmt) | L | M2 |
| **M4** | Capture → Transcribe (camera/upload, resize, presigned S3, `/api/transcribe` Bedrock Converse, processing/error/retry) | L | M1, M2 |
| **M5** | Review & Notion-like editor (review-before-save, TipTap primary + Markdown secondary, round-trip, tags, save, success) | XL | M4 |
| **M6** | Notebook library & full-text search (library home, NoteCards, note view, search index, empty/offline) | L | M5 |
| **M7** | Sharing & collaboration (share-to-group/member, Shared tab, server-side authorization) | L | M6 |
| **M8** | Review deck / spaced repetition (cards from highlights, SM-2-style scheduler, Review tab, due-count) | L | M6 |
| **M9** | Marketing site (apex landing, brand story, SEO, e2e) | M | M0, M1 |
| **M10** | Hardening & launch (WCAG AA, resilient uploads, IAM audit, cost/perf, tagging, prod cutover, Resend domain, E2E) | L | all prior |
| **M11** | Security hardening (Cloudflare Turnstile on auth pages, OWASP ASVS L1 + Top 10 baseline — CSP/headers, rate limiting, input validation, no enumeration — CodeQL + Dependabot + secret scanning) | L | M2, M3, M10 |
| **M12** | Android app — Capacitor (thin native shell via `server.url` → `app.transformmynotes.com`, native camera capture, App Links/assetlinks, signed-`.aab` CI, Play Store runbook) | L | M10 |
| **M13** | AI generation engine — Bedrock **tool-use → typed JSON** study material, `STUDYSET` data model, async generation job, **pt-BR** system prompt + language policy, generate-on-a-note UI (single-note input) | XL | M4, M5, M6 |
| **M14** | AI-generated flashcards, reviewed-then-accepted into the existing **M8 spaced-repetition deck** (shared `CARD` items + SM-2) | L | M13, M8 |
| **M15** | Quizzes/tests from notes — MCQ + short-answer, **auto-graded** (MCQ exact + Bedrock judge), attempts + score report | XL | M13 |
| **M16** | Assignments/practice, summaries, key-term glossaries & study guides generated from notes | L | M13 |
| **M17** | Expand input from single-note to **notebook-wide / arbitrary note sets** — map-reduce synthesis + cross-note dedup + multi-source provenance | XL | M13, M15, M16, M6 |
| **M18** | **Brazilian-Portuguese audio** (Amazon Polly neural TTS) for flashcards & written study content, cached by content hash in S3 | L | M8, M13, M14 |
| **M19** | Admin AI settings — runtime-configurable generation (system prompt, model allowlist, inference params, guardrails, Polly voice, per-type enable + global kill-switch; `CONFIG#AI` DynamoDB item, `resolveAiConfig()`, version history + revert) | L | M3, M13 |
| **M20** | Document sources — PDF / DOCX / EPUB / text (upload documents/books, `SOURCE#` entity + recency GSI7, `resolveSourceText()` normalization layer so M14–M17 generators run unchanged off any source, multi-format parsers, large books reuse M17 map-reduce, `STUDYSET` source refs generalized to `sourceRefs`) | XL | M4, M13, M17 |
| **M21** | Web article ingestion + AI security hardening (paste URL → fetch + readable-article extract into a web `SOURCE#` → generate any material type; SSRF hardening via `assertUrlSafe`/`safeFetch` — scheme allowlist, private/link-local/cloud-metadata IP blocking, DNS-rebinding guard, per-hop redirect re-validation, size/timeout/content-type caps; prompt-injection mitigation — untrusted web content wrapped as data) | L | M13, M20 |

## Architecture summary

- **Notes** — `PK=USER#<sub>`, `SK=NOTE#<ulid>` (time-ordered); body Markdown in **S3** (`bodyS3Key`),
  original image in S3 (`originalImageS3Key`); metadata: title, groupId, tags, status, words,
  highlights, langPair, ocrConfidence, timestamps.
- **Search** — lightweight per-user inverted index in DynamoDB (token → noteIds) maintained on save.
- **Invites** — `PK=INVITE#<sha256(code)>` (raw code never stored); GSI to list/filter by status;
  `type`, `targetEmail`, `groupId`, `expiresAt`, `maxUses`, `usedCount`, `status`, `createdBy`.
- **UserData/profile** — `PK=USER#<sub>`: status (pending/active/disabled), role, name, email,
  groupIds, counts; GSI1 `STATUS#pending` for the admin queue.
- **Groups** — `GROUP#<id>` + membership; notes & invites carry `groupId`.
- **Shares** — recipient-keyed GSI (`USER#<recipientSub>` → shared-note refs) with owner/permission.
- **Review cards** — `CARD#<id>` per user (sourceNoteId, front/back, ease, interval, dueAt); a
  due-date GSI (ISO/zero-padded sort key) powers ranged "due now" queries.
- **Auth flow** — Cognito groups `admin`/`member`; Post-Confirmation Lambda writes the profile;
  `packages/application/proxy.ts` verifies the JWT (`aws-jwt-verify`) and gates admin routes to the
  `admin` group and notebook routes to `status=active`.
- **OCR pipeline** — capture/upload → client resize → presigned S3 PUT → `POST /api/transcribe`
  (Bedrock Converse, Sonnet vision profile, `maxTokens`, pt-BR prompt) → review (Notion-like editor)
  → save (S3 body + DynamoDB metadata + search index).
- **AI study material** — `STUDYSET#<ulid>` items in the Notes table (type: flashcards|quiz|assignment|summary,
  status: queued→running→ready|failed, body in S3); GSI4 list-by-user, GSI5 list-by-note; quiz attempts
  `ATTEMPT#<ulid>` on GSI6; AI flashcards reuse M8's `CARD#`/GSI3; pt-BR-focused Bedrock tool-use
  generation (typed JSON via Converse API); Polly neural TTS audio cached by content hash in S3.
  **Runtime AI config (M19):** a global `CONFIG#AI` DynamoDB item (edited from the admin dashboard)
  controls system prompt, generation model (vetted allowlist), inference params (maxTokens/temperature/topP),
  guardrails (rate/notes/token caps), Polly voice/speed, and per-type enable + kill-switch toggles; the
  `resolveAiConfig()` resolver reads this item first and falls back to `sst.Secret` defaults, with full
  version history + revert support.
- **Source abstraction (M20–M21)** — `SOURCE#<ulid>` entity unifies notes, uploaded documents
  (PDF/DOCX/EPUB/TXT/MD), and fetched web articles as interchangeable generation inputs; a
  `resolveSourceText()` normalization layer lets the M14–M17 generators run off any source
  unchanged; GSI7 provides recency-ordered source listing per user; `STUDYSET` source references
  are generalized to `sourceRefs`. Web ingestion (M21) is **SSRF-hardened** via `assertUrlSafe`/
  `safeFetch` (scheme allowlist, private/link-local/cloud-metadata IP blocking, DNS-rebinding
  guard, per-hop redirect re-validation, size/timeout/content-type caps) and mitigates
  prompt-injection by wrapping untrusted web content as data.
- **Deploy** — shared `sst.aws.Router`: apex → marketing, `app.` → application; `production` named
  stage + ephemeral `pr-<N>` stages; secrets in SST; us-east-1 for the ACM/CloudFront cert.

## Tracking model

Per `CLAUDE.md`: the **Transform My Notes** GitHub Project (Status + Size + cycle-time fields) is the
board; each milestone has a GitHub **milestone** object (one-line) + an **epic issue** (full spec,
mirrored from the matching `M*.md`) carrying live Status/Next-steps/Gotchas; granular work lands as
**sub-issues** under each epic, each with a Size and a Status that moves Backlog → Ready → In
progress → In review → Done as work proceeds.
