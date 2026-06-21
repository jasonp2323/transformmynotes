---
name: brainstorm
description: Turn a rough idea into a validated design and decomposed GitHub milestone(s) before writing any code. Use at the start of any non-trivial feature OR a brand-new application. It runs in two modes — a single capability → one milestone (epic Mx → phases Mx.x → parallel subtasks Mx.x.x), or a whole-app idea → a planned program of multiple milestones with a roadmap. Assumes a fixed AWS-serverless / Next.js / SST v4 / GitHub Actions / serverless-DynamoDB stack, so it never re-litigates the stack.
---

# Brainstorming — idea → design → decomposed milestone(s)

> Turn a half-formed idea into a validated plan plus the GitHub structure to execute it. This is a thinking-and-scoping skill — it ends **before** implementation, not during it.

<HARD-GATE>
Do NOT write implementation code, scaffold, run migrations, or dispatch an implementation subagent until **both**: the plan is approved by the user, AND the milestone(s) are created on GitHub. The terminal state of this skill is "the work is on the board, ready to pick up" — not "feature built."
</HARD-GATE>

## Two modes — pick one first

**Step 0: classify the request before anything else.**

- **Mode A — Single milestone.** One feature, capability, or change to an *existing* app. → one milestone (epic `Mx` → phases `Mx.x` → subtasks `Mx.x.x`). This is the common case.
- **Mode B — Whole application (greenfield).** A brand-new product / "build me an app that does X", or a request that clearly spans many independent capability areas. → a planned **program**: a milestone *set* (`M0…Mn`) + a roadmap, where each milestone follows the Mode A shape.

If it's ambiguous (e.g. "add a big feature area" that might be one milestone or several), say which you think it is and confirm before proceeding. When in doubt for an existing app, prefer Mode A and split later.

## Fixed stack — assume it, never brainstorm it (both modes)

These are decided for every project this skill runs in. **Do not ask about them, do not propose alternatives for them:**

- AWS serverless, deployed with **SST v4**; **Next.js** (App Router) for the web app(s).
- **GitHub Actions** for CI/CD; ephemeral per-PR stages, one named `production` stage.
- **Serverless DynamoDB** (single-table design preferred) for persistence; **S3** for blobs/large bodies; managed auth (e.g. Cognito) with server-side JWT verification.
- TypeScript, npm workspaces monorepo.

So **never** ask "which framework / database / host / language / CI / auth provider?" — those answers are above. Spend questions on *product behavior, the data model, and how the work decomposes*. (Mode B may still lock *product-level* decisions on top of the stack — specific AWS services, domain, third-party deps — see B2.)

## Scale to size first (Mode A)

Judge the request's size before running the full flow:

- **XS / S** (a copy tweak, one component, a config change, a single bug): this skill is overkill. Produce a 2–4 sentence design inline, get a quick thumbs-up, optionally draft a single issue. **Skip the milestone machinery** and say so.
- **M** — a short design doc + a single phase or a small milestone.
- **L / XL** — the full Mode A flow below.

---

# Mode A — single milestone

Create a task per step and do them in order.

### A1. Explore context
Read the repo before asking anything: `CLAUDE.md` and any conventions skill, `docs/milestones/` (the spec format + the latest `Mx` number in use), the data-layer key builders, recent related issues/PRs. Ask *informed* questions; reuse existing patterns.

