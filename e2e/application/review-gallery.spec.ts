/**
 * [E2E] review multi-page gallery (M26.3)
 *
 * Exercises the ReviewScreen gallery that renders when a batch review URL
 * carries two or more pageJobIds:
 *
 *   1. Sign in as the primary test user.
 *   2. Seed markdown + two page images into s3rver.
 *   3. Stub POST /api/notes/save (capture request body for assertion).
 *   4. Navigate to /capture/review?jobId=<pageId1>&pageJobIds=<pageId1>,<pageId2>.
 *   5. Assert the gallery list renders two thumbnails (Page 1, Page 2).
 *   6. Assert the lightbox opens on click and closes on Escape.
 *   7. Click "Save to notebook"; assert the captured body carries both image S3 keys.
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { storageKeys } from '@transformmynotes/core';
import { ulid } from 'ulid';
import { readRuntime, installSrpBypass } from './helpers';

test.describe('[E2E] review multi-page gallery (M26.3)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  // Two stable page job IDs for this suite — mint once at describe scope
  const pageId1 = ulid();
  const pageId2 = ulid();

  const screenshotDir = path.join(__dirname, '../../docs/verification/m26-3');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let page: any;
  // Captured request body from the stubbed /api/notes/save call
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let capturedSaveBody: any = null;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ── 1. Sign in ─────────────────────────────────────────────────────────────

  test('sign in', async () => {
    const runtime = readRuntime();

    await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
      [runtime.username.toLowerCase()]: runtime.password,
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill(runtime.username);
    await page.getByLabel('Password').first().fill(runtime.password);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });

  // ── 2. Seed s3rver ─────────────────────────────────────────────────────────

  test('seed markdown and page images into s3rver', async () => {
    const runtime = readRuntime();
    const sub = runtime.mainUserSub;

    const s3 = new S3Client({
      endpoint: runtime.s3Endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER' },
    });

    const fixturePath = path.join(__dirname, 'fixtures', 'handwriting.jpg');
    const imageBytes = fs.readFileSync(fixturePath);

    try {
      // Markdown for the primary page (the review SSR page reads this)
      await s3.send(
        new PutObjectCommand({
          Bucket: runtime.notesBucket,
          Key: storageKeys.noteMarkdown(sub, pageId1),
          Body: '## Page one\n\n---\n\n## Page two',
          ContentType: 'text/markdown',
        }),
      );

      // Original image for page 1
      await s3.send(
        new PutObjectCommand({
          Bucket: runtime.notesBucket,
          Key: storageKeys.originalImage(sub, pageId1),
          Body: imageBytes,
          ContentType: 'image/jpeg',
        }),
      );

      // Original image for page 2
      await s3.send(
        new PutObjectCommand({
          Bucket: runtime.notesBucket,
          Key: storageKeys.originalImage(sub, pageId2),
          Body: imageBytes,
          ContentType: 'image/jpeg',
        }),
      );
    } finally {
      s3.destroy();
    }
  });

  // ── 3. Stub /api/notes/save + navigate to gallery review ──────────────────

  test('stub save route and navigate to batch review page', async () => {
    // Stub POST /api/notes/save — capture the request body for later assertion
    await page.route('**/api/notes/save', async (route: import('@playwright/test').Route, request: import('@playwright/test').Request) => {
      if (request.method() === 'POST') {
        try {
          capturedSaveBody = JSON.parse(request.postData() ?? '{}');
        } catch {
          capturedSaveBody = null;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            noteId: pageId1,
            title: 'Page one',
            wordCount: 4,
            highlights: 0,
            langPair: 'en → en',
            ocrConfidence: 90,
          }),
        });
        return;
      }
      await route.continue();
    });

    // Navigate to the multi-page review URL
    const reviewUrl =
      `/capture/review?jobId=${encodeURIComponent(pageId1)}&pageJobIds=${encodeURIComponent(pageId1)},${encodeURIComponent(pageId2)}`;

    await page.goto(reviewUrl);

    // Wait for the page to render (Save button appears once SSR completes)
    await expect(
      page.getByRole('button', { name: 'Save to notebook' }),
    ).toBeVisible({ timeout: 30_000 });
  });

  // ── 4. Assert gallery renders two thumbnails ───────────────────────────────

  test('gallery renders two page thumbnails', async () => {
    // The gallery is a <ul role="list"> wrapping two <li role="listitem"> items
    const list = page.getByRole('list');
    await expect(list).toBeVisible({ timeout: 10_000 });

    const items = page.getByRole('listitem');
    await expect(items).toHaveCount(2, { timeout: 10_000 });

    // Each thumbnail is a <button aria-label="Page N">
    await expect(page.getByRole('button', { name: 'Page 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Page 2' })).toBeVisible();

    await page.screenshot({ path: path.join(screenshotDir, '01-gallery.png') });
  });

  // ── 5. Lightbox opens on click, closes on Escape ───────────────────────────

  test('lightbox opens for Page 2 and closes on Escape', async () => {
    // Click the Page 2 thumbnail to open the lightbox
    await page.getByRole('button', { name: 'Page 2' }).click();

    // The lightbox is a <div role="dialog" aria-label="Full-size image">
    const dialog = page.getByRole('dialog', { name: 'Full-size image' });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Close with Escape key
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });

  // ── 6. Save — body includes both image S3 keys ────────────────────────────

  test('Save to notebook sends both originalImageS3Keys', async () => {
    const runtime = readRuntime();
    const sub = runtime.mainUserSub;

    capturedSaveBody = null;

    // Click Save
    await page.getByRole('button', { name: 'Save to notebook' }).click();

    // Wait until the stub has captured the body (router.push triggers navigation)
    await expect
      .poll(() => capturedSaveBody, { timeout: 15_000 })
      .not.toBeNull();

    const expectedKeys = [
      storageKeys.originalImage(sub, pageId1),
      storageKeys.originalImage(sub, pageId2),
    ];

    expect(capturedSaveBody.originalImageS3Keys).toEqual(expectedKeys);

    await page.screenshot({ path: path.join(screenshotDir, '02-saved.png') });
  });
});
