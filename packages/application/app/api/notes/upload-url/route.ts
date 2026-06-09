import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ulid } from 'ulid';
import {
  storageKeys,
  buildTranscriptionJobItem,
  putTranscriptionJob,
} from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Accepted image content types for upload. */
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/heic'] as const;
type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

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

  const { contentType } = (body ?? {}) as Record<string, unknown>;

  // Validate contentType.
  if (
    typeof contentType !== 'string' ||
    !(ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType)
  ) {
    return NextResponse.json(
      { ok: false, error: 'Unsupported content type.' },
      { status: 400 },
    );
  }

  const validatedContentType = contentType as AllowedContentType;

  // Resolve bucket name — fails loudly if unset.
  const bucket = requireBucketName();

  // Generate a unique job ID and derive the S3 key.
  const jobId = ulid();
  const s3Key = storageKeys.originalImage(sub, jobId);

  try {
    // Write the transcription job record to DynamoDB (status defaults to 'pending').
    await putTranscriptionJob(buildTranscriptionJobItem({ sub, jobId, s3Key }));

    // Presign a PutObject URL with a 5-minute TTL.
    const s3 = new S3Client({});
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      ContentType: validatedContentType,
    });
    const presignedUrl = await getSignedUrl(s3, cmd, { expiresIn: 300 });

    return NextResponse.json({ presignedUrl, s3Key, jobId });
  } catch (err) {
    console.error('[upload-url] Unexpected error creating upload URL', err);
    return NextResponse.json(
      { ok: false, error: 'Could not create upload URL.' },
      { status: 500 },
    );
  }
}
