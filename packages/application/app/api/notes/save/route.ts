import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import {
  storageKeys,
  getTranscriptionJob,
  updateTranscriptionJobStatus,
  putNote,
  putNoteTokens,
  tokenise,
  postprocessMarkdown,
  countHighlights,
  syncCardsForNote,
  putStorageDeltaEvent,
} from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requireBucketName(): string {
  const value = process.env.SST_RESOURCE_NotesBucket_name;
  if (!value) {
    throw new Error(
      'Missing required env var SST_RESOURCE_NotesBucket_name: the S3 bucket name is not bound. ' +
        'Expected it from the SST resource link (production) or the test harness.',
    );
  }
  return value;
}

export async function POST(req: Request) {
  // Auth: verify the Cognito ID token and extract the sub.
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Parse JSON body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid request body.' },
      { status: 400 },
    );
  }

  const { jobId, title, markdown, tags, originalImageS3Keys } = (body ?? {}) as Record<string, unknown>;

  // Validate jobId.
  if (typeof jobId !== 'string' || !jobId) {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid jobId.' },
      { status: 400 },
    );
  }

  // Validate title.
  if (typeof title !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid title.' },
      { status: 400 },
    );
  }

  // Validate markdown.
  if (typeof markdown !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid markdown.' },
      { status: 400 },
    );
  }

  // Validate tags.
  let resolvedTags: string[] = [];
  if (tags !== undefined) {
    if (
      !Array.isArray(tags) ||
      !(tags as unknown[]).every((t) => typeof t === 'string')
    ) {
      return NextResponse.json(
        { ok: false, error: 'Invalid tags.' },
        { status: 400 },
      );
    }
    resolvedTags = [...new Set(tags as string[])];
    if (resolvedTags.length > 20) {
      return NextResponse.json(
        { ok: false, error: 'A note may have at most 20 tags.' },
        { status: 400 },
      );
    }
  }

  // Validate originalImageS3Keys (optional).
  let resolvedImageKeys: string[] | undefined;
  if (originalImageS3Keys !== undefined) {
    const sentinelKey = storageKeys.originalImage(sub, '__id__');
    const imagePrefix = sentinelKey.slice(0, sentinelKey.lastIndexOf('/') + 1);
    if (
      !Array.isArray(originalImageS3Keys) ||
      !(originalImageS3Keys as unknown[]).every((k) => typeof k === 'string') ||
      !(originalImageS3Keys as string[]).every((k) => k.startsWith(imagePrefix))
    ) {
      return NextResponse.json(
        { ok: false, error: 'Invalid originalImageS3Keys.' },
        { status: 400 },
      );
    }
    resolvedImageKeys = originalImageS3Keys as string[];
  }

  try {
    // Resolve required env var — fail loudly if unset.
    const bucket = requireBucketName();

    // Look up the job — a sub mismatch yields null → 404.
    const job = await getTranscriptionJob(sub, jobId);
    if (!job) {
      return NextResponse.json({ ok: false, error: 'Job not found.' }, { status: 404 });
    }

    // The note reuses the job's ULID.
    const noteId = jobId;

    // Derive metadata from the markdown body.
    const meta = postprocessMarkdown(markdown);
    const highlights = countHighlights(markdown);

    // Write the markdown body to S3 (overwrite/idempotent).
    const s3 = new S3Client({});
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKeys.noteMarkdown(sub, noteId),
        Body: markdown,
        ContentType: 'text/markdown',
      }),
    );

    // Persist note metadata to DynamoDB.
    await putNote({
      sub,
      noteId,
      title: title || 'Untitled note',
      tags: resolvedTags,
      status: 'clean',
      words: meta.wordCount,
      highlights,
      langPair: meta.detectedLang,
      ocrConfidence: meta.ocrConfidence,
      bodyS3Key: storageKeys.noteMarkdown(sub, noteId),
      originalImageS3Key: storageKeys.originalImage(sub, noteId),
      originalImageS3Keys: resolvedImageKeys,
    });

    // M23.2.2 storage metering, best-effort: emit a positive storage delta for the
    // persisted note (markdown body + original image S3 bytes). putStorageDeltaEvent is
    // fire-and-forget (never throws) and the HeadObject is wrapped in try/catch, so this
    // block can never break the note flow or change the HTTP response.
    const markdownBytes = Buffer.byteLength(markdown);
    let imageBytes = 0;
    try {
      const head = await s3.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: storageKeys.originalImage(sub, noteId),
        }),
      );
      imageBytes = head.ContentLength ?? 0;
    } catch {
      /* image may legitimately be absent (non-image notes) — treat as 0 */
    }
    await putStorageDeltaEvent({ sub, bytesDelta: markdownBytes + imageBytes });

    // Index tokens for full-text search.
    await putNoteTokens(sub, noteId, tokenise((title || 'Untitled note') + ' ' + markdown));

    // Best-effort: update job status to done. Swallow errors (e.g. ConditionalCheckFailed)
    // so a duplicate save or already-done job doesn't fail the request.
    try {
      await updateTranscriptionJobStatus({ sub, jobId, status: 'done' });
    } catch (statusErr) {
      console.error('[save] Failed to update job status to done', statusErr);
    }

    // Phase 2: extract ==highlight== cards and sync the card index for this note.
    // Best-effort — the note is the primary artifact; card sync failure must not fail the save.
    try {
      await syncCardsForNote({ sub, noteId, markdownBody: markdown });
    } catch (err) {
      console.error('[save] card sync failed', err);
    }

    return NextResponse.json({
      noteId,
      title: title || 'Untitled note',
      wordCount: meta.wordCount,
      highlights,
      langPair: meta.detectedLang,
      ocrConfidence: meta.ocrConfidence,
    });
  } catch (err) {
    console.error('[save] Could not save note', err);
    return NextResponse.json(
      { ok: false, error: 'Could not save note.' },
      { status: 500 },
    );
  }
}
