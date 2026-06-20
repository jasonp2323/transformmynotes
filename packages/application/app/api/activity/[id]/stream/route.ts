import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getActivity } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// How long (ms) to sleep between S3 poll iterations.
const POLL_INTERVAL_MS = 800;

// Hard safety timeout: give up after 2 minutes even if stream.done never flips.
const MAX_DURATION_MS = 120_000;

// Re-fetch the ACTIVITY item every N iterations to check stream.done.
const ACTIVITY_REFETCH_EVERY = 2;

/** Reads the S3 stream buffer to a string; treats NoSuchKey / missing object as ''. */
async function readStreamBuffer(bucket: string, s3Key: string): Promise<string> {
  const s3 = new S3Client({});
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }));
  return res.Body!.transformToString();
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  // Auth: verify the Cognito ID token and extract the sub.
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = params;

  // Resolve the activity; ownership is implicit (query is scoped to the caller's USER#<sub>).
  const activity = await getActivity(sub, id);
  if (!activity) {
    return new Response('Not found', { status: 404 });
  }

  // Only activities with a `stream` field have a token buffer to relay.
  if (!activity.stream) {
    return new Response('Not found', { status: 404 });
  }

  // Resolve the bucket at request time — fail loudly if unbound.
  const bucket = process.env.SST_RESOURCE_NotesBucket_name;
  if (!bucket) {
    return new Response('Internal server error', { status: 500 });
  }

  // S3 key comes from the activity record, never from client input.
  const s3Key = activity.stream.s3Key;

  // Build the SSE response backed by a ReadableStream.
  let aborted = false;

  req.signal.addEventListener('abort', () => {
    aborted = true;
  });

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (chunk: string) => {
        try {
          controller.enqueue(new TextEncoder().encode(chunk));
        } catch {
          // Controller may already be closed (e.g. client disconnected mid-emit).
        }
      };

      const close = () => {
        try {
          controller.close();
        } catch {
          // Already closed — ignore.
        }
      };

      let emitted = 0; // chars already sent to the client
      let iteration = 0;
      const deadline = Date.now() + MAX_DURATION_MS;
      let done = activity.stream!.done; // might already be true on first fetch

      while (!aborted) {
        // Hard safety timeout.
        if (Date.now() >= deadline) {
          enqueue(`event: done\ndata: "end"\n\n`);
          close();
          return;
        }

        // Read the current S3 buffer.
        let text = '';
        try {
          text = await readStreamBuffer(bucket, s3Key);
        } catch (err: unknown) {
          // NoSuchKey or any read error: treat as empty buffer this tick.
          const code = (err as { Code?: string; name?: string })?.Code ?? (err as { name?: string })?.name;
          if (code !== 'NoSuchKey') {
            // Log non-transient errors but don't crash the stream.
            console.error('[activity/stream] S3 read error', err);
          }
          // Fall through with text = '' — skip this tick's emit.
        }

        // Emit any new suffix since last tick.
        const suffix = text.slice(emitted);
        if (suffix.length > 0) {
          // JSON-encode so embedded newlines inside the token text don't break SSE framing.
          enqueue(`data: ${JSON.stringify(suffix)}\n\n`);
          emitted += suffix.length;
        }

        // Re-check stream.done every ACTIVITY_REFETCH_EVERY iterations.
        iteration++;
        if (!done && iteration % ACTIVITY_REFETCH_EVERY === 0) {
          try {
            const refreshed = await getActivity(sub, id);
            done = refreshed?.stream?.done ?? false;
          } catch {
            // Best-effort: keep polling if the refetch fails.
          }
        }

        if (done) {
          // Do one final S3 read to catch any trailing bytes written after `done` flipped.
          let finalText = '';
          try {
            finalText = await readStreamBuffer(bucket, s3Key);
          } catch {
            // Best-effort — use what we have.
          }
          const trailing = finalText.slice(emitted);
          if (trailing.length > 0) {
            enqueue(`data: ${JSON.stringify(trailing)}\n\n`);
          }
          enqueue(`event: done\ndata: "end"\n\n`);
          close();
          return;
        }

        // Sleep between iterations; bail out early if the client disconnected.
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, POLL_INTERVAL_MS);
          req.signal.addEventListener('abort', () => {
            clearTimeout(t);
            resolve();
          });
        });
      }

      // Client disconnected — close cleanly without emitting anything further.
      close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
