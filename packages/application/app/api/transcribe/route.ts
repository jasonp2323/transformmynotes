import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  storageKeys,
  getTranscriptionJob,
  updateTranscriptionJobStatus,
  transcribeImage,
  postprocessMarkdown,
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

function requireModelId(): string {
  const value = process.env.SST_RESOURCE_BEDROCK_MODEL_ID_value;
  if (!value) {
    throw new Error(
      'Missing required env var SST_RESOURCE_BEDROCK_MODEL_ID_value: the Bedrock model id ' +
        'is not bound. Expected it from the SST secret link (BEDROCK_MODEL_ID).',
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

  const { jobId } = (body ?? {}) as Record<string, unknown>;

  // Validate jobId.
  if (typeof jobId !== 'string' || !jobId) {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid jobId.' },
      { status: 400 },
    );
  }

  try {
    // Resolve required env vars — fail loudly if unset.
    const bucket = requireBucketName();
    requireModelId(); // validates the model id is bound before doing any work

    // Look up the job — a sub mismatch yields null → 404.
    const job = await getTranscriptionJob(sub, jobId);
    if (!job) {
      return NextResponse.json({ ok: false, error: 'Job not found.' }, { status: 404 });
    }

    // Mark job as processing.
    await updateTranscriptionJobStatus({ sub, jobId, status: 'processing' });

    const s3 = new S3Client({});
    const markdownS3Key = storageKeys.noteMarkdown(sub, jobId);

    try {
      // Fetch image bytes from S3.
      const getResponse = await s3.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: storageKeys.originalImage(sub, jobId),
        }),
      );
      const imageBytes = await getResponse.Body!.transformToByteArray();

      // Run OCR + post-process.
      const { rawText } = await transcribeImage(imageBytes);
      const processed = postprocessMarkdown(rawText);

      // Write markdown output to S3.
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: markdownS3Key,
          Body: processed.markdown,
          ContentType: 'text/markdown',
        }),
      );

      // Mark job done.
      await updateTranscriptionJobStatus({ sub, jobId, status: 'done' });

      return NextResponse.json({
        markdown: processed.markdown,
        wordCount: processed.wordCount,
        detectedLang: processed.detectedLang,
        ocrConfidence: processed.ocrConfidence,
        markdownS3Key,
      });
    } catch (err) {
      console.error('[transcribe] Transcription/processing failed', err);
      const errorMsg = err instanceof Error ? err.message : 'Transcription failed';
      try {
        await updateTranscriptionJobStatus({ sub, jobId, status: 'error', errorMsg });
      } catch (statusErr) {
        console.error('[transcribe] Failed to update job status to error', statusErr);
      }
      return NextResponse.json({ ok: false, error: 'Transcription failed.' }, { status: 500 });
    }
  } catch (err) {
    console.error('[transcribe] Unexpected error starting transcription', err);
    return NextResponse.json(
      { ok: false, error: 'Could not start transcription.' },
      { status: 500 },
    );
  }
}
