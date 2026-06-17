/**
 * [E2E] NoteSetPicker — multi-note generation entry points
 *
 * Drives the NoteSetPicker modal from the library dashboard fully offline:
 *   1. Seeds three notes (Biology×2 + History×1) for the library user.
 *   2. Opens the picker from "Generate from notes" and asserts the recent list.
 *   3. Searches and asserts filtering works.
 *   4. Uses notebook quick-select ("All in Biology") and asserts checkboxes.
 *   5. Selects a note, sees it as a chip, removes it, confirms it's gone.
 *
 * Uses a dedicated library test user (e2e-library@example.com) seeded by
 * global-setup. Token-index items are seeded manually (individual PutCommands)
 * because dynalite v4 does not support TransactWriteItems.
 *
 * The [E2E] tag in the describe title is the CI opt-in gate.
 */

import { test, expect, type Page } from '@playwright/test';
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

const NOTE_A_TITLE = 'Cell Division Notes';
const NOTE_A_BODY = '## Cell Division Notes\n\nMitosis and meiosis are two types of cell division.';
const NOTE_A_GROUP = 'Biology';
const NOTE_A_WORDS = 15;

const NOTE_B_TITLE = 'Photosynthesis Lab';
const NOTE_B_BODY = '## Photosynthesis Lab\n\nChlorophyll absorbs light energy for photosynthesis.';
const NOTE_B_GROUP = 'Biology';
const NOTE_B_WORDS = 12;

