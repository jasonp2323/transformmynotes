import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import {
  storageKeys,
  getNote,
  computeTagDelta,
  updateNote,
  postprocessMarkdown,
  countHighlights,
  NoteConflictError,
  syncNoteTokens,
  deleteNoteRecord,
  tokenise,
  authoriseNoteRead,
  revokeAllSharesForNote,
  syncCardsForNote,
  putStorageDeltaEvent,
  type NoteItem,
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

// Helper: strips internal DynamoDB keys before sending to the client.
function toNoteMetadata(n: NoteItem) {
  return {
    noteId: n.noteId,
    title: n.title,
    tags: n.tags,
    status: n.status,
    words: n.words,
    highlights: n.highlights,
    langPair: n.langPair,
    ocrConfidence: n.ocrConfidence,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    ...(n.groupId !== undefined ? { groupId: n.groupId } : {}),
  };
}

export async function GET(
  req: Request,
  { params }: { params: { noteId: string } },
) {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { noteId } = params;
  if (typeof noteId !== 'string' || !noteId) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid noteId.' }, { status: 400 });
  }

  // Optional ?owner=<ownerSub> param for recipients reading a shared note.
  // If omitted, the caller is the owner (ownerSub === sub).
  const ownerSub = new URL(req.url).searchParams.get('owner') ?? sub;

  try {
    const bucket = requireBucketName();

    // Authorise: owner short-circuits true; recipient requires a valid share.
    const authorized = await authoriseNoteRead(sub, ownerSub, noteId);
    if (!authorized) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    // Look up the note keyed by the owner's sub.
    const existing = await getNote(ownerSub, noteId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Note not found.' }, { status: 404 });
    }

    // Fetch markdown body from S3 (best-effort; default '' if missing).
    let body = '';
    try {
      const s3 = new S3Client({});
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: existing.bodyS3Key }));
      body = await (res.Body as { transformToString(): Promise<string> }).transformToString();
    } catch (s3Err) {
      console.error('[notes/get] Could not fetch body from S3', s3Err);
    }

    return NextResponse.json({ metadata: toNoteMetadata(existing), body, isOwner: ownerSub === sub });
  } catch (err) {
    console.error('[notes/get] Unexpected error fetching note', err);
    return NextResponse.json({ ok: false, error: 'Could not fetch note.' }, { status: 500 });
  }
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

  const { markdown, tags, title, baseUpdatedAt } = (body ?? {}) as Record<string, unknown>;

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

  // Validate baseUpdatedAt: if provided it must be a string.
  if (baseUpdatedAt !== undefined && typeof baseUpdatedAt !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'Invalid baseUpdatedAt.' },
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

    // Fetch old markdown body for token diff (best-effort; default '' on error).
    const s3 = new S3Client({});
    let oldBody = '';
    try {
      const oldRes = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: existing.bodyS3Key }));
      oldBody = await (oldRes.Body as { transformToString(): Promise<string> }).transformToString();
    } catch {
      // best-effort — missing body defaults to ''
    }
    const oldTokens = tokenise((existing.title ?? '') + ' ' + oldBody);

    // Determine the optimistic-lock baseline.
    // When the client supplies a non-empty baseUpdatedAt, use that (real stale-client guard).
    // Otherwise fall back to existing.updatedAt (backward-compat for callers that don't send it).
    const expectedUpdatedAt =
      typeof baseUpdatedAt === 'string' && baseUpdatedAt !== ''
        ? baseUpdatedAt
        : existing.updatedAt;

    // Update note in DynamoDB FIRST (optimistic lock) — before any destructive S3 write.
    // If the lock fails (NoteConflictError), we return 409 without clobbering S3.
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
        expectedUpdatedAt,
      });
    } catch (err) {
      if (err instanceof NoteConflictError || (err as { name?: string })?.name === 'NoteConflictError') {
        // Re-fetch current server state so the client can show "keep mine / use server".
        let serverNote;
        let serverMarkdown = '';
        try {
          serverNote = await getNote(sub, noteId);
          if (serverNote) {
            try {
              const serverRes = await s3.send(
                new GetObjectCommand({ Bucket: bucket, Key: serverNote.bodyS3Key }),
              );
              serverMarkdown = await (
                serverRes.Body as { transformToString(): Promise<string> }
              ).transformToString();
            } catch {
              // best-effort — body unavailable
            }
          }
        } catch {
          // best-effort — if getNote also fails, return minimal 409
        }

        return NextResponse.json(
          {
            ok: false,
            conflict: true,
            error: 'This note was changed elsewhere since you started editing.',
            ...(serverNote
              ? {
                  server: {
                    updatedAt: serverNote.updatedAt,
                    title: serverNote.title,
                    tags: serverNote.tags,
                    markdown: serverMarkdown,
                    words: serverNote.words,
                    highlights: serverNote.highlights,
                    langPair: serverNote.langPair,
                    ocrConfidence: serverNote.ocrConfidence,
                  },
                }
              : {}),
          },
          { status: 409 },
        );
      }
      throw err;
    }

    // DynamoDB update succeeded — now write the new markdown body to S3.
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKeys.noteMarkdown(sub, noteId),
        Body: markdown,
        ContentType: 'text/markdown',
      }),
    );

    // Sync token index.
    const newTokens = tokenise((title || 'Untitled note') + ' ' + markdown);
    await syncNoteTokens(sub, noteId, oldTokens, newTokens);

    // Phase 2: re-sync card index so edits (e.g. removing a ==highlight==) take effect.
    // Best-effort — the note update is the primary artifact; card sync failure must not fail the request.
    try {
      await syncCardsForNote({ sub, noteId, markdownBody: markdown });
    } catch (err) {
      console.error('[notes/patch] card sync failed', err);
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

export async function DELETE(
  req: Request,
  { params }: { params: { noteId: string } },
) {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { noteId } = params;
  if (typeof noteId !== 'string' || !noteId) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid noteId.' }, { status: 400 });
  }

  try {
    const bucket = requireBucketName();

    const existing = await getNote(sub, noteId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Note not found.' }, { status: 404 });
    }

    // Reconstruct tokens from stored body (best-effort; '' on error).
    let body = '';
    try {
      const s3 = new S3Client({});
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: existing.bodyS3Key }));
      body = await (res.Body as { transformToString(): Promise<string> }).transformToString();
    } catch {
      // best-effort — missing body: token cleanup will use empty body
    }
    const tokens = tokenise((existing.title ?? '') + ' ' + body);

    // Delete all DynamoDB records (note + tag-index + token-index items).
    await deleteNoteRecord(sub, noteId, existing.tags ?? [], tokens);

    // Cascade-revoke all active shares so recipients lose access immediately.
    await revokeAllSharesForNote(sub, noteId);

    // Delete S3 objects best-effort (DynamoDB delete is the source of truth).
    const s3 = new S3Client({});

    // M23.2.2: emit a negative storage delta for the freed bytes (best-effort, never breaks delete).
    const markdownBytes = Buffer.byteLength(body);
    let imageBytes = 0;
    if (existing.originalImageS3Key) {
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: existing.originalImageS3Key }));
        imageBytes = head.ContentLength ?? 0;
      } catch {
        // image may be absent — treat as 0
      }
    }
    await putStorageDeltaEvent({ sub, bytesDelta: -(markdownBytes + imageBytes) });

    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: existing.bodyS3Key }));
    } catch (e) {
      console.error('[notes/delete] Could not delete markdown from S3', e);
    }
    if (existing.originalImageS3Key) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: existing.originalImageS3Key }));
      } catch (e) {
        console.error('[notes/delete] Could not delete image from S3', e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[notes/delete] Unexpected error deleting note', err);
    return NextResponse.json({ ok: false, error: 'Could not delete note.' }, { status: 500 });
  }
}
