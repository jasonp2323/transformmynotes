/**
 * [E2E] library + note view
 *
 * Drives the library home and NoteView pages fully offline:
 *   1. Empty-state — asserts "Your notebook is empty" when the user has no notes.
 *   2. Recent list  — seeds two notes, reloads /dashboard, asserts both titles appear.
 *   3. Navigation   — taps a NoteCard, asserts URL matches /notes/ and title renders.
 *   4. Search       — types a distinctive word, asserts the matching note appears and
 *                     the non-matching note is absent.
 *
 * Uses a dedicated library test user (e2e-library@example.com) seeded by
 * global-setup with zero notes so the empty-state assertion is clean.
 * Token-index items are seeded manually (individual PutCommands) because dynalite
 * v4 does not support TransactWriteItems.
 *
 * The [E2E] tag in the describe title is the CI opt-in gate.
 */

import { test, expect } from '@playwright/test';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildNoteItem,
  buildTokenIndexItem,
  storageKeys,
  tokenise,
} from '@transformmynotes/core';
import { ulid } from 'ulid';
import { readRuntime, installSrpBypass } from './helpers';

// ── Note fixtures ─────────────────────────────────────────────────────────────

// Note A: "Spanish Subjunctive" — tokens include "spanish", "subjunctive"
const NOTE_A_TITLE = 'Spanish Subjunctive';
const NOTE_A_BODY = '## Spanish Subjunctive\n\nEl subjuntivo is a verb mood used in Spanish.';

// Note B: "Photosynthesis Overview" — "photosynthesis" is long, non-stopword, unique to B
const NOTE_B_TITLE = 'Photosynthesis Overview';
const NOTE_B_BODY =
  '## Photosynthesis Overview\n\nPhotosynthesis converts light energy into chemical energy.';

