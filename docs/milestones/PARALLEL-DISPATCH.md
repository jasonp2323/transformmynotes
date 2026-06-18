# TransformMyNotes — Parallel Dispatch Plan

This document is the wave-by-wave plan for dispatching one agent per milestone in parallel. Each wave groups milestones that are safe to run simultaneously; finish a wave (and its CI gates) before starting the next. It complements [ROADMAP.md](./ROADMAP.md), which holds the full dependency graph and Gantt view, and the GitHub Project board #5 `Wave` field — filter by `Wave` on the board to pull exactly the issues for the agents you are about to dispatch.

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
| **8** | **M10** — Hardening & launch | Jul 1–3 | Needs everything merged; production cutover — run last, alone. |
| **9** | **M11** Security hardening ∥ **M12** Android (Capacitor) | Jul 4–6 | Post-launch. App hardening vs. the Android wrapper touch different surfaces; both depend only on the launched app (M10). |
| **10** | **M13** — AI generation engine & foundation | Jul 7–10 | The shared foundation for every study-material type; establish it alone before others branch off. |
| **11** | **M14** Flashcards ∥ **M15** Quizzes ∥ **M16** Guides ∥ **M19** Admin AI settings | Jul 11–14 | All four depend only on M13 (M19 also on M3, done). Different item types / GSIs; only shared touchpoint is the read-only `resolveAiConfig()` resolver. |
| **12** | **M17** Multi-note generation ∥ **M18** Audio / TTS | Jul 15–18 | Orthogonal: map-reduce note-set synthesis vs. Polly TTS audio. Different tables, routes, and AWS services. |
| **13** | **M20** — Document sources (PDF/DOCX/EPUB/text) | Jul 19–22 | Reuses M17's map-reduce chunking; introduces the `SOURCE#` entity + GSI7 + `resolveSourceText()` that M21 builds on — run alone. |
| **14** | **M21** — Web ingestion + AI security hardening | Jul 23–25 | Builds the URL-fetch path on M20's `SOURCE#` model + SSRF / prompt-injection guards. Security-sensitive — isolated wave keeps the review surface small. |
| **15** | **M22** Offline/PWA ∥ **M23** Cost Breakdown ∥ **M24** Study profile ∥ **M26** Multi-page capture | Jul 26–29 | All four have their prerequisites already shipped and touch mutually-disjoint surfaces: M22 is a service-worker/Capacitor layer (no DB change), M23 adds a new `Usage` table + admin tab, M24 adds per-user profile fields + a generation prompt layer, M26 adds the capture toggle + a batch-transcribe route. No shared files. |
| **16** | **M25** — Study Progress & Insights | Jul 30–Aug 1 | Runs alone: it adds a new `StudyEvents` table + stream aggregator (shares `infra/db.ts` / `infra/jobs.ts` with M23) **and** lifetime counters on the `UserProfile` item (shares that item with M24), so it lands after Wave 15 to keep those edits serialized. |
| **17** | **M27** — Manual & explicit flashcards | Aug 2–4 | Leaf milestone on shipped foundations (M8 deck + M14 `origin`): touches only the cards routes + Review/NoteView UI, no schema change. Runs alone. |

> **Critical path:** M0 → M1 → M2 → M4 → M5 → M6 → M8 → M10 → {M11 ∥ M12} → M13 → M15 → M17 → M20 → M21.
> **M3, M9, M7, M14, M16, M18, M19, M22, M23, M24, M25, M26, M27 have slack** (none of the post-M21 milestones are on the critical path).
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
| M11 | Security hardening | L | 9 | Jul 4 | Jul 6 | M2, M3, M10 | M12 |
| M12 | Android app · Capacitor | L | 9 | Jul 4 | Jul 6 | M10 | M11 |
| M13 | AI generation engine & foundation | XL | 10 | Jul 7 | Jul 10 | M4, M5, M6 | — |
| M14 | AI flashcards → review deck | L | 11 | Jul 11 | Jul 13 | M13, M8 | M15, M16, M19 |
| M15 | Quizzes & tests (auto-graded) | XL | 11 | Jul 11 | Jul 14 | M13 | M14, M16, M19 |
| M16 | Assignments, summaries & study guides | L | 11 | Jul 11 | Jul 13 | M13 | M14, M15, M19 |
| M19 | Admin AI settings — runtime-configurable generation | L | 11 | Jul 11 | Jul 13 | M3, M13 | M14, M15, M16 |
| M17 | Multi-note & notebook-wide generation | XL | 12 | Jul 15 | Jul 18 | M13, M15, M16, M6 | M18 |
| M18 | Audio for flashcards & notes (TTS) | L | 12 | Jul 15 | Jul 17 | M8, M13, M14 | M17 |
| M20 | Document sources — PDF / DOCX / EPUB / text | XL | 13 | Jul 19 | Jul 22 | M4, M13, M17 | — |
| M21 | Web article ingestion + AI security hardening | L | 14 | Jul 23 | Jul 25 | M13, M20 | — |
| M22 | Offline support (PWA shell → offline-first) | L | 15 | Jul 26 | Jul 29 | M10, M12 | M23, M24, M26 |
| M23 | Admin Cost Breakdown | L | 15 | Jul 26 | Jul 29 | M3, M4 | M22, M24, M26 |
| M24 | Per-user study profile & AI environment | XL | 15 | Jul 26 | Jul 29 | M13 | M22, M23, M26 |
| M26 | Multi-page note capture | M | 15 | Jul 26 | Jul 28 | M4, M5 | M22, M23, M24 |
| M25 | Study Progress & Insights | L | 16 | Jul 30 | Aug 1 | M8, M13, M5, M6 (soft M15) | — |
| M27 | Manual & explicit flashcard creation | L | 17 | Aug 2 | Aug 4 | M8, M14 | — |

## Post-M21 milestones — coupling notes

- **M22 and M26 are fully isolated surfaces.** M22 is a service-worker / Capacitor layer with no DynamoDB schema changes. M26 adds a capture toggle and a batch-transcribe route that reuses M4's existing table shape. Neither touches any file the other three Wave 15 milestones write to.
- **M23 and M25 each add a new dedicated table** (`Usage` and `StudyEvents` respectively), so there is no shared-GSI "index already exists" hazard between them. However, both append to `infra/db.ts` and `infra/jobs.ts` — a light merge coupling that is manageable when they run in different waves but would require careful rebase coordination if run together. This is exactly why M25 is held to its own Wave 16 rather than being folded into Wave 15.
- **M24 and M25 both write the `UserData` / `UserProfile` item.** M24 adds per-user profile fields and a generation-prompt layer; M25 adds lifetime study counters to the same item. Keeping them in different waves (15 and 16) serializes those item edits and avoids a concurrent-write schema conflict on the `UserProfile` shape.
