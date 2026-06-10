import { redirect } from 'next/navigation';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { storageKeys, postprocessMarkdown } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';
import { ReviewScreen } from '@/src/components/review/ReviewScreen';

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

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string; layout?: string }>;
}) {
  const params = await searchParams;
  const jobId = params.jobId;
  const layoutParam = params.layout;

  if (!jobId) {
    redirect('/capture');
  }

  const sub = await getAuthenticatedSub();
  if (!sub) {
    redirect('/login');
  }

  const bucket = requireBucketName();
  const s3 = new S3Client({});

  // Read markdown from S3
  let markdown: string;
  try {
    const getResponse = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: storageKeys.noteMarkdown(sub, jobId),
      }),
    );
    markdown = await getResponse.Body!.transformToString();
  } catch (err: unknown) {
    // NoSuchKey or any S3 error → job not transcribed yet
    const code = (err as { name?: string; Code?: string }).name ?? (err as { Code?: string }).Code;
    if (code === 'NoSuchKey' || code === 'NotFound') {
      redirect('/capture');
    }
    throw err;
  }

  const meta = postprocessMarkdown(markdown);

  // Presign a GET URL for the original image (15 minutes)
  let imageUrl: string | null = null;
  try {
    imageUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: bucket,
        Key: storageKeys.originalImage(sub, jobId),
      }),
      { expiresIn: 900 },
    );
  } catch {
    // Image unavailable — render without it
    imageUrl = null;
  }

  const forceLayout = layoutParam === 'stacked' ? 'stacked' : undefined;

  return (
    <ReviewScreen
      jobId={jobId}
      initialMarkdown={markdown}
      wordCount={meta.wordCount}
      langPair={meta.detectedLang}
      ocrConfidence={meta.ocrConfidence}
      originalImageUrl={imageUrl}
      forceLayout={forceLayout}
    />
  );
}
