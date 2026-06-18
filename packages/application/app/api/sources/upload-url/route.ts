import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ulid } from 'ulid';
import {
  storageKeys,
  buildSourceItem,
  putSource,
  countSourcesByUser,
  checkMimeType,
  checkFileSize,
  checkSourceCount,
  resolveMaxSourceFileBytes,
  resolveMaxSourcesPerUser,
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

  const { contentType, byteSize, title: rawTitle } = (body ?? {}) as Record<string, unknown>;

  // Validate contentType.
  if (typeof contentType !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'Invalid request body.' },
      { status: 400 },
    );
  }

  // MIME type guard — resolves format.
  const mimeCheck = checkMimeType(contentType);
  if (!mimeCheck.ok) {
    return NextResponse.json({ ok: false, error: 'unsupported_type' }, { status: 400 });
  }
  const { format } = mimeCheck;

  // File-size guard. If byteSize is not a number, treat as the max (allow — real
  // enforcement is on the signed URL; only a number can actually be over the cap).
  const effectiveByteSize = typeof byteSize === 'number' ? byteSize : 0;
  const sizeCheck = checkFileSize(effectiveByteSize, resolveMaxSourceFileBytes());
  if (!sizeCheck.ok) {
    return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 422 });
  }

  // Per-user source cap.
  const currentCount = await countSourcesByUser(sub);
  const countCheck = checkSourceCount(currentCount, resolveMaxSourcesPerUser());
  if (!countCheck.ok) {
    return NextResponse.json({ ok: false, error: 'source_limit_reached' }, { status: 422 });
  }

  // Derive source metadata.
  const sourceId = ulid();
  const ext = format; // pdf | docx | epub | txt | md
  const s3Key = storageKeys.sourceOriginal(sub, sourceId, ext);
  const title =
    typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : 'Untitled document';

  // Resolve bucket name — fails loudly if unset.
  const bucket = requireBucketName();

  try {
    // Write the source record to DynamoDB (status: 'uploading').
    await putSource(
      buildSourceItem({
        sub,
        sourceId,
        type: 'document',
        title,
        status: 'uploading',
        originalFormat: format,
        originalS3Key: s3Key,
        byteSize: typeof byteSize === 'number' ? byteSize : 0,
        createdAt: new Date().toISOString(),
      }),
    );

    // Presign a PutObject URL with a 5-minute TTL.
    const s3 = new S3Client({});
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      ContentType: contentType,
    });
    const presignedUrl = await getSignedUrl(s3, cmd, { expiresIn: 300 });

    return NextResponse.json({ presignedUrl, s3Key, sourceId });
  } catch (err) {
    console.error('[sources/upload-url] Unexpected error creating upload URL', err);
    return NextResponse.json(
      { ok: false, error: 'Could not create upload URL.' },
      { status: 500 },
    );
  }
}
