---
name: check-tests
description: On-demand test audit. Scans the current branch diff for new/changed pure logic that lacks unit tests, runs `npm run test:unit`, and reports coverage gaps plus pass/fail. Use when the user asks to check test coverage, follow up on tests, or verify tests before pushing.
---

# check-tests — Unit Test Coverage Audit

> Advisory only. This skill reads the diff, identifies coverage gaps, and runs the existing test suite. It does NOT write tests automatically.

## Step 1 — Find what changed on this branch

```bash
git diff --name-only master...HEAD
```

Then inspect the full diff for new and modified source files:

```bash
git diff master...HEAD
```

Focus on:
- `packages/core/src/**/*.ts` — shared library, most likely to contain pure logic
- Any `*.ts` file (in any package) that exports standalone functions doing calculation, parsing, or data transformation

## Step 2 — Identify pure, unit-testable logic

Pure logic = functions that:
- Do calculations, parsing, string/data transforms, or sorting/filtering
- Build DynamoDB keys (`packages/core/src/db/keys.ts` — every PK/SK/GSI builder qualifies)
- Have NO dependency on `sst.Resource`, network calls, DynamoDB `DocumentClient`, React, or Next.js

**Skip** for coverage purposes:
- React components and Next.js route handlers
- Any function that imports from `sst/construct` or calls `Resource.*`
- DB client setup (`packages/core/src/db/client.ts`)

For each pure function found, check whether a `*.test.ts` file in `packages/core` already covers it. A test "covers" a function if it imports and calls that function directly.

## Step 3 — Run the unit test suite

From the repo root:

```bash
npm run test:unit
```

This runs the pure unit suite — no SST stage needed, no DynamoDB connection required. Capture the summary line (e.g. `6 passed`, `2 failed`).

> Note: `npm test -w packages/core` (which runs under `sst shell`) is reserved for future DB-bound integration tests. Do not run it here.

## Step 4 — Report findings

Structure the report as:

### Covered
- List each pure function (with `file:line`) that has a corresponding test. Keep it brief.

### Missing coverage
- List each pure function (with `file:line`) that has NO test. One bullet per gap.
- If none are missing, say so explicitly.

### Test suite result
- One line: `npm run test:unit` → e.g. `6 passed, 0 failed` or the failure summary.

## Step 5 — Advisory close

End with an offer, not an action:

> "I can write tests for the gaps above. Per this repo's conventions (CLAUDE.md), the actual writing would be dispatched to a Sonnet subagent. New unit tests live in `packages/core` as `*.test.ts` files and run via `npm run test:unit` — no SST stage needed. Want me to proceed?"

Do not create or modify any `*.test.ts` files unless the user explicitly says yes after reading this report.
