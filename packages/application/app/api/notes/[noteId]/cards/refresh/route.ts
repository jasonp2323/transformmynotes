import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getNote, syncCardsForNote } from '@transformmynotes/core';
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

export async function POST(
  _req: Request,
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

  try {
    const bucket = requireBucketName();

    // getNote is sub-scoped: returns undefined for non-owner or missing note.
    // Treat undefined as 403 — we can't distinguish not-found from not-owner and
    // issue #99 requires 403 for non-owner access.
    const existing = await getNote(sub, noteId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    // Fetch the current markdown body from S3 (mirrors the pattern in [noteId]/route.ts).
    const s3 = new S3Client({});
    const s3Res = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: existing.bodyS3Key }),
    );
    const body = await (
      s3Res.Body as { transformToString(): Promise<string> }
    ).transformToString();

    // Force re-extraction: sync the card index against the current body.
    const result = await syncCardsForNote({ sub, noteId, markdownBody: body });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[cards/refresh] Unexpected error', err);
    return NextResponse.json(
      { ok: false, error: 'Could not refresh cards.' },
      { status: 500 },
    );
  }
}
