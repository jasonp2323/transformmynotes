/**
 * [E2E] study — multi-source provenance
 *
 * Drives GenerateCardsScreen (/notes/[noteId]/generate-cards) with all three
 * study API endpoints intercepted via page.route(), so the suite runs fully
 * offline without a real DynamoDB-stream Lambda consumer (which the harness
 * does not provide).
 *
 * Two scenarios:
 *   1. Multi-source run  — sourceNoteIds has two entries.
 *      Assert "From: <title>" provenance labels are visible under each card.
 *   2. Single-source run — sourceNoteIds has one entry.
 *      Assert NO "From:" label is rendered (hidden per formatProvenance logic).
 *
 * Route-mocking pattern mirrors capture-flow.spec.ts:
 *   - Register /body BEFORE the broader meta route so the meta matcher never
 *     swallows /body requests (more-specific URL is registered first).
 *   - Generate route returns 202 + { studySetId }.
 *   - Meta route returns a ready StudySetMeta (status:'ready').
 *   - Body route returns the flashcard payload.
 *
 * The [E2E] tag in the describe title is the CI opt-in gate.
 */

import path from 'node:path';
import { test, expect } from '@playwright/test';
import { readRuntime, installSrpBypass } from './helpers';

// A stable fake noteId (any ULID-shaped string — the page doesn't validate it
// before firing the generate POST, and auth middleware only checks the JWT).
const FAKE_NOTE_ID = '01HZZZZZZZZZZZZZZZZZZZZZZ1';

// ── Shared sign-in helper ─────────────────────────────────────────────────────

async function signIn(page: import('@playwright/test').Page) {
  const runtime = readRuntime();
  await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
    [runtime.username.toLowerCase()]: runtime.password,
  });
  await page.goto('/login');
  await page.getByLabel('Email').fill(runtime.username);
  await page.getByLabel('Password').first().fill(runtime.password);
  // Wait for the Turnstile test sitekey to fire onToken (resolves immediately)
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe('[E2E] study — multi-source provenance', () => {
  test.describe.configure({ mode: 'serial' });

  // ── 1. Multi-source: provenance labels visible ───────────────────────────

  test('multi-source run shows "From:" provenance under each card', async ({ page }) => {
    await signIn(page);

    const STUDY_SET_ID = 'studyset-prov-1';

    // Register /body FIRST so it is matched before the broader meta route.
    await page.route(`**/api/study/${STUDY_SET_ID}/body`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'flashcards',
          payload: {
            cards: [
              {
                front: 'Card A front',
                back: 'Card A back — from Spanish Verbs only',
                sourceNoteIds: ['noteA'],
              },
              {
                front: 'Card AB front',
                back: 'Card AB back — from both notes',
                sourceNoteIds: ['noteA', 'noteB'],
              },
            ],
          },
        }),
      });
    });

    // Meta route for the study set (must NOT match /body — registered after /body).
    await page.route(
      (url) =>
        url.pathname === `/api/study/${STUDY_SET_ID}` ||
        url.pathname.endsWith(`/api/study/${STUDY_SET_ID}`),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            studySetId: STUDY_SET_ID,
            sourceNoteIds: ['noteA', 'noteB'],
            type: 'flashcards',
            title: 'Verbs Flashcards',
            status: 'ready',
            language: 'auto',
            model: 'claude-3-5-haiku-20241022',
            promptVersion: '1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            noteTitles: {
              noteA: 'Spanish Verbs',
              noteB: 'French Verbs',
            },
          }),
        });
      },
    );

    // Generate route: return 202 with the studySetId.
    await page.route('**/api/study/generate', async (route) => {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ studySetId: STUDY_SET_ID }),
      });
    });

    // Navigate to the generate-cards page — auth middleware checks JWT only.
    // Use 'domcontentloaded' so goto doesn't wait for background XHR polling to settle.
    await page.goto(`/notes/${FAKE_NOTE_ID}/generate-cards`, { waitUntil: 'domcontentloaded' });

    // Wait for cards to render (polls meta until status==='ready', then fetches /body).
    await expect(page.getByText('Card A front')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Card AB front')).toBeVisible({ timeout: 15_000 });

    // Card A: sourced from noteA only → "From: Spanish Verbs"
    await expect(page.getByText('From: Spanish Verbs').first()).toBeVisible();

    // Card AB: sourced from both → "From: Spanish Verbs, French Verbs"
    await expect(page.getByText('From: Spanish Verbs, French Verbs').first()).toBeVisible();

    // Capture evidence screenshot.
    await page.screenshot({
      path: path.join(__dirname, '../../docs/verification/m17-2-flashcard-provenance.png'),
      fullPage: true,
    });
  });

  // ── 2. Single-source: provenance labels hidden ───────────────────────────

  test('single-source run hides "From:" provenance', async ({ page }) => {
    await signIn(page);

    const STUDY_SET_ID = 'studyset-prov-2';

    // Register /body FIRST (before the broader meta route).
    await page.route(`**/api/study/${STUDY_SET_ID}/body`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'flashcards',
          payload: {
            cards: [
              {
                front: 'Single Card front',
                back: 'Single Card back',
                sourceNoteIds: ['noteA'],
              },
            ],
          },
        }),
      });
    });

    // Meta route — single source.
    await page.route(
      (url) =>
        url.pathname === `/api/study/${STUDY_SET_ID}` ||
        url.pathname.endsWith(`/api/study/${STUDY_SET_ID}`),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            studySetId: STUDY_SET_ID,
            sourceNoteIds: ['noteA'],
            type: 'flashcards',
            title: 'Spanish Verbs Flashcards',
            status: 'ready',
            language: 'auto',
            model: 'claude-3-5-haiku-20241022',
            promptVersion: '1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            noteTitles: {
              noteA: 'Spanish Verbs',
            },
          }),
        });
      },
    );

    // Generate route.
    await page.route('**/api/study/generate', async (route) => {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ studySetId: STUDY_SET_ID }),
      });
    });

    await page.goto(`/notes/${FAKE_NOTE_ID}/generate-cards`, { waitUntil: 'domcontentloaded' });

    // Card must render.
    await expect(page.getByText('Single Card front')).toBeVisible({ timeout: 15_000 });

    // No "From:" label should exist — formatProvenance returns null when totalSourceCount <= 1.
    await expect(page.getByText(/^From:/)).toHaveCount(0);
  });
});
