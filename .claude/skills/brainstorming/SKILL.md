---
name: brainstorming
description: Turn a rough idea into a validated design and a decomposed GitHub milestone before writing any code. Use at the start of any non-trivial feature, capability, or milestone — it explores intent one question at a time (assuming a fixed AWS-serverless / Next.js / SST v4 / GitHub Actions / serverless-DynamoDB stack, so it never re-litigates the stack), locks a committed design doc, then breaks the work into an epic (Mx) → sequential phases (Mx.x) → parallel-dispatchable subtasks (Mx.x.x).
---

# Brainstorming — idea → design → decomposed milestone

> Turn a half-formed idea into (1) a validated design and (2) a GitHub milestone broken into phases and subtasks that subagents can pick up and run in parallel. This is a thinking-and-scoping skill — it ends **before** implementation, not during it.

<HARD-GATE>
Do NOT write implementation code, scaffold, run migrations, or dispatch an implementation subagent until **both**: the design is approved by the user, AND the milestone (epic + phases + subtasks) is created. The terminal state of this skill is "milestone is on the board, ready to pick up" — not "feature built."
</HARD-GATE>

## Fixed stack — assume it, never brainstorm it

These are decided for every project this skill runs in. **Do not ask about them, do not propose alternatives for them:**

- AWS serverless, deployed with **SST v4**; **Next.js** (App Router) for the web app(s).
- **GitHub Actions** for CI/CD; ephemeral per-PR stages, one named `production` stage.
- **Serverless DynamoDB** (single-table design preferred) for persistence; **S3** for blobs/large bodies; managed auth (e.g. Cognito) with server-side JWT verification.
- TypeScript, npm workspaces monorepo.

So **never** ask "which framework / database / host / language / CI / auth provider?" — those answers are above. The questions worth asking are about *product behavior, the data model, and how the work decomposes* (see below).

## Scale to size first

Read the request and judge its size before running the full flow:

- **XS / S** (a copy tweak, one component, a config change, a single bug): this skill is overkill. Produce a 2–4 sentence design inline, get a quick thumbs-up, and (optionally) draft a single issue. **Skip the milestone machinery.** Say so explicitly: "this is S-sized, so I'm not spinning up a milestone."
- **M** (a feature slice — a few files, maybe one new access pattern): a short design doc + a single phase or a small milestone.
- **L / XL** (a whole capability / multi-phase epic): the full flow below — design doc, epic, sequential phases, parallel subtasks.

## Process

Create a task per step and do them in order.

### 1. Explore context
Check the repo before asking anything: `CLAUDE.md` and any conventions skill, `docs/milestones/` (the spec format + the latest `Mx` number in use), the data-layer key builders, and recent related issues/PRs. The goal is to ask *informed* questions and to reuse existing patterns rather than reinventing them.

### 2. Clarify intent — one question at a time
- **One question per message.** Multiple-choice preferred (easier to answer); open-ended is fine when needed.
- Lead with the highest-leverage unknown. Stop asking once you can state the design without guessing.
- **Question bank** (pull only what's relevant — don't grind through all of it):
  - **Problem & success** — what problem, for whom, and what does "done well" look like?
  - **Behavior & UX** — the happy path, the key UI states (empty / loading / error / offline), and the edge cases that change the shape of the work.
  - **Data model** — what entities are read/written, and **what are the access patterns**? Does this need a new DynamoDB key/GSI, or does it reuse an existing one? (Top-k → padded-score sort key; anything a job consumes → stream.)
  - **Boundaries** — which packages / routes / components are touched? What is new vs. reused? What stays out (YAGNI — cut it now)?
  - **Cross-cutting, only when the feature actually raises it** — ownership/authz checks, rate limits / abuse caps, cost, and security for untrusted input (SSRF on server-side fetch of user URLs; prompt-injection when external text reaches an LLM). Skip these for features that don't touch them.

### 3. Propose the design
- Present the design in sections scaled to complexity; get a thumbs-up per section before moving on.
- **Offer 2–3 alternatives only where a genuine fork exists** — e.g. the shape of an access pattern, a sync/conflict model, a sync-vs-async boundary, a build-vs-reuse call. Lead with your recommendation and why. **Do not manufacture alternatives for things the fixed stack already decides.**
- Cover what's non-obvious for this stack: the DynamoDB key/GSI additions, new routes/handlers, the component breakdown, and where tests land (pure logic → unit; any new access pattern → a dynalite integration test; UI → a real browser check).
- Keep units small and independently testable — each with one clear purpose and a well-defined interface. This also makes the subtask decomposition in step 4 fall out naturally.

