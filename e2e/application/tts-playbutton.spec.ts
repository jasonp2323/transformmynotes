/**
 * M18.3 TTS play-button UI verification (opt-in `[E2E]` authed application suite).
 *
 * Reuses the offline authed harness (dynalite + cognito-local + s3rver) wired by
 * global-setup. Seeds one due card for the review test user, mocks the Polly
 * synthesize endpoint at the network layer, signs in headlessly, opens /review,
 * and asserts the play buttons render on the card front and back and call the
 * synthesize endpoint with the correct text.
 */

import { test, expect } from '@playwright/test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { buildCardItem, buildNoteItem, storageKeys } from '@transformmynotes/core';
import { ulid } from 'ulid';
import { readRuntime, installSrpBypass } from './helpers';

const NOTE_TITLE = 'TTS Verify Note';
const noteId = ulid();
const cardId = ulid();

test.describe('M18.3 TTS play button', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ viewport: { width: 390, height: 844 } });

  function docClient() {
    const runtime = readRuntime();
    const dynamoClient = new DynamoDBClient({
      endpoint: `http://127.0.0.1:${runtime.dynalitePort}`,
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    return { ddb: DynamoDBDocumentClient.from(dynamoClient), runtime, raw: dynamoClient };
  }

  async function signIn(page: import('@playwright/test').Page) {
    const runtime = readRuntime();
    await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
      [runtime.reviewUsername.toLowerCase()]: runtime.reviewPassword,
    });
    await page.goto('/login');
    await page.getByLabel('Email').fill(runtime.reviewUsername);
    await page.getByLabel('Password').first().fill(runtime.reviewPassword);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  }

  test('seed one due card', async () => {
    const { ddb, runtime, raw } = docClient();
    const sub = runtime.reviewUserSub;
    try {
      const pastIso = new Date(Date.now() - 60_000).toISOString();
      const noteItem = buildNoteItem({
        sub,
        noteId,
        title: NOTE_TITLE,
        tags: [],
        status: 'clean',
        words: 5,
        highlights: 1,
        langPair: 'es → en',
        ocrConfidence: 99,
        bodyS3Key: storageKeys.noteMarkdown(sub, noteId),
        originalImageS3Key: storageKeys.originalImage(sub, noteId),
      });
      await ddb.send(new PutCommand({ TableName: runtime.notesTable, Item: noteItem }));

      const card = buildCardItem({
        sub,
        cardId,
        sourceNoteId: noteId,
        front: 'hablar',
        back: 'to speak',
        dueAt: pastIso,
        createdAt: pastIso,
      });
      await ddb.send(new PutCommand({ TableName: runtime.notesTable, Item: card }));
    } finally {
      ddb.destroy();
      raw.destroy();
    }
  });

  test('play buttons render and call synthesize on front and back', async ({ page }) => {
    // ── Mock the Polly synthesize endpoint ──
    let synthesizeCalls = 0;
    const synthesizeBodies: string[] = [];
    await page.route('**/api/audio/synthesize', async (route, request) => {
      synthesizeCalls += 1;
      synthesizeBodies.push(request.postData() ?? '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, url: 'data:audio/mpeg;base64,', cached: false, charCount: 10 }),
      });
    });

    await signIn(page);
    await page.goto('/review');

    await expect(page.getByText('1 card due').first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Start review' }).click();

    // Card front visible
    await expect(
      page.getByRole('button', { name: 'Tap to reveal the answer' }),
    ).toBeVisible({ timeout: 10_000 });

    // ── Front play button + speed toggle ──
    const frontPlay = page.getByRole('button', { name: 'Play pronunciation', exact: true });
    const speedToggle = page.getByRole('group', { name: 'Playback speed' });
    const speedSlow = speedToggle.getByRole('button', { name: '0.8×' });
    const speedFast = speedToggle.getByRole('button', { name: '1×' });
    await expect(frontPlay).toBeVisible();
    await expect(speedToggle).toBeVisible();
    await expect(speedSlow).toBeVisible();
    await expect(speedFast).toBeVisible();

    // Screenshot of the front with the play button + speed toggle (evidence)
    await page.screenshot({ path: 'docs/verification/m18-3-review-playbutton.png' });

    // Select 0.8× then play; assert synthesize called with ssmlRate "slow"
    await speedSlow.click();
    await frontPlay.click();
    await expect.poll(() => synthesizeCalls, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(synthesizeBodies.some((b) => b.includes('"ssmlRate":"slow"'))).toBe(true);

    // Switch back to 1× then play; assert that play sends NO ssmlRate key
    const callsBeforeFast = synthesizeCalls;
    await speedFast.click();
    await frontPlay.click();
    await expect.poll(() => synthesizeCalls, { timeout: 5_000 }).toBeGreaterThan(callsBeforeFast);
    expect(synthesizeBodies.slice(callsBeforeFast).some((b) => !b.includes('ssmlRate'))).toBe(true);

    const callsAfterFront = synthesizeCalls;
    expect(synthesizeBodies.some((b) => b.includes('hablar'))).toBe(true);

    // ── Flip the card ──
    await page.getByRole('button', { name: 'Tap to reveal the answer' }).click();
    await expect(page.getByRole('button', { name: 'Card revealed' })).toBeVisible({ timeout: 5_000 });

    // Back play button appears (1 on front + 1 on back = 2 "Play pronunciation").
    const backPlay = page
      .locator('.tmn-deck-card__back-audio')
      .getByRole('button', { name: 'Play pronunciation', exact: true });
    await expect(backPlay).toBeVisible({ timeout: 5_000 });

    // Click back play; assert synthesize called again with back text
    await backPlay.click();
    await expect.poll(() => synthesizeCalls, { timeout: 5_000 }).toBeGreaterThan(callsAfterFront);
    expect(synthesizeBodies.some((b) => b.includes('to speak'))).toBe(true);
  });

  test.afterAll(async () => {
    const { ddb, runtime, raw } = docClient();
    const sub = runtime.reviewUserSub;
    try {
      await ddb.send(new DeleteCommand({
        TableName: runtime.notesTable,
        Key: { pk: `USER#${sub}`, sk: `CARD#${cardId}` },
      })).catch(() => {});
      await ddb.send(new DeleteCommand({
        TableName: runtime.notesTable,
        Key: { pk: `USER#${sub}`, sk: `NOTE#${noteId}` },
      })).catch(() => {});
    } finally {
      ddb.destroy();
      raw.destroy();
    }
  });
});
