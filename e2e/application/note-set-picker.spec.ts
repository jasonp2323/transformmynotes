/**
 * [E2E] NoteSetPicker — multi-note generation entry points
 *
 * Drives the library multi-note generation flow + NoteSetPicker fully offline:
 *   1. Seeds three notes (Biology×2 + History×1) for the library user.
 *   2. "Generate Study Material" enters in-place selection mode (checkboxes).
 *   3. Library "Select all" checks every note + enables the generate CTA.
 *   4. "Generate from N notes" opens the picker at the "Choose format" step.
 *   5. Stepping back to note selection, search filters the picker list.
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

  // ── 2. "Generate Study Material" enters in-place selection mode ────────────────

  test('Generate Study Material enters library selection mode with checkboxes', async ({ page }) => {
    const runtime = readRuntime();
    await signIn(page, runtime);

    // Wait for note list to load
    await expect(page.getByText(NOTE_A_TITLE).first()).toBeVisible({ timeout: 15_000 });

    // Click "Generate Study Material" button to enter selection mode
    await page.getByRole('button', { name: 'Generate Study Material' }).first().click();

    // Header "Select all" checkbox + per-note checkboxes appear
    await expect(
      page.getByRole('checkbox', { name: 'Select all notes' }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('checkbox', { name: `Select ${NOTE_A_TITLE}` }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── 3. Library "Select all" checks every note ─────────────────────────────────

  test('library Select all checks all notes and enables the generate button', async ({ page }) => {
    const runtime = readRuntime();
    await signIn(page, runtime);

    await expect(page.getByText(NOTE_A_TITLE).first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Generate Study Material' }).first().click();

    // Click the library "Select all notes" checkbox
    await page.getByRole('checkbox', { name: 'Select all notes' }).first().click();

    // All three per-note checkboxes should be checked
    await expect(
      page.getByRole('checkbox', { name: `Select ${NOTE_A_TITLE}` }).first(),
    ).toBeChecked({ timeout: 5_000 });
    await expect(
      page.getByRole('checkbox', { name: `Select ${NOTE_B_TITLE}` }).first(),
    ).toBeChecked({ timeout: 5_000 });
    await expect(
      page.getByRole('checkbox', { name: `Select ${NOTE_C_TITLE}` }).first(),
    ).toBeChecked({ timeout: 5_000 });

    // The bottom CTA reflects the count
    await expect(
      page.getByRole('button', { name: 'Generate from 3 notes' }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── 4. "Generate from N notes" opens the picker at the format step ─────────────

  test('Generate from N notes opens NoteSetPicker at the Choose format step', async ({ page }) => {
    const runtime = readRuntime();
    await signIn(page, runtime);

    await expect(page.getByText(NOTE_A_TITLE).first()).toBeVisible({ timeout: 15_000 });

    // Enter selection mode and pick one note (click the card)
    await page.getByRole('button', { name: 'Generate Study Material' }).first().click();
    await page.getByText(NOTE_A_TITLE).first().click();

    // Open the picker — library flow jumps straight to the material-type step
    await page.getByRole('button', { name: /Generate from/ }).first().click();
    await expect(page.getByText('Choose format').first()).toBeVisible({ timeout: 10_000 });
  });

  // ── 5. Picker search filters after stepping back to note selection ─────────────

  test('picker search filters notes after stepping back to note selection', async ({ page }) => {
    const runtime = readRuntime();
    await signIn(page, runtime);

    await expect(page.getByText(NOTE_A_TITLE).first()).toBeVisible({ timeout: 15_000 });

    // Enter selection mode, select a note, open picker (lands on "Choose format")
    await page.getByRole('button', { name: 'Generate Study Material' }).first().click();
    await page.getByText(NOTE_A_TITLE).first().click();
    await page.getByRole('button', { name: /Generate from/ }).first().click();
    await expect(page.getByText('Choose format').first()).toBeVisible({ timeout: 10_000 });

    // Step back to the note-selection step
    await page.getByRole('button', { name: 'Back' }).first().click();
    await expect(page.getByText('Select notes').first()).toBeVisible({ timeout: 10_000 });

    // Search filters the note list
    await page.getByLabel('Search notes').fill('French');
    await expect(page.getByText(NOTE_C_TITLE).first()).toBeVisible({ timeout: 10_000 });
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
