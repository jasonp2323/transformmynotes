import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  storageKeys,
  getSource,
  markSourceExtracting,
  markSourceReady,
  markSourceFailed,
  parseDocument,
  withTitleHeading,
  countWords,
  checkWordCount,
  ALLOWED_MIME_TYPES,
} from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Files at or below this size are extracted inline in the request. Larger files go async. */
const INLINE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

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
  { params }: { params: { sourceId: string } },
) {
  // Auth: verify the Cognito ID token and extract the sub.
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { sourceId } = params;

  // Ownership check: getSource is scoped to the caller's USER#<sub> partition,
  // so a cross-user sourceId simply returns undefined → 404 here.
  const source = await getSource(sub, sourceId);
  if (!source) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  // Route large files to the async extraction job; small files are extracted inline.
  if (source.byteSize > INLINE_MAX_BYTES) {
    await markSourceExtracting(sub, sourceId);
    return NextResponse.json({ ok: true, status: 'extracting' }, { status: 202 });
  }

  // ── Inline extraction ──────────────────────────────────────────────────────

  const bucket = requireBucketName();
  const s3 = new S3Client({});

  try {
    // Fetch the original file bytes from S3.
    const getResp = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: source.originalS3Key }),
    );
    const buffer = Buffer.from(await getResp.Body!.transformToByteArray());

    // Re-validate MIME type via HeadObject ContentType against the allowlist.
    // This catches any mismatch between what the client reported and what S3 received.
    const headResp = await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: source.originalS3Key }),
    );
    const storedContentType = headResp.ContentType ?? '';
    const storedMime = storedContentType.split(';')[0].trim();
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(storedMime)) {
      await markSourceFailed({ sub, sourceId, error: 'Unsupported content type' });
      return NextResponse.json({ ok: false, error: 'unsupported_type' }, { status: 422 });
    }

    // Parse the document buffer into Markdown text.
    let text = await parseDocument(source.originalFormat, buffer);

    // Prepend title heading if not already present.
    text = withTitleHeading(text, source.title);

    // Word-count cap enforcement.
    const wordCount = countWords(text);
    const wcCheck = checkWordCount(wordCount);
    if (!wcCheck.ok) {
      await markSourceFailed({ sub, sourceId, error: 'Document exceeds word limit' });
      return NextResponse.json(
        { ok: false, status: 'failed', error: 'word_limit_exceeded' },
        { status: 422 },
      );
    }

    // Write extracted Markdown to S3.
    const extractedTextS3Key = storageKeys.sourceText(sub, sourceId);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: extractedTextS3Key,
        Body: text,
        ContentType: 'text/markdown',
      }),
    );

    // Mark source ready in DynamoDB.
    await markSourceReady({ sub, sourceId, extractedTextS3Key, wordCount });

    return NextResponse.json({ ok: true, status: 'ready', wordCount });
  } catch (err) {
    // Log server-side with error name only (no raw message — may contain file content).
    const errName = err instanceof Error ? err.name : 'UnknownError';
    console.error('[sources/extract] Inline extraction failed', errName, err);

    // Best-effort: mark source failed so the client can surface the error state.
    try {
      await markSourceFailed({ sub, sourceId, error: errName });
    } catch (markErr) {
      console.error('[sources/extract] markSourceFailed also failed', markErr);
    }

    return NextResponse.json(
      { ok: false, status: 'failed', error: 'extraction_failed' },
      { status: 500 },
    );
  }
}
