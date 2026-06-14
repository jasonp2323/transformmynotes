/**
 * [E2E] review round-trip
 *
 * Drives the full flashcard review deck fully offline (dynalite + cognito-local
 * + s3rver, no AWS):
 *
 *   1. Sign in headlessly as the dedicated review test user.
 *   2. Seed one note item + two CARD items (both with dueAt in the past) into
 *      DynamoDB via individual PutCommands (dynalite v4 does not support
 *      TransactWriteItems).
 *   3. Navigate to /dashboard; assert the DueCountGreeting shows "2 cards".
 *   4. Navigate to /review; assert the deck overview shows "2 cards due".
 *   5. Click "Start review"; for each of the 2 cards: flip the card, then
 *      click "Good" (grade 3) → SM-2 scheduler pushes dueAt ~6 days forward.
 *   6. After both cards are graded, ReviewDeck re-fetches /api/cards/due, finds
 *      none, and renders the "All caught up" empty state.
 *   7. Navigate back to /dashboard; assert the greeting count decreased to 0.
 *   8. Clean up seeded DynamoDB items in afterAll.
 *
 * Uses a dedicated review test user (e2e-review@example.com) seeded by
 * global-setup with zero cards so the initial count assertions are clean.
 *
 * The [E2E] tag in the describe title is the CI opt-in gate.
 */

import { test, expect } from '@playwright/test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { buildCardItem, buildNoteItem, storageKeys } from '@transformmynotes/core';
import { ulid } from 'ulid';
import { readRuntime, installSrpBypass } from './helpers';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOTE_TITLE = 'Spanish Verbs';

