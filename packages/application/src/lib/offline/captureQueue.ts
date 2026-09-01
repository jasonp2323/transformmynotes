/**
 * Offline capture queue — stores photos taken while offline in IndexedDB so
 * they can be uploaded and transcribed when connectivity is restored.
 *
 * All functions are SSR-safe: they no-op / return empty results when
 * IndexedDB is unavailable (server-side rendering).
 *
 * The default `uploadFn` lazily imports `uploadImageForTranscription` from
 * `@/lib/capture` so that no DOM-side effects run at import time (safe for
 * SSR and tests that inject their own `uploadFn`).
 */
import { CAPTURE_QUEUE_STORE } from './constants';
import { getOfflineDB } from './db';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QueuedCapture {
  id: string;
  sub: string;
  /** The raw image Blob — IndexedDB stores Blobs natively. */
  blob: Blob;
  contentType: string;
  /** Unix timestamp (ms) when the capture was enqueued — used for FIFO ordering. */
  createdAt: number;
  /** Number of times this capture has been retried and failed. */
  attempts: number;
}

export interface ReplayCapturesDeps {
  /** Override the upload function for testing. */
  uploadFn?: (blob: Blob) => Promise<{ jobId: string }>;
}

export interface ReplayCapturesSummary {
  /** jobIds of successfully uploaded captures. */
  processed: string[];
  failed: number;
  remaining: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a unique id. Uses `crypto.randomUUID()` when available and falls
 * back to a timestamp + random string.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Add a captured image to the offline capture queue. Returns the created entry.
 */
export async function enqueueCapture(input: {
  sub: string;
  blob: Blob;
  contentType: string;
}): Promise<QueuedCapture> {
  const entry: QueuedCapture = {
    id: generateId(),
    sub: input.sub,
    blob: input.blob,
    contentType: input.contentType,
    createdAt: Date.now(),
    attempts: 0,
  };

  const db = await getOfflineDB();
  if (db) {
    await db.put(CAPTURE_QUEUE_STORE, entry);
  }
  return entry;
}

/**
 * List all queued captures for a user, sorted oldest-first (FIFO).
 */
export async function listCaptures(sub: string): Promise<QueuedCapture[]> {
  const db = await getOfflineDB();
  if (!db) return [];
  const all = await db.getAll(CAPTURE_QUEUE_STORE);
  return all.filter((c) => c.sub === sub).sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Delete a single queued capture by id (e.g. after successful upload).
 */
export async function deleteCapture(id: string): Promise<void> {
  const db = await getOfflineDB();
  if (!db) return;
  await db.delete(CAPTURE_QUEUE_STORE, id);
}

/**
 * Count queued captures for a user.
 */
export async function countCaptures(sub: string): Promise<number> {
  const db = await getOfflineDB();
  if (!db) return 0;
  const all = await db.getAll(CAPTURE_QUEUE_STORE);
  return all.filter((c) => c.sub === sub).length;
}

/**
 * Drain the capture queue for a user, uploading each image in FIFO order.
 *
 * - Success  → delete entry, push jobId into processed[].
 * - Throw    → increment attempts, stop draining (network/offline), break.
 *
 * The default `uploadFn` wraps `uploadImageForTranscription` from
 * `@/lib/capture` via a dynamic import so SSR is never affected.
 *
 * Returns a summary: { processed, failed, remaining }.
 */
export async function replayCaptures(
  sub: string,
  deps?: ReplayCapturesDeps,
): Promise<ReplayCapturesSummary> {
  // Resolve the upload function: injected dep (for tests) or lazy default.
  let uploadFn: (blob: Blob) => Promise<{ jobId: string }>;

  if (deps?.uploadFn) {
    uploadFn = deps.uploadFn;
  } else {
    // Lazy import keeps DOM-only modules out of SSR and avoids import-time side effects.
    const captureModule = await import('@/lib/capture');
    uploadFn = (blob: Blob) => captureModule.uploadImageForTranscription(blob);
  }

  const queue = await listCaptures(sub);

  const processed: string[] = [];
  let failed = 0;

  for (const capture of queue) {
    try {
      const { jobId } = await uploadFn(capture.blob);
      await deleteCapture(capture.id);
      processed.push(jobId);
    } catch {
      // Network or upload error — stop draining.
      const db = await getOfflineDB();
      if (db) {
        await db.put(CAPTURE_QUEUE_STORE, { ...capture, attempts: capture.attempts + 1 });
      }
      failed++;
      break;
    }
  }

  const remaining = await countCaptures(sub);
  return { processed, failed, remaining };
}
