import { NextResponse } from 'next/server';
import { getAuthenticatedSub } from '@/lib/require-api-user';
import { processTranscriptionJob } from '@/lib/transcribe/process-job';
import {
  getTranscriptionJob,
  postprocessMarkdown,
  stitchPages,
  storageKeys,
} from '@transformmynotes/core';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

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
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const { jobIds } = (body ?? {}) as Record<string, unknown>;

  // Validate jobIds: must be a non-empty array of non-empty strings.
  if (
    !Array.isArray(jobIds) ||
    jobIds.length === 0 ||
    jobIds.some((id) => typeof id !== 'string' || !id)
  ) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid jobIds.' }, { status: 400 });
  }

  // Check length cap after confirming it is a non-empty array of strings.
  if (jobIds.length > 20) {
    return NextResponse.json({ ok: false, error: 'Too many pages (max 20).' }, { status: 422 });
  }

  try {
    // Resolve required env vars — fail loudly if unset.
    const bucket = requireBucketName();
    requireModelId();

    // OWNERSHIP PREFLIGHT — verify all jobs belong to this user before any OCR.
    for (const jobId of jobIds) {
      const job = await getTranscriptionJob(sub, jobId);
      if (!job) {
        return NextResponse.json({ ok: false, error: 'Job not found.' }, { status: 404 });
      }
    }

    // Process each job in order and collect pages.
    const pages: { markdown: string; wordCount: number }[] = [];
    let detectedLang = 'unknown';
    let ocrConfidence = 100;

    const s3 = new S3Client({});

    for (let i = 0; i < jobIds.length; i++) {
      const jobId = jobIds[i];
      const isPrimary = i === 0;

      const result = await processTranscriptionJob(sub, jobId);

      switch (result.outcome) {
        case 'success':
          pages.push({ markdown: result.data!.markdown, wordCount: result.data!.wordCount });
          if (isPrimary) {
            detectedLang = result.data!.detectedLang;
            ocrConfidence = result.data!.ocrConfidence;
          }
          break;

        case 'skipped': {
          // Job already processed — read existing markdown from S3.
          const obj = await s3.send(
            new GetObjectCommand({ Bucket: bucket, Key: storageKeys.noteMarkdown(sub, jobId) }),
          );
          const md = await obj.Body!.transformToString();
          const meta = postprocessMarkdown(md);
          pages.push({ markdown: meta.markdown, wordCount: meta.wordCount });
          if (isPrimary) {
            detectedLang = meta.detectedLang;
            ocrConfidence = meta.ocrConfidence;
          }
          break;
        }

        case 'not_found':
          // Defensive — should not happen after ownership preflight.
          return NextResponse.json({ ok: false, error: 'Job not found.' }, { status: 404 });

        case 'error':
          // Fail the whole batch — do NOT write a partial stitch.
          return NextResponse.json(
            { ok: false, error: result.errorMessage ?? 'Transform failed. Please try again.' },
            { status: result.status ?? 500 },
          );
      }
    }

    // Stitch all pages into a single document.
    const stitched = stitchPages(pages);

    // Write stitched markdown to S3 at the primary job's key.
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKeys.noteMarkdown(sub, jobIds[0]),
        Body: stitched.markdown,
        ContentType: 'text/markdown',
      }),
    );

    return NextResponse.json({
      jobId: jobIds[0],
      markdown: stitched.markdown,
      wordCount: stitched.wordCount,
      pageCount: stitched.pageCount,
      detectedLang,
      ocrConfidence,
    });
  } catch (err) {
    console.error('[transcribe-batch] Unexpected error', err);
    return NextResponse.json(
      { ok: false, error: 'Could not start transcription.' },
      { status: 500 },
    );
  }
}
