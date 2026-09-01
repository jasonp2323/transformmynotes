/**
 * Offline mutation queue — stores pending note edits in IndexedDB so they can
 * be replayed when the user comes back online.
 *
 * All functions are SSR-safe: they no-op / return empty results when
 * IndexedDB is unavailable (server-side rendering).
 */
import { MUTATION_QUEUE_STORE } from './constants';
import { getOfflineDB } from './db';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QueuedMutation {
  id: string;
  sub: string;
  noteId: string;
  payload: {
    markdown: string;
    title: string;
    tags: string[];
    baseUpdatedAt: string;
  };
  /** Unix timestamp (ms) when the mutation was enqueued — used for FIFO ordering. */
  createdAt: number;
  /** Number of times this mutation has been retried and failed with a network/server error. */
  attempts: number;
  status: 'pending' | 'conflict';
}

export interface ReplayMutationsDeps {
  fetchFn?: typeof fetch;
}

export interface ReplayMutationsSummary {
  synced: number;
  conflicts: QueuedMutation[];
  failed: number;
  remaining: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a unique id. Uses `crypto.randomUUID()` when available and falls
 * back to a timestamp + random string so this works in environments that don't
 * expose the Web Crypto API.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: timestamp hex + 8 random hex chars.
  return `${Date.now().toString(16)}-${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Add a note edit to the mutation queue. Returns the created entry.
 */
export async function enqueueMutation(input: {
  sub: string;
  noteId: string;
  payload: QueuedMutation['payload'];
}): Promise<QueuedMutation> {
  const entry: QueuedMutation = {
    id: generateId(),
    sub: input.sub,
    noteId: input.noteId,
    payload: input.payload,
    createdAt: Date.now(),
    attempts: 0,
    status: 'pending',
  };

  const db = await getOfflineDB();
  if (db) {
    await db.put(MUTATION_QUEUE_STORE, entry);
  }
  return entry;
}

/**
 * List all queued mutations for a user, sorted oldest-first (FIFO).
 */
export async function listMutations(sub: string): Promise<QueuedMutation[]> {
  const db = await getOfflineDB();
  if (!db) return [];
  const all = await db.getAll(MUTATION_QUEUE_STORE);
  return all.filter((m) => m.sub === sub).sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Delete a single queued mutation by id (e.g. after successful sync).
 */
export async function deleteMutation(id: string): Promise<void> {
  const db = await getOfflineDB();
  if (!db) return;
  await db.delete(MUTATION_QUEUE_STORE, id);
}

/**
 * Persist an updated mutation entry (e.g. after incrementing attempts or
 * setting status='conflict').
 */
export async function updateMutation(m: QueuedMutation): Promise<void> {
  const db = await getOfflineDB();
  if (!db) return;
  await db.put(MUTATION_QUEUE_STORE, m);
}

/**
 * Count queued mutations for a user.
 */
export async function countMutations(sub: string): Promise<number> {
  const db = await getOfflineDB();
  if (!db) return 0;
  const all = await db.getAll(MUTATION_QUEUE_STORE);
  return all.filter((m) => m.sub === sub).length;
}

/**
 * Drain the mutation queue for a user, replaying each edit against the API in
 * FIFO order.
 *
 * - 2xx   → delete the entry (synced).
 * - 409   → mark status='conflict', keep the entry (surfaced to user).
 * - 404   → note is gone; delete the entry (treat as resolved).
 * - 5xx / network throw → increment attempts, stop draining (likely offline).
 *
 * Returns a summary: { synced, conflicts, failed, remaining }.
 */
export async function replayMutations(
  sub: string,
  deps?: ReplayMutationsDeps,
): Promise<ReplayMutationsSummary> {
  const fetchFn = deps?.fetchFn ?? globalThis.fetch;

  const queue = await listMutations(sub);

  let synced = 0;
  const conflicts: QueuedMutation[] = [];
  let failed = 0;

  for (const mutation of queue) {
    try {
      const res = await fetchFn(`/api/notes/${mutation.noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mutation.payload),
      });

      if (res.ok) {
        await deleteMutation(mutation.id);
        synced++;
      } else if (res.status === 409) {
        // Conflict — keep the entry so the user can resolve it.
        const updated: QueuedMutation = { ...mutation, status: 'conflict' };
        await updateMutation(updated);
        conflicts.push(updated);
      } else if (res.status === 404) {
        // Note no longer exists — drop silently.
        await deleteMutation(mutation.id);
        synced++;
      } else {
        // 5xx or other server error — stop draining.
        const updated: QueuedMutation = { ...mutation, attempts: mutation.attempts + 1 };
        await updateMutation(updated);
        failed++;
        break;
      }
    } catch {
      // Network error (offline) — stop draining.
      const updated: QueuedMutation = { ...mutation, attempts: mutation.attempts + 1 };
      await updateMutation(updated);
      failed++;
      break;
    }
  }

  const remaining = await countMutations(sub);
  return { synced, conflicts, failed, remaining };
}
