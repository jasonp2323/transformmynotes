import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getStudySet } from '@transformmynotes/core';
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

export async function GET(
  _req: Request,
  { params }: { params: { studySetId: string } },
) {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { studySetId } = params;
  if (!studySetId) {
    return NextResponse.json({ ok: false, error: 'Missing studySetId.' }, { status: 400 });
  }

  try {
    const bucket = requireBucketName();

    const item = await getStudySet(sub, studySetId);
    if (!item) {
      return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
    }

    if (item.status !== 'ready' || !item.bodyS3Key) {
      return NextResponse.json({ ok: false, error: 'Body not ready.' }, { status: 404 });
    }

    const s3 = new S3Client({});
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: item.bodyS3Key }));
    const text = await (res.Body as { transformToString(): Promise<string> }).transformToString();
    const payload = JSON.parse(text) as unknown;

    return NextResponse.json({ type: item.type, payload });
  } catch (err) {
    console.error('[study/body]', err);
    return NextResponse.json({ ok: false, error: 'Could not load body.' }, { status: 500 });
  }
}