// Mint stable IDs once at describe scope (monotonic ulid ensures noteId < cardId1 < cardId2)
const noteId = ulid();
const cardId1 = ulid();
const cardId2 = ulid();

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe('[E2E] review round-trip', () => {
  test.describe.configure({ mode: 'serial' });

  // Mobile-first viewport — AppShell renders both MobileShell and DesktopShell;
  // use .first() on text matchers to hit the visible mobile copy.
  test.use({ viewport: { width: 390, height: 844 } });

  // ── Sign-in helper ────────────────────────────────────────────────────────

  async function signIn(page: import('@playwright/test').Page) {
    const runtime = readRuntime();
    await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
      [runtime.reviewUsername.toLowerCase()]: runtime.reviewPassword,
    });
    await page.goto('/login');
    await page.getByLabel('Email').fill(runtime.reviewUsername);
    await page.getByLabel('Password').first().fill(runtime.reviewPassword);
    // Wait for Turnstile widget to resolve (test sitekey fires onToken immediately via useEffect)
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  }

  // ── 1. Seed note + 2 due cards ───────────────────────────────────────────

  test('seed note and 2 due cards into DynamoDB', async () => {
    const runtime = readRuntime();
    const sub = runtime.reviewUserSub;

    const dynamoClient = new DynamoDBClient({
      endpoint: `http://127.0.0.1:${runtime.dynalitePort}`,
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    const docClient = DynamoDBDocumentClient.from(dynamoClient);

    try {
      const now = new Date();
      const pastIso = new Date(now.getTime() - 60_000).toISOString();
      const createdAt = pastIso;

      const bodyS3Key = storageKeys.noteMarkdown(sub, noteId);
      const originalImageS3Key = storageKeys.originalImage(sub, noteId);

      // Seed the note item so /api/notes returns it and the deck overview can
      // show its title grouped under the two cards.
      const noteItem = buildNoteItem({
        sub,
        noteId,
        title: NOTE_TITLE,
        tags: [],
        status: 'clean',
        words: 5,
        highlights: 2,
        langPair: 'en → en',
        ocrConfidence: 99,
        bodyS3Key,
        originalImageS3Key,
      });
      await docClient.send(
        new PutCommand({ TableName: runtime.notesTable, Item: noteItem }),
      );

      // Card 1 — both cards sourced from the seeded note, due in the past
      const card1 = buildCardItem({
        sub,
        cardId: cardId1,
        sourceNoteId: noteId,
        front: 'hablar',
        back: 'to speak',
        dueAt: pastIso,
        createdAt,
      });
      await docClient.send(
        new PutCommand({ TableName: runtime.notesTable, Item: card1 }),
      );

      // Card 2
      const card2 = buildCardItem({
        sub,
        cardId: cardId2,
        sourceNoteId: noteId,
        front: 'comer',
        back: 'to eat',
        dueAt: pastIso,
        createdAt,
      });
      await docClient.send(
        new PutCommand({ TableName: runtime.notesTable, Item: card2 }),
      );
    } finally {
      docClient.destroy();
      dynamoClient.destroy();
    }
  });

  // ── 2. Dashboard shows "2 cards" in greeting ──────────────────────────────

  test('dashboard greeting shows 2 cards ready to review', async ({ page }) => {
    await signIn(page);

    // DueCountGreeting fetches /api/cards/due-count on mount and renders:
    // "Welcome back, <user> — <N> cards ready to review."
    // The count is wrapped in a HighlightText span; assert the count is visible.
    await expect(page.getByText(/2 cards/).first()).toBeVisible({ timeout: 15_000 });
  });

  // ── 3. Review overview shows "2 cards due" ────────────────────────────────

  test('review overview shows 2 cards due', async ({ page }) => {
    await signIn(page);
    await page.goto('/review');

    // DeckOverview renders: "2 cards due" as the h1 heading
    await expect(page.getByText('2 cards due').first()).toBeVisible({ timeout: 15_000 });
  });

  // ── 4. Full review session — grade both cards Good ────────────────────────

  test('reviewing both cards Good shows "All caught up" empty state', async ({ page }) => {
    await signIn(page);
    await page.goto('/review');

    // Wait for overview to load
    await expect(page.getByText('2 cards due').first()).toBeVisible({ timeout: 15_000 });

    // Start the session
    await page.getByRole('button', { name: 'Start review' }).click();

    // Grade each card: flip → click Good
    for (let i = 0; i < 2; i++) {
      // Card surface is a div[role="button"] with aria-label "Tap to reveal the answer"
      await expect(
        page.getByRole('button', { name: 'Tap to reveal the answer' }),
      ).toBeVisible({ timeout: 10_000 });

      await page.getByRole('button', { name: 'Tap to reveal the answer' }).click();

      // Grade buttons appear after flip; "Good" sends grade 3
      await expect(
        page.getByRole('button', { name: 'Grade Good — you remembered correctly' }),
      ).toBeVisible({ timeout: 5_000 });

      await page.getByRole('button', { name: 'Grade Good — you remembered correctly' }).click();
    }

    // After grading both cards Good, dueAt is ~6 days in the future for both.
    // ReviewDeck re-fetches /api/cards/due and finds 0 → renders DeckAllDone.
    await expect(page.getByRole('heading', { name: 'All caught up' }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText('All caught up — check back tomorrow.').first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── 5. Dashboard greeting decreases to 0 ─────────────────────────────────

  test('dashboard greeting shows 0 cards after reviewing all', async ({ page }) => {
    await signIn(page);

    // Navigate to dashboard fresh — the DueCountGreeting re-fetches on mount.
    // The /api/cards/due-count route sends `private, max-age=60`; a fresh page
    // navigation via page.goto() bypasses the browser HTTP cache (Playwright
    // navigates without reusing cached responses for full navigations).
    await page.goto('/dashboard');

    // DueCountGreeting renders "0 cards ready to review" when count is 0.
    // If the assertion is flaky due to the 60s cache, page.reload() forces
    // a cache-busting re-fetch.
    await expect(page.getByText(/0 cards/).first()).toBeVisible({ timeout: 15_000 });
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  test.afterAll(async () => {
    const runtime = readRuntime();
    const sub = runtime.reviewUserSub;

    const dynamoClient = new DynamoDBClient({
      endpoint: `http://127.0.0.1:${runtime.dynalitePort}`,
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    const docClient = DynamoDBDocumentClient.from(dynamoClient);

    try {
      // Delete the two card items
      for (const cardId of [cardId1, cardId2]) {
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: runtime.notesTable,
              Key: {
                pk: `USER#${sub}`,
                sk: `CARD#${cardId}`,
              },
            }),
          );
        } catch {
          // best-effort
        }
      }

      // Delete the note item
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: runtime.notesTable,
            Key: {
              pk: `USER#${sub}`,
              sk: `NOTE#${noteId}`,
            },
          }),
        );
      } catch {
        // best-effort
      }
    } finally {
      docClient.destroy();
      dynamoClient.destroy();
    }
  });
});