### 4. Decompose into milestone structure
Translate the approved design into the **epic → phases → subtasks** shape. This is the part that makes the work dispatchable.

- **Epic (`Mx`)** — the whole capability. One milestone.
- **Phases (`Mx.x`)** — **sequential dependency waves.** Phase N+1 may depend on phase N; phases are done in order. Each phase is a unit a single session can pick up. Give each a clear **Definition of Done**.
- **Subtasks (`Mx.x.x`)** — the work inside a phase, written so **subagents run them in parallel**. This is a hard constraint, so design for it:
  - Subtasks within a phase must be **independent** — no subtask waits on a sibling.
  - They should touch **disjoint files/modules** where possible, to avoid merge collisions between parallel agents.
  - If two pieces *must* be ordered, that ordering is a **phase boundary**, not two subtasks in one phase.
  - Size each subtask (XS–XL) so effort is visible.
- Sanity check: "Could I hand each subtask in this phase to a different agent at the same time and have them not step on each other?" If no, re-cut the phase.

### 5. Write + commit the design doc
Write the validated spec to the project's milestone-spec location (default `docs/milestones/<Mx>-<slug>.md`; follow the project's own convention if it has one). Mirror the established section order:

> Title + `> Size: <S> · Depends on: <Mx, …>` → **Goal** → **In scope** → **Out of scope** → **Architecture & decisions** (schema/key/GSI additions, new routes, component breakdown) → **Phases & tasks** (`Mx.x` with its `Mx.x.x` subtasks + sizes) → **DoD (per phase)** → **Risks / open questions** → **Status / Next steps / Gotchas**.

Then **self-review** the doc with fresh eyes and fix inline: placeholder scan (no TBD/TODO), internal consistency (architecture matches the phase list), scope (one coherent milestone, not several), ambiguity (any requirement readable two ways — pick one). Commit it on a feature branch (never `master`; name it for what it delivers).

### 6. User reviews the spec
> "Spec written and committed to `<path>`. Review it and tell me if you want changes before I open the milestone + issues."

Wait. If they request changes, fix and re-run the self-review.

### 7. Create the GitHub milestone + issues
Once the spec is approved, materialize it on GitHub (the spec doc is the source of truth; GitHub mirrors it):

- **Milestone object** — `Mx · <title>`, one-line description (richness lives in the epic issue, not here).
- **Epic issue** — `Mx · <title> — EPIC`. Body = the **full spec** mirrored from the doc, with a `## Phases` list linking each phase issue.
- **Phase issues** — one per `Mx.x`. Body = a `## Tasks (run in parallel)` list of the `Mx.x.x` subtasks (with sizes), an `## Exit criteria` (the phase DoD), and any `## Key constraint`. Link back to the epic + the spec doc.
- **Board + fields** — add every issue to the project board, set each one's **Status** (`Ready` for the first phase, `Backlog` for later ones) and **Size**. Use the project's documented board / field / option IDs (see the project's `CLAUDE.md`) or resolve them at runtime via the GitHub GraphQL API. Stamp cycle-time start only when work actually begins, not here.

### 8. Stop — hand off, don't build
Report the milestone, the epic issue, the phase issues, and the spec path. Then **stop.** Do not start implementing and do not open a PR — both require the user's explicit go. The natural next step is for someone to pick up phase **`Mx.1`** and dispatch its subtasks to parallel subagents.

## Key principles
- **One question at a time; multiple-choice preferred.**
- **The stack is fixed — never brainstorm it.** Spend questions on behavior, data, and decomposition.
- **YAGNI ruthlessly** — cut speculative scope into Out-of-scope before it becomes a phase.
- **Alternatives only where a real fork exists** — not for infra the stack already decides.
- **Subtasks in a phase must be parallel-safe** — independent, disjoint files; ordering becomes a phase boundary.
- **Scale to size** — don't spin up a milestone for an S-sized change.
- **Terminal state is a ready milestone, not a built feature.**
