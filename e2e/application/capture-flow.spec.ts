/**
 * [E2E] capture → review → save → NoteView
 *
 * Drives the full note-capture flow fully offline:
 *   1. Sign in
 *   2. Upload a JPEG via the hidden file input on /capture
 *   3. Intercept /api/transcribe to return fixture markdown + seed S3
 *   4. Assert the review editor renders the markdown + highlights
 *   5. Add a tag, save (intercepting /api/notes/save to work around dynalite's
 *      lack of TransactWriteItems — individual PutCommands used instead)
 *   6. Navigate to NoteView and assert rendered markdown + highlights
 *
 * The [E2E] tag in the describe title is the CI opt-in gate.
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { buildNoteItem, buildTagIndexItem, storageKeys } from '@transformmynotes/core';
import { readRuntime, installSrpBypass } from './helpers';

// ── Fixture markdown (canonical) ──────────────────────────────────────────────

const NOTE_MD = `## What is the subjunctive?

El ==subjuntivo== is a verb **mood** that expresses doubt, desire, emotion and possibility — not plain fact. It almost always lives in a subordinate clause introduced by *que*.

> Indicative states what *is*. Subjunctive colours what *might*, *should*, or *is wished* to be.

## The three regular patterns

Regular verbs swap their theme vowel. Learn the endings by infinitive group:

| Infinitive | yo form | Example |
| --- | --- | --- |
| hablar (-ar) | hable | que yo ==hable== |
| comer (-er) | coma | que yo ==coma== |
| vivir (-ir) | viva | que yo ==viva== |

## Common triggers

Memorise the phrases that *force* the subjunctive:

- **Wishes** — *querer que*, *ojalá que*
- **Doubt** — *dudar que*, *no creer que*
- **Emotion** — *me alegro de que*, *temer que*
- **Impersonal** — *es posible que*, *es importante que*

#### Watch out

When there is **no change of subject**, use the infinitive instead: *Quiero \`comer\`* — not *que yo coma*.`;

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe('[E2E] capture → review → save → NoteView', () => {
  test.describe.configure({ mode: 'serial' });

  let createdJobId: string | undefined;

  test('capture → review → save → NoteView full flow', async ({ page }) => {
    const runtime = readRuntime();

    // ── 1. Install SRP bypass + sign in ──────────────────────────────────────

    await installSrpBypass(page, runtime.cognitoEndpoint, runtime.clientId, {
      [runtime.username.toLowerCase()]: runtime.password,
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill(runtime.username);
    await page.getByLabel('Password').first().fill(runtime.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    // ── 2. Register interceptors before navigating to /capture ───────────────

    // Intercept the browser PUT to the presigned S3 URL (cross-origin from :3002).
    // The presigned URL points to s3rver at runtime.s3Endpoint.
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
        // Fulfill the PUT — image bytes are never read (transcribe is mocked)
        await route.fulfill({
          status: 200,
          headers: { 'access-control-allow-origin': '*' },
        });
      },
    );

    // Intercept /api/transcribe: capture jobId, seed fixture markdown into s3rver,
    // then return a mocked transcription result.
    await page.route('**/api/transcribe', async (route, request) => {
      const body = request.postDataJSON() as { jobId?: string };
      const jobId = body.jobId;
      if (jobId) {
        createdJobId = jobId;

        // Seed the fixture markdown into s3rver so the review SSR page can read it.
        // s3rver requires its hardcoded dummy credentials (see s3rver/lib/models/account.js).
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
              Key: `markdown/users/${runtime.mainUserSub}/${jobId}.md`,
              Body: NOTE_MD,
              ContentType: 'text/markdown',
            }),
          );
        } finally {
          s3.destroy();
        }
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          markdown: NOTE_MD,
          wordCount: 120,
          detectedLang: 'pt-BR → en',
          ocrConfidence: 95,
          markdownS3Key: `markdown/users/${runtime.mainUserSub}/${jobId}.md`,
        }),
      });
    });

    // Intercept /api/notes/save to work around dynalite's lack of TransactWriteItems.
    // Dynalite v4 does not implement TransactWriteItems; putNote() uses it. Instead we
    // write the note item + tag-index items individually using PutCommand, then respond
    // with the same shape the real route returns so the client navigates to /capture/success.
    await page.route('**/api/notes/save', async (route, request) => {
      const body = request.postDataJSON() as {
        jobId?: string;
        title?: string;
        markdown?: string;
        tags?: string[];
      };
      const { jobId, title = 'Untitled note', markdown = NOTE_MD, tags = [] } = body;
      const sub = runtime.mainUserSub;
      const noteId = jobId ?? createdJobId ?? 'unknown';

      // Build note item and tag-index items using the same builders as production.
      const noteItem = buildNoteItem({
        sub,
        noteId,
        title: title || 'Untitled note',
        tags,
        status: 'clean',
        words: 120,
        highlights: 4, // ==subjuntivo== ==hable== ==coma== ==viva==
        langPair: 'pt-BR → en',
        ocrConfidence: 95,
        bodyS3Key: storageKeys.noteMarkdown(sub, noteId),
        originalImageS3Key: storageKeys.originalImage(sub, noteId),
      });

      // Write the markdown to S3 (so NoteView can read it back via GetObject).
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
            Key: storageKeys.noteMarkdown(sub, noteId),
            Body: markdown,
            ContentType: 'text/markdown',
          }),
        );
      } finally {
        s3.destroy();
      }

      // Write note item and tag-index items to dynalite using individual PutCommands
      // (TransactWriteItems is not supported by dynalite v4).
      const dynamoClient = new DynamoDBClient({
        endpoint: `http://127.0.0.1:${runtime.dynalitePort}`,
        region: 'us-east-1',
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      });
      const docClient = DynamoDBDocumentClient.from(dynamoClient);
      try {
        await docClient.send(
          new PutCommand({ TableName: runtime.notesTable, Item: noteItem }),
        );
        for (const tag of tags) {
          const tagItem = buildTagIndexItem({ tag, sub, noteId });
          await docClient.send(
            new PutCommand({ TableName: runtime.notesTable, Item: tagItem }),
          );
        }
      } finally {
        docClient.destroy();
        dynamoClient.destroy();
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          noteId,
          title: title || 'Untitled note',
          wordCount: 120,
          highlights: 4,
          langPair: 'pt-BR → en',
          ocrConfidence: 95,
        }),
      });
    });

    // ── 3. Navigate to /capture and upload the fixture JPEG ──────────────────

    await page.goto('/capture');

    // The hidden file input is always in the DOM regardless of camera availability.
    await page.locator('input[type="file"]').setInputFiles(
      path.join(__dirname, 'fixtures', 'handwriting.jpg'),
    );

    // ── 4. Assert navigation to /capture/review ───────────────────────────────

    await expect(page).toHaveURL(/\/capture\/review/, { timeout: 30_000 });

    // The editor must render the fixture heading
    await expect(page.getByText('What is the subjunctive?').first()).toBeVisible();

    // A highlight <mark> element must be present (==subjuntivo== → <mark>)
    await expect(page.locator('mark').first()).toBeVisible();

    // ── 5. Add a tag ──────────────────────────────────────────────────────────

    await page.getByText('+ add tag').click();
    const tagInput = page.getByLabel('Add tag');
    await tagInput.fill('e2e-tag');
    await tagInput.press('Enter');
    await expect(page.getByText('e2e-tag')).toBeVisible();

    // ── 6. Save ───────────────────────────────────────────────────────────────

    await page.getByRole('button', { name: 'Save to notebook' }).click();
    await expect(page).toHaveURL(/\/capture\/success/, { timeout: 30_000 });

    // Success screen assertions
    await expect(page.getByText('Saved to your notebook')).toBeVisible();
    // Title derived from the first ## heading
    await expect(page.getByText('What is the subjunctive?').first()).toBeVisible();

    // ── 7. View note → NoteView ───────────────────────────────────────────────

    await page.getByRole('button', { name: 'View note' }).click();
    await expect(page).toHaveURL(new RegExp('/notes/'), { timeout: 30_000 });

    // NoteView must render the heading and a highlight mark
    await expect(page.getByText('What is the subjunctive?').first()).toBeVisible();
    await expect(page.locator('mark').first()).toBeVisible();

    // ── 8. Note appears in dashboard library ──────────────────────────────────

    // The saved note must surface in the library list on /dashboard (LibraryNotes
    // fetches /api/notes → listUserNotes, which returns it via the GSI1 recency keys).
    // AppShell renders BOTH a MobileShell and a DesktopShell into the DOM; at this
    // suite's Desktop Chrome viewport the MobileShell copy (first in DOM order) is
    // display:none, so scope to the visible <main> before matching the title.
    await page.goto('/dashboard');
    await expect(
      page.locator('main:visible').getByText('What is the subjunctive?').first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  test.afterAll(async () => {
    if (!createdJobId) return;

    const runtime = readRuntime();

    // Delete DynamoDB records
    try {
      const dynamoClient = new DynamoDBClient({
        endpoint: `http://127.0.0.1:${runtime.dynalitePort}`,
        region: 'us-east-1',
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      });
      const docClient = DynamoDBDocumentClient.from(dynamoClient);

      // Main note item
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: runtime.notesTable,
            Key: {
              pk: `USER#${runtime.mainUserSub}`,
              sk: `NOTE#${createdJobId}`,
            },
          }),
        );
      } catch {
        // best-effort
      }

      // Tag-index item
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: runtime.notesTable,
            Key: {
              pk: 'TAG#e2e-tag',
              sk: `USER#${runtime.mainUserSub}#NOTE#${createdJobId}`,
            },
          }),
        );
      } catch {
        // best-effort
      }

      // Transcription job item
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: 'UserData',
            Key: {
              pk: `USER#${runtime.mainUserSub}`,
              sk: `JOB#${createdJobId}`,
            },
          }),
        );
      } catch {
        // best-effort
      }

      docClient.destroy();
      dynamoClient.destroy();
    } catch {
      // best-effort
    }

    // Delete the markdown object from s3rver
    try {
      const s3 = new S3Client({
        endpoint: runtime.s3Endpoint,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER' },
      });
      await s3.send(
        new DeleteObjectCommand({
          Bucket: runtime.notesBucket,
          Key: `markdown/users/${runtime.mainUserSub}/${createdJobId}.md`,
        }),
      );
      s3.destroy();
    } catch {
      // best-effort
    }
  });
});
