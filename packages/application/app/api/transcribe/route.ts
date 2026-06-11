import { NextResponse } from 'next/server';
import { getAuthenticatedSub } from '@/lib/require-api-user';
import { processTranscriptionJob } from '@/lib/transcribe/process-job';

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
    requireBucketName();
    requireModelId();

    // Delegate to the extracted processor (idempotency guard lives there).
    const result = await processTranscriptionJob(sub, jobId);

    switch (result.outcome) {
      case 'not_found':
        return NextResponse.json({ ok: false, error: 'Job not found.' }, { status: 404 });

      case 'skipped':
        // Job is already done or in-flight — safe to acknowledge without re-running.
        return NextResponse.json({ ok: true, skipped: true });

      case 'success':
        return NextResponse.json(result.data);

      case 'error':
        // Generic client message; real error was logged server-side by processTranscriptionJob.
        return NextResponse.json(
          { error: result.errorMessage ?? 'Transform failed. Please try again.' },
          { status: result.status ?? 500 },
        );
    }
  } catch (err) {
    console.error('[transcribe] Unexpected error starting transcription', err);
    return NextResponse.json(
      { ok: false, error: 'Could not start transcription.' },
      { status: 500 },
    );
  }
}
