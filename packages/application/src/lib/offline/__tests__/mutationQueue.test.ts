/**
 * Unit tests for the offline mutation queue (IndexedDB via idb).
 * fake-indexeddb/auto patches the global `indexedDB` so the real idb code runs
 * without a browser.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDB } from 'idb';
import { OFFLINE_DB_NAME } from '../constants';
import { _resetDBForTests } from '../db';
import {
  enqueueMutation,
  listMutations,
  deleteMutation,
  updateMutation,
  countMutations,
  replayMutations,
  type QueuedMutation,
} from '../mutationQueue';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SUB_A = 'sub-user-a';
const SUB_B = 'sub-user-b';

function makePayload(overrides: Partial<QueuedMutation['payload']> = {}): QueuedMutation['payload'] {
  return {
    markdown: '# Hello',
    title: 'Test Note',
    tags: ['tag1'],
    baseUpdatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Reset the shared DB singleton and wipe the underlying fake-indexeddb store
// between tests so each test starts with clean stores.
beforeEach(async () => {
  _resetDBForTests();
  await deleteDB(OFFLINE_DB_NAME);
});

// ─── enqueueMutation / listMutations ─────────────────────────────────────────

describe('enqueueMutation / listMutations', () => {
  it('enqueues an entry and returns it with correct defaults', async () => {
    const before = Date.now();
    const m = await enqueueMutation({ sub: SUB_A, noteId: 'note-1', payload: makePayload() });

    expect(m.id).toBeTruthy();
    expect(m.sub).toBe(SUB_A);
    expect(m.noteId).toBe('note-1');
    expect(m.status).toBe('pending');
    expect(m.attempts).toBe(0);
    expect(m.createdAt).toBeGreaterThanOrEqual(before);
    expect(m.createdAt).toBeLessThanOrEqual(Date.now());
  });

  it('lists enqueued mutations for a sub', async () => {
    await enqueueMutation({ sub: SUB_A, noteId: 'note-1', payload: makePayload() });
    await enqueueMutation({ sub: SUB_A, noteId: 'note-2', payload: makePayload() });
    const list = await listMutations(SUB_A);
    expect(list).toHaveLength(2);
  });

  it('returns an empty list for an unknown sub', async () => {
    const list = await listMutations('unknown-sub');
    expect(list).toEqual([]);
  });

  it('returns mutations in FIFO order (oldest createdAt first)', async () => {
    const m1 = await enqueueMutation({ sub: SUB_A, noteId: 'note-1', payload: makePayload() });
    const m2 = await enqueueMutation({ sub: SUB_A, noteId: 'note-2', payload: makePayload() });
    const m3 = await enqueueMutation({ sub: SUB_A, noteId: 'note-3', payload: makePayload() });

    // Force distinct createdAt by overwriting via updateMutation.
    await updateMutation({ ...m1, createdAt: 100 });
    await updateMutation({ ...m2, createdAt: 200 });
    await updateMutation({ ...m3, createdAt: 150 });

    const list = await listMutations(SUB_A);
    expect(list.map((m) => m.noteId)).toEqual(['note-1', 'note-3', 'note-2']);
  });
});

// ─── per-sub namespacing ──────────────────────────────────────────────────────

describe('per-sub namespacing', () => {
  it("sub-A's queue never returns sub-B's mutations", async () => {
    await enqueueMutation({ sub: SUB_A, noteId: 'note-a', payload: makePayload() });
    await enqueueMutation({ sub: SUB_B, noteId: 'note-b', payload: makePayload() });

    const listA = await listMutations(SUB_A);
    const listB = await listMutations(SUB_B);

    expect(listA).toHaveLength(1);
    expect(listA[0].noteId).toBe('note-a');
    expect(listB).toHaveLength(1);
    expect(listB[0].noteId).toBe('note-b');
  });
});

// ─── deleteMutation ───────────────────────────────────────────────────────────

describe('deleteMutation', () => {
  it('removes the entry so it no longer appears in listMutations', async () => {
    const m = await enqueueMutation({ sub: SUB_A, noteId: 'note-1', payload: makePayload() });
    await deleteMutation(m.id);
    const list = await listMutations(SUB_A);
    expect(list).toHaveLength(0);
  });

  it('is a no-op for an unknown id', async () => {
    await expect(deleteMutation('nonexistent-id')).resolves.toBeUndefined();
  });
});

// ─── countMutations ───────────────────────────────────────────────────────────

describe('countMutations', () => {
  it('returns 0 for an empty queue', async () => {
    expect(await countMutations(SUB_A)).toBe(0);
  });

  it('counts only the specified sub', async () => {
    await enqueueMutation({ sub: SUB_A, noteId: 'note-1', payload: makePayload() });
    await enqueueMutation({ sub: SUB_A, noteId: 'note-2', payload: makePayload() });
    await enqueueMutation({ sub: SUB_B, noteId: 'note-b', payload: makePayload() });

    expect(await countMutations(SUB_A)).toBe(2);
    expect(await countMutations(SUB_B)).toBe(1);
  });

  it('decrements after deletion', async () => {
    const m = await enqueueMutation({ sub: SUB_A, noteId: 'note-1', payload: makePayload() });
    expect(await countMutations(SUB_A)).toBe(1);
    await deleteMutation(m.id);
    expect(await countMutations(SUB_A)).toBe(0);
  });
});

// ─── replayMutations ──────────────────────────────────────────────────────────

describe('replayMutations', () => {
  it('all-ok path: syncs all entries and empties the queue', async () => {
    await enqueueMutation({ sub: SUB_A, noteId: 'note-1', payload: makePayload() });
    await enqueueMutation({ sub: SUB_A, noteId: 'note-2', payload: makePayload() });

    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    const result = await replayMutations(SUB_A, { fetchFn });

    expect(result.synced).toBe(2);
    expect(result.conflicts).toHaveLength(0);
    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('fetch calls are made in FIFO order', async () => {
    const m1 = await enqueueMutation({ sub: SUB_A, noteId: 'first', payload: makePayload() });
    const m2 = await enqueueMutation({ sub: SUB_A, noteId: 'second', payload: makePayload() });
    await updateMutation({ ...m1, createdAt: 100 });
    await updateMutation({ ...m2, createdAt: 200 });

    const called: string[] = [];
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      called.push(url as string);
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });

    await replayMutations(SUB_A, { fetchFn });
    expect(called[0]).toContain('first');
    expect(called[1]).toContain('second');
  });

  it('409 path: keeps the entry with status=conflict, does not delete it', async () => {
    const m = await enqueueMutation({ sub: SUB_A, noteId: 'note-1', payload: makePayload() });

    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 409 } as Response);
    const result = await replayMutations(SUB_A, { fetchFn });

    expect(result.synced).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].id).toBe(m.id);
    expect(result.conflicts[0].status).toBe('conflict');
    expect(result.failed).toBe(0);
    // Entry is still in the queue.
    expect(result.remaining).toBe(1);
    const list = await listMutations(SUB_A);
    expect(list[0].status).toBe('conflict');
  });

  it('404 path: drops the entry (treats as resolved)', async () => {
    await enqueueMutation({ sub: SUB_A, noteId: 'gone-note', payload: makePayload() });

    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    const result = await replayMutations(SUB_A, { fetchFn });

    expect(result.synced).toBe(1); // counted as resolved
    expect(result.conflicts).toHaveLength(0);
    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(0);
  });

  it('network throw path: stops draining, increments attempts, leaves remaining entries', async () => {
    const m1 = await enqueueMutation({ sub: SUB_A, noteId: 'note-1', payload: makePayload() });
    const m2 = await enqueueMutation({ sub: SUB_A, noteId: 'note-2', payload: makePayload() });
    // Ensure FIFO: m1 first
    await updateMutation({ ...m1, createdAt: 100 });
    await updateMutation({ ...m2, createdAt: 200 });

    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await replayMutations(SUB_A, { fetchFn });

    // Should have stopped after first failure (only called once).
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    // Both entries remain in the queue.
    expect(result.remaining).toBe(2);

    // The entry that failed had its attempts incremented.
    const list = await listMutations(SUB_A);
    const first = list.find((m) => m.noteId === 'note-1');
    expect(first?.attempts).toBe(1);
    // The second was never touched.
    const second = list.find((m) => m.noteId === 'note-2');
    expect(second?.attempts).toBe(0);
  });

  it('5xx path: stops draining and increments attempts', async () => {
    await enqueueMutation({ sub: SUB_A, noteId: 'note-1', payload: makePayload() });
    await enqueueMutation({ sub: SUB_A, noteId: 'note-2', payload: makePayload() });

    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
    const result = await replayMutations(SUB_A, { fetchFn });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.failed).toBe(1);
    expect(result.remaining).toBe(2);
  });

  it('is idempotent: a second replay does not re-send already-synced mutations', async () => {
    await enqueueMutation({ sub: SUB_A, noteId: 'note-1', payload: makePayload() });

    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    await replayMutations(SUB_A, { fetchFn });
    // Queue is now empty. Second replay should call fetch 0 times.
    await replayMutations(SUB_A, { fetchFn });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
