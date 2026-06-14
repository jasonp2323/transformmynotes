/**
 * [E2E] sharing round-trip
 *
 * Drives the full note-sharing flow fully offline, using dedicated share-owner
 * and share-recipient users seeded by global-setup. All services are started by
 * the Playwright globalSetup — no webServer config is used.
 *
 * Serial steps:
 *   1. Seed note    — write a NoteItem (with groupId) + S3 body.
 *   2. Owner shares — sign in as owner, open ShareSheet, pick recipient, confirm.
 *   3. Shared tab   — sign in as recipient, navigate to Shared tab, assert card visible.
 *   4. Read-only    — click the shared NoteCard, verify no Share button (read-only).
 *   5. Revoke       — sign in as owner, open ShareSheet, revoke access, confirm removed.
 *   6. Access gone  — sign in as recipient, Shared tab empty, API returns 403.
 *
 * The [E2E] tag in the describe title is the CI opt-in gate (required).
 */

import { test, expect } from '@playwright/test';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { buildNoteItem, storageKeys } from '@transformmynotes/core';
import { ulid } from 'ulid';
import { readRuntime, installSrpBypass } from './helpers';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOTE_TITLE = 'Mitochondria Deep Dive';
const NOTE_BODY =
  '## Mitochondria Deep Dive\n\nThe mitochondria is the powerhouse of the cell.';

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe('[E2E] sharing round-trip', () => {
  test.describe.configure({ mode: 'serial' });

  // AppShell renders BOTH a MobileShell and a DesktopShell into the DOM.
  // Run at a phone viewport so the MobileShell copy (first in DOM order → .first())
  // is the visible one — matching the pattern used by library.spec.ts.
  test.use({ viewport: { width: 390, height: 844 } });

  // Mint a stable noteId once at describe scope. ulid() is monotonic within a
  // module so this is called exactly once across all serial tests.
  const noteId = ulid();

  // ── 1. Seed note ─────────────────────────────────────────────────────────────

  test('seed note into DynamoDB + S3', async () => {
    const runtime = readRuntime();
    const ownerSub = runtime.shareOwnerSub;

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
      const bodyS3Key = storageKeys.noteMarkdown(ownerSub, noteId);
      const originalImageS3Key = storageKeys.originalImage(ownerSub, noteId);

      const noteItem = buildNoteItem({
        sub: ownerSub,
        noteId,
        title: NOTE_TITLE,
        tags: [],
        status: 'clean',
        words: 12,
        highlights: 0,
        langPair: 'en → en',
        ocrConfidence: 99,
        bodyS3Key,
        originalImageS3Key,
        groupId: runtime.shareGroupId,
      });

      await docClient.send(
        new PutCommand({ TableName: runtime.notesTable, Item: noteItem }),
      );

      await s3.send(
        new PutObjectCommand({
          Bucket: runtime.notesBucket,
          Key: bodyS3Key,
          Body: NOTE_BODY,
          ContentType: 'text/markdown',
        }),
      );
    } finally {
      docClient.destroy();
      dynamoClient.destroy();
      s3.destroy();
    }
  });

  // ── 2. Owner shares with recipient ───────────────────────────────────────────

  test('owner shares note with recipient via ShareSheet', async ({ page }) => {
    const runtime = readRuntime();

    await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
      [runtime.shareOwnerUsername.toLowerCase()]: runtime.shareOwnerPassword,
    });

    // Sign in as owner
    await page.goto('/login');
    await page.getByLabel('Email').fill(runtime.shareOwnerUsername);
    await page.getByLabel('Password').first().fill(runtime.shareOwnerPassword);
    // Wait for Turnstile widget to resolve (test sitekey fires onToken immediately via useEffect)
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    // Navigate directly to the note
    await page.goto(`/notes/${noteId}`);
    await expect(page.getByText(NOTE_TITLE).first()).toBeVisible({ timeout: 15_000 });

    // Click the Share action-bar IconButton (aria-label="Share", owner only).
    // Use getByRole('button') to avoid substring-matching the "Current shares" aria-label.
    // AppShell renders both mobile + desktop shells, so .first() targets the mobile copy.
    await page.getByRole('button', { name: 'Share' }).first().click();

    // Scope all further sheet interactions to the open dialog's inner .tmn-share-sheet div.
    // AppShell renders both mobile + desktop shells, so there are two ShareSheet instances.
    // Use 'dialog[open] .tmn-share-sheet' to target only the currently open dialog.
    const sheet = page.locator('dialog[open] .tmn-share-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    // Switch to "Specific members" mode
    await sheet.getByRole('radio', { name: 'Specific members' }).click();

    // Wait for the member rows to load
    await expect(sheet.locator('.tmn-share-sheet__member-row').first()).toBeVisible({
      timeout: 10_000,
    });

    // The Checkbox renders a <label> wrapping a hidden <input> + a visible <span>.
    // Scroll the <span class="tmn-check__box"> into view and click it to toggle
    // selection — this avoids the "element outside viewport" error that occurs when
    // interacting with the hidden <input> element directly.
    const checkboxSpan = sheet.locator('.tmn-check__box').first();
    await checkboxSpan.scrollIntoViewIfNeeded();
    await checkboxSpan.click();

    // Click the primary "Share" button inside the sheet
    await sheet.getByRole('button', { name: 'Share' }).click();

    // After a successful share the recipient row appears in "Currently shared with"
    // — the Revoke button becomes visible, confirming the API call succeeded.
    await expect(sheet.getByRole('button', { name: 'Revoke' })).toBeVisible({
      timeout: 15_000,
    });
  });

  // ── 3. Recipient sees it in the Shared tab ───────────────────────────────────

  test('recipient sees shared note in Shared tab', async ({ page }) => {
    const runtime = readRuntime();

    await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
      [runtime.shareRecipientUsername.toLowerCase()]: runtime.shareRecipientPassword,
    });

    // Sign in as recipient
    await page.goto('/login');
    await page.getByLabel('Email').fill(runtime.shareRecipientUsername);
    await page.getByLabel('Password').first().fill(runtime.shareRecipientPassword);
    // Wait for Turnstile widget to resolve (test sitekey fires onToken immediately via useEffect)
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    // Click the "Shared" tab radio in the SegmentedControl
    await page.getByRole('radio', { name: 'Shared' }).first().click();

    // The shared NoteCard for our note should appear
    await expect(page.getByText(NOTE_TITLE).first()).toBeVisible({ timeout: 15_000 });
  });

  // ── 4. Recipient opens note read-only ────────────────────────────────────────

  test('recipient opens shared note read-only (no Share button)', async ({ page }) => {
    const runtime = readRuntime();
    const ownerSub = runtime.shareOwnerSub;

    await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
      [runtime.shareRecipientUsername.toLowerCase()]: runtime.shareRecipientPassword,
    });

    // Sign in as recipient
    await page.goto('/login');
    await page.getByLabel('Email').fill(runtime.shareRecipientUsername);
    await page.getByLabel('Password').first().fill(runtime.shareRecipientPassword);
    // Wait for Turnstile widget to resolve (test sitekey fires onToken immediately via useEffect)
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    // Navigate to the Shared tab and click the NoteCard title
    await page.getByRole('radio', { name: 'Shared' }).first().click();
    await expect(page.getByText(NOTE_TITLE).first()).toBeVisible({ timeout: 15_000 });
    await page.getByText(NOTE_TITLE).first().click();

    // URL should contain the noteId and owner param
    await expect(page).toHaveURL(new RegExp(`/notes/${noteId}.*owner=${ownerSub}`), {
      timeout: 15_000,
    });

    // Note title should be visible
    await expect(page.getByText(NOTE_TITLE).first()).toBeVisible({ timeout: 10_000 });

    // The Share button (IconButton with aria-label="Share") must NOT be present —
    // isOwner is false for the recipient. Use getByRole('button') to avoid
    // matching the "Current shares" aria-label div.
    await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0);

    // Server-side check: GET /api/notes/<noteId>?owner=<ownerSub> should return 200
    const apiResp = await page.request.get(`/api/notes/${noteId}?owner=${ownerSub}`);
    expect(apiResp.status()).toBe(200);
  });

  // ── 5. Owner revokes access ──────────────────────────────────────────────────

  test('owner revokes recipient access via ShareSheet', async ({ page }) => {
    const runtime = readRuntime();

    await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
      [runtime.shareOwnerUsername.toLowerCase()]: runtime.shareOwnerPassword,
    });

    // Sign in as owner
    await page.goto('/login');
    await page.getByLabel('Email').fill(runtime.shareOwnerUsername);
    await page.getByLabel('Password').first().fill(runtime.shareOwnerPassword);
    // Wait for Turnstile widget to resolve (test sitekey fires onToken immediately via useEffect)
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    // Navigate to the note
    await page.goto(`/notes/${noteId}`);
    await expect(page.getByText(NOTE_TITLE).first()).toBeVisible({ timeout: 15_000 });

    // Open the ShareSheet — use getByRole('button') to avoid substring-matching
    // the "Current shares" aria-label div.
    await page.getByRole('button', { name: 'Share' }).first().click();

    const sheet = page.locator('dialog[open] .tmn-share-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    // The recipient row should show a Revoke button (previously shared)
    await expect(sheet.getByRole('button', { name: 'Revoke' })).toBeVisible({
      timeout: 15_000,
    });

    // Click Revoke → confirm row appears
    await sheet.getByRole('button', { name: 'Revoke' }).click();

    // "Remove access?" confirmation row — click Confirm
    await expect(sheet.getByText('Remove access?')).toBeVisible({ timeout: 5_000 });
    await sheet.getByRole('button', { name: 'Confirm' }).click();

    // After revoke the recipient row should disappear — Revoke button gone
    await expect(sheet.getByRole('button', { name: 'Revoke' })).toHaveCount(0, {
      timeout: 15_000,
    });
  });

  // ── 6. Recipient loses access ────────────────────────────────────────────────

  test('recipient loses access after revoke (empty Shared tab + 403)', async ({ page }) => {
    const runtime = readRuntime();
    const ownerSub = runtime.shareOwnerSub;

    await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
      [runtime.shareRecipientUsername.toLowerCase()]: runtime.shareRecipientPassword,
    });

    // Sign in as recipient
    await page.goto('/login');
    await page.getByLabel('Email').fill(runtime.shareRecipientUsername);
    await page.getByLabel('Password').first().fill(runtime.shareRecipientPassword);
    // Wait for Turnstile widget to resolve (test sitekey fires onToken immediately via useEffect)
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    // Navigate to the Shared tab — note should be gone
    await page.getByRole('radio', { name: 'Shared' }).first().click();
    await expect(page.getByText('No notes shared with you yet.').first()).toBeVisible({
      timeout: 15_000,
    });

    // Server-side check: GET /api/notes/<noteId>?owner=<ownerSub> should return 403
    const apiResp = await page.request.get(`/api/notes/${noteId}?owner=${ownerSub}`);
    expect(apiResp.status()).toBe(403);
  });

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  test.afterAll(async () => {
    const runtime = readRuntime();
    const ownerSub = runtime.shareOwnerSub;
    const recipientSub = runtime.shareRecipientSub;

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
      // Delete main note item
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: runtime.notesTable,
            Key: {
              pk: `USER#${ownerSub}`,
              sk: `NOTE#${noteId}`,
            },
          }),
        );
      } catch {
        // best-effort
      }

      // Delete share item (active or revoked) for the recipient
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: runtime.notesTable,
            Key: {
              pk: `USER#${ownerSub}`,
              sk: `SHARE#${noteId}#RECIPIENT#${recipientSub}`,
            },
          }),
        );
      } catch {
        // best-effort
      }

      // Delete markdown body from s3rver
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: runtime.notesBucket,
            Key: storageKeys.noteMarkdown(ownerSub, noteId),
          }),
        );
      } catch {
        // best-effort
      }
    } finally {
      docClient.destroy();
      dynamoClient.destroy();
      s3.destroy();
    }
  });
});
