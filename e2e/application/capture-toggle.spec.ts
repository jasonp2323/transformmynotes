/**
 * [E2E] /capture — Single/Multi toggle + page tray (M26.2)
 *
 * Exercises:
 *  1. Default mode is Single (aria-pressed checks on toggle buttons)
 *  2. Switching to Multi reveals the Done button
 *  3. Uploading two pages via hidden file input appends tray thumbnails
 *  4. Reorder (move left) and delete operations work on the tray
 *  5. Done button navigates to /capture/review with batch jobId
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readRuntime, installSrpBypass } from './helpers';

test.describe('[E2E] capture single/multi toggle + page tray', () => {
  test.describe.configure({ mode: 'serial' });

  // Increase per-test timeout to cover global-setup boot + sign-in
  test.setTimeout(120_000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let page: any;
  let jobCounter = 0;
  const screenshotDir = path.join(__dirname, '../../docs/verification/m26-2');

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ── Sign in ────────────────────────────────────────────────────────────────

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

  // ── Install route stubs before navigating to /capture ────────────────────

  test('install stubs + navigate to /capture', async () => {
    const runtime = readRuntime();

    // Stub POST /api/notes/upload-url — returns a fake presigned URL + jobId
    await page.route('**/api/notes/upload-url', async (route, request) => {
      if (request.method() === 'POST') {
        jobCounter++;
        const jobId = `test-job-${String(jobCounter).padStart(3, '0')}`;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            presignedUrl: `${runtime.s3Endpoint}/notes-bucket/stub-key-${jobId}`,
            s3Key: `stub-key-${jobId}`,
            jobId,
          }),
        });
        return;
      }
      await route.continue();
    });

    // Stub PUT requests to s3rver (presigned URL targets)
    await page.route(
      (url) => url.href.startsWith(runtime.s3Endpoint),
      async (route, request) => {
        if (request.method() === 'OPTIONS') {
          await route.fulfill({
            status: 204,
            headers: {
              'access-control-allow-origin': '*',
              'access-control-allow-methods': 'PUT,GET,POST,OPTIONS',
              'access-control-allow-headers': '*',
            },
          });
          return;
        }
        await route.fulfill({
          status: 200,
          headers: { 'access-control-allow-origin': '*' },
        });
      },
    );

    // Stub POST /api/transcribe
    await page.route('**/api/transcribe', async (route, request) => {
      if (request.method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            markdown: '## test',
            wordCount: 5,
            detectedLang: 'en',
            ocrConfidence: 90,
            markdownS3Key: 'stub',
          }),
        });
        return;
      }
      await route.continue();
    });

    // Stub POST /api/transcribe/batch
    await page.route('**/api/transcribe/batch', async (route, request) => {
      if (request.method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ jobId: 'batch-job-001' }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/capture');
    // Wait for capture page to render (mode toggle should be visible)
    await expect(page.getByRole('button', { name: 'Single note' })).toBeVisible({ timeout: 15_000 });
  });

  // ── Test 1: Default is Single ─────────────────────────────────────────────

  test('Test 1 — default mode is Single', async () => {
    const singleBtn = page.getByRole('button', { name: 'Single note' });
    const multiBtn = page.getByRole('button', { name: 'Multi-page note' });

    // Single should be active (aria-pressed="true")
    await expect(singleBtn).toHaveAttribute('aria-pressed', 'true');
    // Multi should be inactive
    await expect(multiBtn).toHaveAttribute('aria-pressed', 'false');

    // Done button should NOT be visible in single mode
    const doneBtn = page.getByRole('button', { name: /Done/ });
    await expect(doneBtn).toHaveCount(0);

    await page.screenshot({ path: path.join(screenshotDir, '01-default-single.png') });
  });

  // ── Test 2: Switch to Multi ───────────────────────────────────────────────

  test('Test 2 — switch to Multi mode', async () => {
    const multiBtn = page.getByRole('button', { name: 'Multi-page note' });
    await multiBtn.click();

    // Multi should now be active
    await expect(multiBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Single note' })).toHaveAttribute('aria-pressed', 'false');

    // Done (0 pages) button should appear — disabled because 0 pages
    const doneBtn = page.getByRole('button', { name: /Done \(0 pages?\)/ });
    await expect(doneBtn).toBeVisible({ timeout: 5_000 });
    await expect(doneBtn).toBeDisabled();

    await page.screenshot({ path: path.join(screenshotDir, '02-switched-to-multi.png') });
  });

  // ── Test 3: Upload two pages via file input ───────────────────────────────

  test('Test 3 — upload two pages + tray assertions', async () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'handwriting.jpg');
    const fileInput = page.locator('input[type="file"]');
    const trayList = page.locator('[role="list"][aria-label="Captured pages"]');
    const trayItems = trayList.locator('[role="listitem"]');

    // Upload page 1
    await fileInput.setInputFiles(fixturePath);
    await expect(trayItems).toHaveCount(1, { timeout: 15_000 });

    // Upload page 2
    await fileInput.setInputFiles(fixturePath);
    await expect(trayItems).toHaveCount(2, { timeout: 15_000 });

    // "Done (2 pages)" button should be enabled
    const doneBtn = page.getByRole('button', { name: /Done \(2 pages?\)/ });
    await expect(doneBtn).toBeEnabled({ timeout: 5_000 });

    // Page number badges: index 0 → "1", index 1 → "2"
    await expect(trayItems.nth(0)).toContainText('1');
    await expect(trayItems.nth(1)).toContainText('2');

    // Reorder arrows: page 1 left arrow disabled, page 2 right arrow disabled
    await expect(page.getByRole('button', { name: 'Move page 1 left' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Move page 2 right' })).toBeDisabled();

    await page.screenshot({ path: path.join(screenshotDir, '03-two-pages-in-tray.png') });

    // Move page 2 left (swap page 2 and page 1)
    await page.getByRole('button', { name: 'Move page 2 left' }).click();

    // After swap: tray still has 2 items, index 0 badge is "1" (always position-based)
    await expect(trayItems).toHaveCount(2, { timeout: 5_000 });
    await expect(trayItems.nth(0)).toContainText('1');
    await expect(trayItems.nth(1)).toContainText('2');

    await page.screenshot({ path: path.join(screenshotDir, '04-after-reorder.png') });

    // Delete page 2 (second in list after reorder)
    await page.getByRole('button', { name: 'Remove page 2' }).click();
    await expect(trayItems).toHaveCount(1, { timeout: 5_000 });

    // Done button should now say "Done (1 page)"
    const done1Btn = page.getByRole('button', { name: /Done \(1 page\)/ });
    await expect(done1Btn).toBeEnabled({ timeout: 5_000 });

    await page.screenshot({ path: path.join(screenshotDir, '05-after-delete.png') });
  });

  // ── Test 4: Done navigates to batch review ────────────────────────────────

  test('Test 4 — Done navigates to batch review', async () => {
    const runtime = readRuntime();

    // Seed markdown into s3rver for the batch jobId so the review SSR page
    // can read it (otherwise GetObjectCommand returns NoSuchKey → redirect /capture).
    const s3 = new S3Client({
      endpoint: runtime.s3Endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER' },
    });
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: runtime.notesBucket,
          // The batch review page reads markdown/users/<sub>/batch-job-001.md
          Key: `markdown/users/${runtime.mainUserSub}/batch-job-001.md`,
          Body: '## Batch test note',
          ContentType: 'text/markdown',
        }),
      );
    } finally {
      s3.destroy();
    }

    // 1 page should still be in the tray from Test 3
    const done1Btn = page.getByRole('button', { name: /Done \(1 page\)/ });
    await expect(done1Btn).toBeEnabled({ timeout: 5_000 });

    await done1Btn.click();

    // buildBatchReviewUrl returns /capture/review?jobId=batch-job-001&pageJobIds=<pageJobId>
    // so the URL starts with /capture/review and includes jobId=batch-job-001
    await expect(page).toHaveURL(/\/capture\/review.*jobId=batch-job-001/, { timeout: 30_000 });

    await page.screenshot({ path: path.join(screenshotDir, '06-batch-review-navigate.png') });
  });
});
