# TransformMyNotes

Mobile-first web app that digitizes handwritten study notes: photograph a page → Amazon Bedrock
(Claude vision) transcribes the handwriting (primarily **Brazilian Portuguese**) into Markdown →
review/edit in a **Notion-like block editor** → save into a personal, full-text searchable
notebook. Access is invite/approval-gated with an admin panel; courses/groups, a spaced-repetition
review deck, and shared notes are included.

**Stack:** AWS serverless · Next.js App Router · SST v4 · S3 + DynamoDB · Cognito · Bedrock
(Converse) · Resend · CloudFront · `us-east-1`. Marketing at the apex `transformmynotes.com`, the
app at `app.transformmynotes.com`.

- 📋 **Specs:** [`docs/milestones/`](docs/milestones/) — one `M*.md` per milestone (mirrored into each epic issue)
- 🗺️ **Roadmap, dependency graph & Gantt:** [`docs/milestones/ROADMAP.md`](docs/milestones/ROADMAP.md)
- 📌 **Board:** [Transform My Notes (Project #5)](https://github.com/users/jasonp2323/projects/5) — Status · Size · Wave · Start/Target dates

## Parallel dispatch plan

Each **Wave** is a set of milestones that can be worked **at the same time** — dispatch one agent
per milestone in a wave, in parallel, without them heavily stepping on each other. Finish a wave
(and its CI gates) before starting the next, since the next wave depends on it. On the board, filter
by the **`Wave`** field to pull exactly the issues for the agents you're about to dispatch.

| Wave | Milestones (run in parallel) | Dates | Why they're safe in parallel |
|---|---|---|---|
| **1** | **M0** — Monorepo & infra bootstrap | Jun 8–11 | Foundation; nothing else can start until the monorepo + infra + CI exist. |
| **2** | **M1** — Design-system port | Jun 12–14 | The design system gates every UI surface; do it once, alone. |
| **3** | **M2** Auth ∥ **M9** Marketing | Jun 15–17 | Different packages (`application` vs `marketing`), no shared code. |
| **4** | **M3** Invites & admin ∥ **M4** Capture→OCR | Jun 18–20 | Both need auth (M2) but touch different routes/tables; coordinate only on shared `keys.ts` builders. |
| **5** | **M5** — Review & Notion editor | Jun 21–24 | Builds directly on M4's transcription output; single focused track. |
| **6** | **M6** — Library & full-text search | Jun 25–27 | Depends on the saved-note shape from M5. |
| **7** | **M7** Sharing ∥ **M8** Review deck | Jun 28–30 | Independently extend the note model — different GSIs (`ByRecipient` vs `ByDue`). |
| **8** | **M10** — Hardening & launch | Jul 1–3 | Needs everything merged; run last, alone. |

> **Critical path:** M0 → M1 → M2 → M4 → M5 → M6 → M8 → M10. **M3, M9, M7 have slack.**
> Coupling to watch: when two parallel milestones each add a GSI to the same table, land one PR and
> rebase the other to avoid SST's "index already exists" hazard (see ROADMAP.md).

## Milestones

| # | Milestone | Size | Wave | Start | Target | Depends on | Parallel with |
|---|---|---|---|---|---|---|---|
| M0 | Monorepo & infra bootstrap | XL | 1 | Jun 8 | Jun 11 | — | — |
| M1 | Design-system port | L | 2 | Jun 12 | Jun 14 | M0 | — |
| M2 | Auth & onboarding | L | 3 | Jun 15 | Jun 17 | M0, M1 | M9 |
| M9 | Marketing site | M | 3 | Jun 15 | Jun 16 | M0, M1 | M2 |
| M3 | Invites, groups & admin panel | L | 4 | Jun 18 | Jun 20 | M2 | M4 |
| M4 | Capture → Transcribe (Bedrock OCR) | L | 4 | Jun 18 | Jun 20 | M1, M2 | M3 |
| M5 | Review & Notion-like editor | XL | 5 | Jun 21 | Jun 24 | M4 | — |
| M6 | Notebook library & full-text search | L | 6 | Jun 25 | Jun 27 | M5 | — |
| M7 | Sharing & collaboration | L | 7 | Jun 28 | Jun 30 | M6 | M8 |
| M8 | Review deck / spaced repetition | L | 7 | Jun 28 | Jun 30 | M6 | M7 |
| M10 | Hardening & launch | L | 8 | Jul 1 | Jul 3 | all prior | — |

Every milestone has an **epic issue** (full spec) tracking ~7–10 **sub-issues**, each with a Size,
Wave, and dates on the board. See [`ROADMAP.md`](docs/milestones/ROADMAP.md) for the dependency
graph, Gantt chart, and per-wave coupling notes.
