# TransformMyNotes — Roadmap

Mobile-first web app that digitizes handwritten study notes: photograph a page → Amazon
Bedrock (Claude vision) transcribes the handwriting (primarily **Brazilian Portuguese**) into
Markdown → review/edit in a **Notion-like block editor** → save into a personal, full-text
searchable Markdown notebook. Access is invite/approval-gated and managed via an admin panel.

This folder holds the version-controlled source of truth for each milestone (`M*.md`). Each
file is mirrored in full into its **epic issue** on GitHub, and live status lives in that epic
issue's "Status / Next steps / Gotchas" section + the **Transform My Notes** Project board.

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
| **M9** | Marketing site (apex landing, brand story, contact form via Turnstile + Resend, SEO, e2e) | M | M0, M1 |
| **M10** | Hardening & launch (WCAG AA, resilient uploads, IAM audit, cost/perf, tagging, prod cutover, Resend domain, E2E) | L | all prior |

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
- **Deploy** — shared `sst.aws.Router`: apex → marketing, `app.` → application; `production` named
  stage + ephemeral `pr-<N>` stages; secrets in SST; us-east-1 for the ACM/CloudFront cert.

## Tracking model

Per `CLAUDE.md`: the **Transform My Notes** GitHub Project (Status + Size + cycle-time fields) is the
board; each milestone has a GitHub **milestone** object (one-line) + an **epic issue** (full spec,
mirrored from the matching `M*.md`) carrying live Status/Next-steps/Gotchas; granular work lands as
**sub-issues** under each epic, each with a Size and a Status that moves Backlog → Ready → In
progress → In review → Done as work proceeds.
