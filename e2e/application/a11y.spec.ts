/**
 * [E2E] Accessibility axe scans — authed application routes
 *
 * Runs wcag2a/aa + wcag21a/aa axe scans on the major authed routes
 * accessible with the seeded test data provided by global-setup.ts.
 *
 * Per-route strategy:
 *  - /login                 — unauthenticated; reached without sign-in.
 *  - /dashboard             — sign in as main test user.
 *  - /capture               — sign in as main test user; capture page renders
 *                             without any uploaded note.
 *  - /review                — sign in as main test user; renders the deck
 *                             overview (zero or more due cards — either state
 *                             is valid for the axe scan).
 *  - /admin/pending         — sign in as admin user.
 *  - /admin/members         — sign in as admin user; navigated after pending.
 *  - /admin/invites         — sign in as admin user; navigated after pending.
 *
 * Skipped routes (comment explains why):
 *  - /notes/[noteId]        — requires a seeded note id known at test time.
 *                             library.spec seeds notes but runs in a separate
 *                             describe block with its own teardown; the note
 *                             ids are not exported to a shared fixture.
 *  - /capture/review        — requires a transcription job id created during
 *                             the capture upload flow; not seeded by global-setup.
 *  - /capture/success       — reached only after a successful save; not seeded.
 *
 * The [E2E] tag in the file name is the CI opt-in gate (commit message must
 * contain "[E2E]" for the authed E2E job to run).
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readRuntime, installSrpBypass } from './helpers';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// ── Shared sign-in helpers ────────────────────────────────────────────────────

async function signInAsMainUser(page: import('@playwright/test').Page) {
  const runtime = readRuntime();
  await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
    [runtime.username.toLowerCase()]: runtime.password,
  });
  await page.goto('/login');
  await page.getByLabel('Email').fill(runtime.username);
  await page.getByLabel('Password').first().fill(runtime.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

async function signInAsAdmin(page: import('@playwright/test').Page) {
  const runtime = readRuntime();
  await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
    [runtime.adminUsername.toLowerCase()]: runtime.adminPassword,
  });
  await page.goto('/login');
  await page.getByLabel('Email').fill(runtime.adminUsername);
  await page.getByLabel('Password').first().fill(runtime.adminPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

// ── Helper to run an axe scan and assert zero critical/serious violations ──────

async function assertNoSeriousViolations(
  page: import('@playwright/test').Page,
) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();

  const actionableViolations = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );

  expect(
    actionableViolations,
    actionableViolations
      .map((v) => `[${v.impact}] ${v.id}: ${v.description}`)
      .join('\n'),
  ).toHaveLength(0);
}

// ── /login (unauthenticated) ──────────────────────────────────────────────────

test('/login has no critical or serious a11y violations', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await assertNoSeriousViolations(page);
});

// ── /dashboard ────────────────────────────────────────────────────────────────

test('/dashboard has no critical or serious a11y violations', async ({ page }) => {
  await signInAsMainUser(page);
  await page.waitForLoadState('networkidle');
  await assertNoSeriousViolations(page);
});

// ── /capture ──────────────────────────────────────────────────────────────────

test('/capture has no critical or serious a11y violations', async ({ page }) => {
  await signInAsMainUser(page);
  await page.goto('/capture');
  await page.waitForLoadState('networkidle');
  await assertNoSeriousViolations(page);
});

// ── /review ───────────────────────────────────────────────────────────────────

test('/review has no critical or serious a11y violations', async ({ page }) => {
  await signInAsMainUser(page);
  await page.goto('/review');
  await page.waitForLoadState('networkidle');
  await assertNoSeriousViolations(page);
});

// ── /admin/pending ────────────────────────────────────────────────────────────

test('/admin/pending has no critical or serious a11y violations', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/pending');
  await page.waitForLoadState('networkidle');
  await assertNoSeriousViolations(page);
});

// ── /admin/members ────────────────────────────────────────────────────────────

test('/admin/members has no critical or serious a11y violations', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/members');
  await page.waitForLoadState('networkidle');
  await assertNoSeriousViolations(page);
});

// ── /admin/invites ────────────────────────────────────────────────────────────

test('/admin/invites has no critical or serious a11y violations', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/invites');
  await page.waitForLoadState('networkidle');
  await assertNoSeriousViolations(page);
});

// ── Skipped routes ────────────────────────────────────────────────────────────

test.skip('/notes/[noteId] — requires a seeded note id not available in this spec', async () => {
  // library.spec seeds notes under libraryUserSub but those note ids are minted
  // at library.spec describe-scope and are not exported. To scan a NoteView page,
  // a future test could seed a note here in beforeAll and clean it up in afterAll,
  // using buildNoteItem + PutCommand into DynamoDB (same pattern as library.spec).
});

test.skip('/capture/review — requires a transcription job id from a real upload', async () => {
  // The capture review page is only reachable after POSTing to /api/transcribe and
  // receiving a jobId. global-setup does not seed a transcription job, so this
  // route cannot be navigated to deterministically without intercepting the API.
});