// Search term: one token from Note B that does NOT appear in Note A
const SEARCH_TERM = 'photosynthesis';

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe('[E2E] library + note view', () => {
  test.describe.configure({ mode: 'serial' });

  // Library is a mobile-first screen; AppShell renders BOTH a MobileShell and a
  // DesktopShell into the DOM. Run at a phone viewport so the MobileShell copy
  // (first in DOM order → .first()) is the visible one.
  test.use({ viewport: { width: 390, height: 844 } });

  // Mint stable noteIds once. Second call to ulid() is guaranteed lexicographically
  // >= first (monotonic factory) so noteIdB > noteIdA → B is "newer" in the list.
  const noteIdA = ulid();
  const noteIdB = ulid();

  // ── 1. Empty state ───────────────────────────────────────────────────────────

  test('empty state shows "Your notebook is empty"', async ({ page }) => {
    const runtime = readRuntime();

    await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
      [runtime.libraryUsername.toLowerCase()]: runtime.libraryPassword,
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill(runtime.libraryUsername);
    await page.getByLabel('Password').first().fill(runtime.libraryPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    // The library home fetches /api/notes on mount. With zero notes it renders
    // NotebookEmptyState which contains the h2 below.
    await expect(page.getByText('Your notebook is empty').first()).toBeVisible({ timeout: 15_000 });
  });

  // ── Seed two notes (runs before test 2, after empty-state assertion) ─────────

  test('seed notes A and B into DynamoDB + S3', async () => {
    const runtime = readRuntime();
    const sub = runtime.libraryUserSub;

    const dynamoClient = new DynamoDBClient({
      endpoint: `http://127.0.0.1:${runtime.dynalitePort}`,
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    const docClient = DynamoDBDocumentClient.from(dynamoClient);

    const s3 = new S3Client({
      endpoint: runtime.s3Endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER' },
    });

    try {
      for (const [noteId, title, body] of [
        [noteIdA, NOTE_A_TITLE, NOTE_A_BODY],
        [noteIdB, NOTE_B_TITLE, NOTE_B_BODY],
      ] as [string, string, string][]) {
        const bodyS3Key = storageKeys.noteMarkdown(sub, noteId);
        const originalImageS3Key = storageKeys.originalImage(sub, noteId);

        // Seed the main note item
        const noteItem = buildNoteItem({
          sub,
          noteId,
          title,
          tags: [],
          status: 'clean',
          words: 10,
          highlights: 0,
          langPair: 'en → en',
          ocrConfidence: 99,
          bodyS3Key,
          originalImageS3Key,
        });
        await docClient.send(
          new PutCommand({ TableName: runtime.notesTable, Item: noteItem }),
        );

        // Seed the markdown body in s3rver so NoteView can read it
        await s3.send(
          new PutObjectCommand({
            Bucket: runtime.notesBucket,
            Key: bodyS3Key,
            Body: body,
            ContentType: 'text/markdown',
          }),
        );

        // Seed one token-index item per token so GSI3 search works
        const tokens = tokenise(title);
        for (const token of tokens) {
          const tokenItem = buildTokenIndexItem({ token, sub, noteId });
          await docClient.send(
            new PutCommand({ TableName: runtime.notesTable, Item: tokenItem }),
          );
        }
      }
    } finally {
      docClient.destroy();
      dynamoClient.destroy();
      s3.destroy();
    }
  });

  // ── 2. Recent list + navigation ──────────────────────────────────────────────

  test('recent list shows both notes; clicking first note navigates to NoteView', async ({
    page,
  }) => {
    const runtime = readRuntime();

    // Re-install SRP bypass (each test gets a fresh page context in serial mode)
    await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
      [runtime.libraryUsername.toLowerCase()]: runtime.libraryPassword,
    });

    // Sign back in and navigate to /dashboard
    await page.goto('/login');
    await page.getByLabel('Email').fill(runtime.libraryUsername);
    await page.getByLabel('Password').first().fill(runtime.libraryPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    // Both note titles must appear in the Recent list
    await expect(page.getByText(NOTE_A_TITLE).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(NOTE_B_TITLE).first()).toBeVisible({ timeout: 15_000 });

    // Click Note B (newest, seeded with a higher ULID so listed first)
    await page.getByText(NOTE_B_TITLE).first().click();
    await expect(page).toHaveURL(/\/notes\//, { timeout: 15_000 });

    // NoteView renders the note title (from the NoteItem metadata)
    await expect(page.getByText(NOTE_B_TITLE).first()).toBeVisible({ timeout: 15_000 });
  });

  // ── 3. Search ────────────────────────────────────────────────────────────────

  test('search returns matching note and hides non-matching note', async ({ page }) => {
    const runtime = readRuntime();

    await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
      [runtime.libraryUsername.toLowerCase()]: runtime.libraryPassword,
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill(runtime.libraryUsername);
    await page.getByLabel('Password').first().fill(runtime.libraryPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    // Wait for the initial note list to load (both notes visible)
    await expect(page.getByText(NOTE_A_TITLE).first()).toBeVisible({ timeout: 15_000 });

    // Type the search term into the search input (aria-label on the Input)
    const searchInput = page.getByLabel('Search your notes').first();
    await searchInput.fill(SEARCH_TERM);

    // LibraryNotes debounces at 300 ms then fetches /api/notes?q=<term>
    // Note B contains "photosynthesis" → should be visible
    await expect(page.getByText(NOTE_B_TITLE).first()).toBeVisible({ timeout: 10_000 });

    // Note A does not contain "photosynthesis" → should not be visible.
    // (AppShell renders an independent LibraryNotes in each of the mobile +
    // desktop shells; only the visible mobile instance receives the search
    // input, so the hidden desktop copy still holds Note A — assert on
    // visibility, not raw count.)
    await expect(page.getByText(NOTE_A_TITLE).first()).toBeHidden({ timeout: 10_000 });
  });

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  test.afterAll(async () => {
    const runtime = readRuntime();
    const sub = runtime.libraryUserSub;

    const dynamoClient = new DynamoDBClient({
      endpoint: `http://127.0.0.1:${runtime.dynalitePort}`,
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    const docClient = DynamoDBDocumentClient.from(dynamoClient);

    const s3 = new S3Client({
      endpoint: runtime.s3Endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER' },
    });

    try {
      for (const [noteId, title] of [
        [noteIdA, NOTE_A_TITLE],
        [noteIdB, NOTE_B_TITLE],
      ] as [string, string][]) {
        // Delete token-index items
        for (const token of tokenise(title)) {
          try {
            await docClient.send(
              new DeleteCommand({
                TableName: runtime.notesTable,
                Key: {
                  pk: `USER#${sub}`,
                  sk: `TOKEN#${token}#NOTE#${noteId}`,
                },
              }),
            );
          } catch {
            // best-effort
          }
        }

        // Delete main note item
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

        // Delete markdown object from s3rver
        try {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: runtime.notesBucket,
              Key: storageKeys.noteMarkdown(sub, noteId),
            }),
          );
        } catch {
          // best-effort
        }
      }
    } finally {
      docClient.destroy();
      dynamoClient.destroy();
      s3.destroy();
    }
  });
});
