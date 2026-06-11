import { NextResponse } from 'next/server';
import { S3Client, CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getUploadSession } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const { uploadToken, parts } = (body ?? {}) as Record<string, unknown>;

  if (typeof uploadToken !== 'string' || !uploadToken) {
    return NextResponse.json({ ok: false, error: 'Missing uploadToken.' }, { status: 400 });
  }

  if (!Array.isArray(parts) || parts.length === 0) {
    return NextResponse.json({ ok: false, error: 'Missing parts.' }, { status: 400 });
  }

  try {
    const session = await getUploadSession(sub, uploadToken);
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Upload session not found.' }, { status: 404 });
    }

    const bucket = requireBucketName();
    const s3 = new S3Client({});

    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: session.s3Key,
        UploadId: session.uploadId,
        MultipartUpload: {
          Parts: (parts as Array<{ partNumber: number; etag: string }>).map((p) => ({
            PartNumber: p.partNumber,
            ETag: p.etag,
          })),
        },
      }),
    );

    return NextResponse.json({ jobId: session.jobId, s3Key: session.s3Key });
  } catch (err) {
    console.error('[multipart/complete] Unexpected error', err);
    return NextResponse.json(
      { ok: false, error: 'Could not complete multipart upload.' },
      { status: 500 },
    );
  }
}