### A2. Clarify intent — one question at a time
- **One question per message.** Multiple-choice preferred; open-ended when needed. Stop asking once you can state the design without guessing.
- **Question bank** (pull only what's relevant):
  - **Problem & success** — what problem, for whom, what does "done well" look like?
  - **Behavior & UX** — happy path, key states (empty / loading / error / offline), edge cases that change the shape of the work.
  - **Data model** — what entities are read/written, and **what are the access patterns**? New DynamoDB key/GSI, or reuse an existing one? (Top-k → padded-score sort key; anything a job consumes → stream.)
  - **Boundaries** — which packages / routes / components are touched? New vs reused? What stays out (YAGNI — cut it now)?
  - **Cross-cutting, only when the feature raises it** — ownership/authz, rate limits / abuse caps, cost, security for untrusted input (SSRF on server-side fetch of user URLs; prompt-injection when external text reaches an LLM).

### A3. Propose the design
- Present in sections scaled to complexity; thumbs-up per section.
- **Offer 2–3 alternatives only where a genuine fork exists** (access-pattern shape, sync/conflict model, sync-vs-async boundary, build-vs-reuse). Lead with your recommendation. Don't manufacture alternatives for what the fixed stack already decides.
- Cover the non-obvious: DynamoDB key/GSI additions, new routes/handlers, component breakdown, where tests land (pure logic → unit; new access pattern → dynalite integration test; UI → real browser check).
- Keep units small and independently testable — this makes the subtask decomposition fall out naturally.

### A4. Decompose into milestone structure
Translate the approved design into **epic → phases → subtasks**:

- **Epic (`Mx`)** — the whole capability. One milestone.
- **Phases (`Mx.x`)** — **sequential dependency waves.** Phase N+1 may depend on phase N; done in order. Each is a unit a single session can pick up. Give each a clear **Definition of Done**.
- **Subtasks (`Mx.x.x`)** — the work inside a phase, written so **subagents run them in parallel**:
  - Independent — no subtask waits on a sibling.
  - **Disjoint files/modules** where possible, to avoid merge collisions between parallel agents.
  - If two pieces *must* be ordered, that ordering is a **phase boundary**, not two subtasks in one phase.
  - Size each subtask (XS–XL).
- Sanity check: "Could I hand each subtask in this phase to a different agent simultaneously without collisions?" If no, re-cut the phase.

### A5. Write + commit the design doc
Write the spec to `docs/milestones/<Mx>-<slug>.md` (follow the project's own convention if it has one). Mirror the established section order:

> Title + `> Size: <S> · Depends on: <Mx, …>` → **Goal** → **In scope** → **Out of scope** → **Architecture & decisions** (schema/key/GSI additions, new routes, component breakdown) → **Phases & tasks** (`Mx.x` with its `Mx.x.x` subtasks + sizes) → **DoD (per phase)** → **Risks / open questions** → **Status / Next steps / Gotchas**.

Then **self-review** and fix inline: placeholder scan (no TBD/TODO), internal consistency (architecture matches phases), scope (one coherent milestone), ambiguity (any requirement readable two ways — pick one). Commit on a feature branch (never `master`; name it for what it delivers).

### A6. User reviews the spec
> "Spec written and committed to `<path>`. Review it and tell me if you want changes before I open the milestone + issues."

Wait. If they request changes, fix and re-run the self-review.

### A7. Create the GitHub milestone + issues
The spec doc is the source of truth; GitHub mirrors it.

- **Milestone object** — `Mx · <title>`, one-line description.
- **Epic issue** — `Mx · <title> — EPIC`. Body = the full spec mirrored from the doc, with a `## Phases` list linking each phase issue.
- **Phase issues** — one per `Mx.x`. Body = `## Tasks (run in parallel)` (the `Mx.x.x` subtasks + sizes), `## Exit criteria` (phase DoD), any `## Key constraint`. Link back to the epic + spec doc.
- **Board + fields** — add every issue to the project board; set **Status** (`Ready` for the first phase, `Backlog` for later) and **Size**. Use the project's documented board / field / option IDs (see its `CLAUDE.md`) or resolve them at runtime via the GitHub GraphQL API. Stamp cycle-time start only when work actually begins.

### A8. Stop — hand off, don't build
Report the milestone, epic, phase issues, and spec path. Then **stop.** Do not implement, do not open a PR — both require the user's explicit go. Next step: pick up phase **`Mx.1`** and dispatch its subtasks to parallel subagents.

---

# Mode B — whole application (greenfield)

Plan an entire product as a **program of milestones**. Mode B does the program-level thinking, then **reuses Mode A** to flesh out individual milestones. Do the steps in order.

### B1. Establish context
Greenfield repos are often near-empty. Confirm the fixed stack applies, note anything already scaffolded, and pick the milestone-numbering origin (`M0` for a true greenfield bootstrap).

### B2. Clarify at the program level — one question at a time
Same discipline (one question, multiple-choice preferred). Aim to nail down:
- **Product vision & audience** — what is this, for whom, the one-line value prop.
- **Core user journeys** — the 2–5 end-to-end flows the product must support. These seed the capability areas.
- **Capability areas → candidate milestones** — the major surfaces (e.g. auth, capture, editor, library/search, sharing, billing, admin). Each becomes a milestone.
- **MVP / launch cut vs later** — what's needed to launch vs post-launch. Push speculative areas to a "later/maybe" list (YAGNI at the milestone level).
- **Locked product decisions on top of the stack** — specific AWS services (Bedrock, Polly, SES/Resend…), the domain, key third-party deps, the auth model (roles/groups, invite-gated vs open), security posture. These become the README's **"Locked stack & decisions"**.
- Still **never** re-brainstorm the base stack itself.

### B3. Derive the milestone set
- **Start from the recurring foundation.** On this stack, almost every new app begins with the same foundation milestones — recommend them as defaults so the user doesn't reinvent them:
  - **M0 — Monorepo & infra bootstrap** (workspaces, `core`/`application`/`marketing` packages, `infra/` + `sst.config.ts`, CI→`master`, offline dev harness). Usually **XL**, depends on nothing.
  - **M1 — Design system** (tokens, fonts, component library, app shells). Gates every UI surface.
  - **M2 — Auth & onboarding** (Cognito + Amplify, login/register, `proxy.ts` gating).
  - **A marketing-site milestone** if the product has a public apex site.
  - A late **Hardening & launch** milestone (a11y, IAM audit, cost/perf, prod cutover) that depends on everything.
- **Then the product-specific milestones** derived from the capability areas in B2. Size each (XS–XL); an XL milestone should be flagged for likely decomposition.
- **Define the program-wide architecture / data model** — the cross-cutting single-table DynamoDB design (entities, PK/SK, the GSIs each capability needs), S3 usage, the auth flow. This keeps individual milestones consistent and becomes the README **"Architecture summary."**
- **Sequence into dependency waves.** Build the milestone dependency **DAG**; milestones with no path between them share a **Wave** and can be dispatched to separate agents in parallel. Identify the **critical path** (longest dependent chain).

### B4. Present the program plan — section by section, approval each
Walk the user through: vision → locked decisions → the **milestone list** (a table: `#`, milestone, size, depends-on) → the **dependency graph + waves** → the **architecture summary**. Apply YAGNI: cut speculative milestones to a "later/maybe" appendix rather than scheduling them. Revise on feedback before writing anything.

### B5. Write the program docs
Write three things and commit on a feature branch:
- **`docs/milestones/README.md`** — program overview: product summary, **Locked stack & decisions**, the **Milestones table** (with size + depends-on), the **Architecture summary** (cross-app data model), and the **Tracking model** (epic-issue-per-milestone + board).
- **`docs/milestones/ROADMAP.md`** — delivery plan: the **dependency graph** (mermaid), the **Wave-by-wave dispatch plan** (which milestones run in parallel and why they're safe together), the **critical path**, and a per-milestone detail table (size, wave, depends-on, parallel-with).
- **One `docs/milestones/Mx.md` per milestone** — at minimum **Goal / In scope / Out of scope / Architecture & decisions / Depends-on** + a `> Size: …` header. Full phase+subtask decomposition is **deferred** to B7 (don't write detailed phase plans for far-future milestones — their shape will shift as earlier ones land).

Then **self-review the set**: dependencies form a DAG (no cycles, no orphan milestone), every milestone has a Size, the architecture summary is consistent with each milestone's data needs, scope is the MVP not the moon. Fix inline.

### B6. User reviews the program
> "Program plan written and committed: `README.md`, `ROADMAP.md`, and `Mx.md` for each milestone. Review it and tell me what to change before I create the milestones + epics on GitHub."

Wait for approval; revise and re-review on feedback.

### B7. Create the GitHub structure
For **each** milestone in the set:
- A **milestone object** (`Mx · <title>`, one-line, optional due date from the roadmap).
- An **epic issue** (`Mx · <title> — EPIC`) whose body mirrors that milestone's `Mx.md`, with a `## Phases` placeholder if not yet decomposed.
- Add each epic to the board; set **Size** and **Status** (`Ready` for the first wave, `Backlog` for the rest); set the roadmap fields (Wave / Start / Target) if the project's board uses them. Resolve board/field IDs from the project `CLAUDE.md` or GraphQL.

### B8. Deep-decompose the starting wave (reuse Mode A)
Don't decompose all milestones up front. For the **first wave only** (typically `M0`, then `M1`/`M2`), run **Mode A steps A4 + A7** to break each into phases (`Mx.x`) + parallel subtasks (`Mx.x.x`) and create its phase issues. Recommend leaving later milestones at epic-outline level and decomposing each via **Mode A** when it's about to start — so you plan in detail only what you're about to build, never planning fiction.

### B9. Stop — hand off
Report: the program docs (`README.md`, `ROADMAP.md`), every milestone + epic created, which are fully decomposed vs outline-only, the wave plan, and the recommended starting point (usually **M0**). Then **stop** — no implementing, no PR, until the user gives the go.

---

## Key principles (both modes)
- **One question at a time; multiple-choice preferred.**
- **The stack is fixed — never brainstorm it.** Spend questions on behavior, data, and decomposition.
- **YAGNI ruthlessly** — cut speculative scope to Out-of-scope (Mode A) or a "later/maybe" list (Mode B) before it becomes a phase or a milestone.
- **Alternatives only where a real fork exists** — not for infra the stack already decides.
- **Subtasks in a phase must be parallel-safe** — independent, disjoint files; ordering becomes a phase boundary. The same logic scales up: **milestones in a wave must be parallel-safe.**
- **Foundation milestones recur** — on this stack every greenfield app starts with bootstrap → design system → auth; offer them as defaults.
- **Plan in detail only what you're about to build** — decompose the current milestone/wave fully; leave far-future milestones at outline level.
- **Scale to size** — don't spin up a milestone for an S-sized change, or a whole program for a single feature.
- **Terminal state is a ready board, not built code.**
