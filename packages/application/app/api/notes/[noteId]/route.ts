import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  storageKeys,
  getNote,
  computeTagDelta,
  updateNote,
  postprocessMarkdown,
  countHighlights,
  NoteConflictError,
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

export async function PATCH(
  req: Request,
  { params }: { params: { noteId: string } },
) {
  // Auth: verify the Cognito ID token and extract the sub.
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Validate noteId from route params.
  const { noteId } = params;
  if (typeof noteId !== 'string' || !noteId) {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid noteId.' },
      { status: 400 },
    );
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

  const { markdown, tags, title } = (body ?? {}) as Record<string, unknown>;

  // Validate markdown.
  if (typeof markdown !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid markdown.' },
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

  // Validate tags.
  const rawTags = tags ?? [];
  if (!Array.isArray(rawTags) || !rawTags.every((t) => typeof t === 'string')) {
    return NextResponse.json({ ok: false, error: 'Invalid tags.' }, { status: 400 });
  }
  const dedupedTags = [...new Set(rawTags as string[])];
  if (dedupedTags.length > 20) {
    return NextResponse.json(
      { ok: false, error: 'A note may have at most 20 tags.' },
      { status: 400 },
    );
  }

  try {
    // Resolve required env vars — fail loudly if unset.
    const bucket = requireBucketName();

    // Look up existing note — a sub mismatch or missing note yields undefined → 404.
    const existing = await getNote(sub, noteId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Note not found.' }, { status: 404 });
    }

    // Compute tag delta.
    const { added, removed } = computeTagDelta(existing.tags, dedupedTags);

    // Derive metadata from markdown.
    const meta = postprocessMarkdown(markdown);
    const highlights = countHighlights(markdown);

    // Write markdown to S3.
    const s3 = new S3Client({});
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKeys.noteMarkdown(sub, noteId),
        Body: markdown,
        ContentType: 'text/markdown',
      }),
    );

    // Update note in DynamoDB (with optimistic lock).
    let updatedNote;
    try {
      updatedNote = await updateNote({
        sub,
        noteId,
        title: title || 'Untitled note',
        tags: dedupedTags,
        status: 'clean',
        words: meta.wordCount,
        highlights,
        langPair: meta.detectedLang,
        ocrConfidence: meta.ocrConfidence,
        bodyS3Key: storageKeys.noteMarkdown(sub, noteId),
        originalImageS3Key: existing.originalImageS3Key,
        createdAt: existing.createdAt,
        groupId: existing.groupId,
        addedTags: added,
        removedTags: removed,
        expectedUpdatedAt: existing.updatedAt,
      });
    } catch (err) {
      if (err instanceof NoteConflictError || (err as { name?: string })?.name === 'NoteConflictError') {
        return NextResponse.json(
          { ok: false, error: 'Note was modified concurrently. Reload and try again.' },
          { status: 409 },
        );
      }
      throw err;
    }

    return NextResponse.json({
      noteId,
      title: title || 'Untitled note',
      wordCount: meta.wordCount,
      highlights,
      langPair: meta.detectedLang,
      ocrConfidence: meta.ocrConfidence,
      updatedAt: updatedNote.updatedAt,
    });
  } catch (err) {
    console.error('[notes/patch] Unexpected error updating note', err);
    return NextResponse.json(
      { ok: false, error: 'Could not update note.' },
      { status: 500 },
    );
  }
}
