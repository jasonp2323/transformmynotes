import { NextResponse } from 'next/server';
import { S3Client, CreateMultipartUploadCommand, UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ulid } from 'ulid';
import {
  storageKeys,
  buildUploadSessionItem,
  putUploadSession,
  buildTranscriptionJobItem,
  putTranscriptionJob,
} from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/heic'] as const;
type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

/** Maximum allowed file size: 10 MB */
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

function requireBucketName(): string {
  const value = process.env.SST_RESOURCE_NotesBucket_name;
  if (!value) {
    throw new Error('Missing required env var SST_RESOURCE_NotesBucket_name');
  }
  return value;
}

export async function POST(req: Request) {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const { contentType, size, parts } = (body ?? {}) as Record<string, unknown>;

  if (
    typeof contentType !== 'string' ||
    !(ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType)
  ) {
    return NextResponse.json({ ok: false, error: 'Unsupported content type.' }, { status: 400 });
  }

  if (typeof size !== 'number' || size <= 0) {
    return NextResponse.json({ ok: false, error: 'Invalid size.' }, { status: 400 });
  }

  if (size > MAX_SIZE_BYTES) {
    return NextResponse.json({ ok: false, error: 'Payload too large.' }, { status: 413 });
  }

  if (typeof parts !== 'number' || parts < 1) {
    return NextResponse.json({ ok: false, error: 'Invalid parts count.' }, { status: 400 });
  }

  const validatedContentType = contentType as AllowedContentType;
  const bucket = requireBucketName();

  const jobId = ulid();
  const uploadToken = ulid();
  const s3Key = storageKeys.originalImage(sub, jobId);

  try {
    const s3 = new S3Client({});

    // Create multipart upload in S3
    const createResult = await s3.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: s3Key,
        ContentType: validatedContentType,
      }),
    );

    const uploadId = createResult.UploadId!;

    // Presign upload part URLs (5-min TTL each)
    const partUrlPromises = Array.from({ length: parts }, (_, i) =>
      getSignedUrl(
        s3,
        new UploadPartCommand({
          Bucket: bucket,
          Key: s3Key,
          UploadId: uploadId,
          PartNumber: i + 1,
        }),
        { expiresIn: 300 },
      ).then((url) => ({ partNumber: i + 1, url })),
    );
    const partUrls = await Promise.all(partUrlPromises);

    // Store session in DynamoDB for resume/complete
    await putUploadSession(
      buildUploadSessionItem({ sub, uploadToken, uploadId, s3Key, jobId }),
    );

    // Write the TranscriptionJob so /api/transcribe works afterward
    await putTranscriptionJob(buildTranscriptionJobItem({ sub, jobId, s3Key }));

    return NextResponse.json({ uploadToken, uploadId, jobId, s3Key, partUrls });
  } catch (err) {
    console.error('[multipart/create] Unexpected error', err);
    return NextResponse.json(
      { ok: false, error: 'Could not initiate multipart upload.' },
      { status: 500 },
    );
  }
}