const NOTE_C_TITLE = 'French Revolution';
const NOTE_C_BODY = '## French Revolution\n\nThe French Revolution began in 1789.';
const NOTE_C_GROUP = 'History';
const NOTE_C_WORDS = 10;

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe('[E2E] NoteSetPicker', () => {
  test.describe.configure({ mode: 'serial' });

  test.use({ viewport: { width: 390, height: 844 } });

  // Mint stable noteIds once (monotonic ULID → C > B > A in recency order)
  const noteIdA = ulid();
  const noteIdB = ulid();
  const noteIdC = ulid();

  // ── 1. Seed notes ────────────────────────────────────────────────────────────

  test('seed notes A, B, C into DynamoDB + S3', async () => {
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
      for (const [noteId, title, body, groupId, words] of [
        [noteIdA, NOTE_A_TITLE, NOTE_A_BODY, NOTE_A_GROUP, NOTE_A_WORDS],
        [noteIdB, NOTE_B_TITLE, NOTE_B_BODY, NOTE_B_GROUP, NOTE_B_WORDS],
        [noteIdC, NOTE_C_TITLE, NOTE_C_BODY, NOTE_C_GROUP, NOTE_C_WORDS],
      ] as [string, string, string, string, number][]) {
        const bodyS3Key = storageKeys.noteMarkdown(sub, noteId);
        const originalImageS3Key = storageKeys.originalImage(sub, noteId);

        // Seed main note item
        const noteItem = buildNoteItem({
          sub,
          noteId,
          title,
          tags: [],
          status: 'clean',
          words,
          highlights: 0,
          langPair: 'en → en',
          ocrConfidence: 99,
          bodyS3Key,
          originalImageS3Key,
          groupId,
        });
        await docClient.send(
          new PutCommand({ TableName: runtime.notesTable, Item: noteItem }),
        );

        // Seed markdown body in s3rver
        await s3.send(
          new PutObjectCommand({
            Bucket: runtime.notesBucket,
            Key: bodyS3Key,
            Body: body,
            ContentType: 'text/markdown',
          }),
        );

        // Seed token-index items so GSI3 search works
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

  // ── Helper: sign in ──────────────────────────────────────────────────────────

  async function signIn(page: Page, runtime: ReturnType<typeof readRuntime>) {
    await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
      [runtime.libraryUsername.toLowerCase()]: runtime.libraryPassword,
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill(runtime.libraryUsername);
    await page.getByLabel('Password').first().fill(runtime.libraryPassword);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  }

  // ── 2. Opens picker and shows recent notes ────────────────────────────────────

  test('opens NoteSetPicker from library and shows recently edited notes', async ({ page }) => {
    const runtime = readRuntime();
    await signIn(page, runtime);

    // Wait for note list to load
    await expect(page.getByText(NOTE_A_TITLE).first()).toBeVisible({ timeout: 15_000 });

    // Click "Generate from notes" button
    await page.getByRole('button', { name: 'Generate from notes' }).first().click();

    // Dialog should open — look for "Select notes" or "Recently edited"
    await expect(page.getByText('Select notes').first()).toBeVisible({ timeout: 10_000 });

    // Both Biology notes should be visible in the dialog
    await expect(page.getByText(NOTE_A_TITLE).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(NOTE_B_TITLE).first()).toBeVisible({ timeout: 10_000 });
  });

  // ── 3. Search filters notes ───────────────────────────────────────────────────

  test('search filters notes in picker', async ({ page }) => {
    const runtime = readRuntime();
    await signIn(page, runtime);

    // Wait for note list
    await expect(page.getByText(NOTE_A_TITLE).first()).toBeVisible({ timeout: 15_000 });

    // Open picker
    await page.getByRole('button', { name: 'Generate from notes' }).first().click();
    await expect(page.getByText('Select notes').first()).toBeVisible({ timeout: 10_000 });

    // Fill in search
    await page.getByLabel('Search notes').fill('French');

    // French Revolution should appear
    await expect(page.getByText(NOTE_C_TITLE).first()).toBeVisible({ timeout: 10_000 });

    // Cell Division Notes should not be visible
    await expect(page.getByText(NOTE_A_TITLE).first()).toBeHidden({ timeout: 10_000 });
  });

  // ── 4. Notebook quick-select ──────────────────────────────────────────────────

  test('notebook quick-select checks all notes in group', async ({ page }) => {
    const runtime = readRuntime();
    await signIn(page, runtime);

    // Wait for note list
    await expect(page.getByText(NOTE_A_TITLE).first()).toBeVisible({ timeout: 15_000 });

    // Open picker
    await page.getByRole('button', { name: 'Generate from notes' }).first().click();
    await expect(page.getByText('Recently edited').first()).toBeVisible({ timeout: 10_000 });

    // Click "All in Biology"
    await page.getByRole('button', { name: 'All in Biology' }).first().click();

    // Both Biology notes' checkboxes should be checked
    await expect(
      page.getByRole('checkbox', { name: NOTE_A_TITLE }).first(),
    ).toBeChecked({ timeout: 5_000 });
    await expect(
      page.getByRole('checkbox', { name: NOTE_B_TITLE }).first(),
    ).toBeChecked({ timeout: 5_000 });
  });

  // ── 5. Deselect removes chip ──────────────────────────────────────────────────

  test('deselect removes chip', async ({ page }) => {
    const runtime = readRuntime();
    await signIn(page, runtime);

    // Wait for note list
    await expect(page.getByText(NOTE_A_TITLE).first()).toBeVisible({ timeout: 15_000 });

    // Open picker
    await page.getByRole('button', { name: 'Generate from notes' }).first().click();
    await expect(page.getByText('Select notes').first()).toBeVisible({ timeout: 10_000 });

    // Click the checkbox for NOTE_A
    await page.getByRole('checkbox', { name: NOTE_A_TITLE }).first().click();

    // Wait for chip to appear
    await expect(
      page.getByRole('button', { name: `Remove ${NOTE_A_TITLE}` }).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Click the X button on the chip
    await page.getByRole('button', { name: `Remove ${NOTE_A_TITLE}` }).first().click();

    // Chip should be gone
    await expect(
      page.getByRole('button', { name: `Remove ${NOTE_A_TITLE}` }).first(),
    ).toBeHidden({ timeout: 5_000 });

    // Checkbox should be unchecked
    await expect(
      page.getByRole('checkbox', { name: NOTE_A_TITLE }).first(),
    ).not.toBeChecked({ timeout: 5_000 });
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
        [noteIdC, NOTE_C_TITLE],
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
