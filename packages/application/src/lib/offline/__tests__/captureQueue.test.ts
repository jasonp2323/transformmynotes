/**
 * Unit tests for the offline capture queue (IndexedDB via idb).
 * fake-indexeddb/auto patches the global `indexedDB` so the real idb code runs
 * without a browser.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDB } from 'idb';
import { OFFLINE_DB_NAME, CAPTURE_QUEUE_STORE } from '../constants';
import { _resetDBForTests, getOfflineDB } from '../db';
import {
  enqueueCapture,
  listCaptures,
  deleteCapture,
  countCaptures,
  replayCaptures,
} from '../captureQueue';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SUB_A = 'sub-user-a';
const SUB_B = 'sub-user-b';

/** Minimal Blob fixture — fake-indexeddb supports Blob storage. */
function makeBlob(content = 'x', type = 'image/jpeg'): Blob {
  return new Blob([content], { type });
}

// Reset the shared DB singleton and wipe the underlying fake-indexeddb store
// between tests so each test starts with clean stores.
beforeEach(async () => {
  _resetDBForTests();
  await deleteDB(OFFLINE_DB_NAME);
});

// ─── enqueueCapture / listCaptures ───────────────────────────────────────────

describe('enqueueCapture / listCaptures', () => {
  it('enqueues a capture and returns it with correct defaults', async () => {
    const blob = makeBlob();
    const before = Date.now();
    const c = await enqueueCapture({ sub: SUB_A, blob, contentType: 'image/jpeg' });

    expect(c.id).toBeTruthy();
    expect(c.sub).toBe(SUB_A);
    expect(c.blob).toBe(blob);
    expect(c.contentType).toBe('image/jpeg');
    expect(c.attempts).toBe(0);
    expect(c.createdAt).toBeGreaterThanOrEqual(before);
    expect(c.createdAt).toBeLessThanOrEqual(Date.now());
  });

  it('lists captures for a sub', async () => {
    await enqueueCapture({ sub: SUB_A, blob: makeBlob('a'), contentType: 'image/jpeg' });
    await enqueueCapture({ sub: SUB_A, blob: makeBlob('b'), contentType: 'image/jpeg' });
    const list = await listCaptures(SUB_A);
    expect(list).toHaveLength(2);
  });

  it('returns empty list for an unknown sub', async () => {
    const list = await listCaptures('unknown-sub');
    expect(list).toEqual([]);
  });

  it('returns captures in FIFO order', async () => {
    const c1 = await enqueueCapture({ sub: SUB_A, blob: makeBlob('1'), contentType: 'image/jpeg' });
    const c2 = await enqueueCapture({ sub: SUB_A, blob: makeBlob('2'), contentType: 'image/jpeg' });
    const c3 = await enqueueCapture({ sub: SUB_A, blob: makeBlob('3'), contentType: 'image/jpeg' });

    // Force distinct createdAt values via direct DB write.
    const idb = await getOfflineDB();
    if (idb) {
      await idb.put(CAPTURE_QUEUE_STORE, { ...c1, createdAt: 100 });
      await idb.put(CAPTURE_QUEUE_STORE, { ...c2, createdAt: 300 });
      await idb.put(CAPTURE_QUEUE_STORE, { ...c3, createdAt: 200 });
    }

    const list = await listCaptures(SUB_A);
    expect(list[0].createdAt).toBe(100);
    expect(list[1].createdAt).toBe(200);
    expect(list[2].createdAt).toBe(300);
  });
});

// ─── per-sub namespacing ──────────────────────────────────────────────────────

describe('per-sub namespacing', () => {
  it("sub-A's queue never returns sub-B's captures", async () => {
    await enqueueCapture({ sub: SUB_A, blob: makeBlob('a'), contentType: 'image/jpeg' });
    await enqueueCapture({ sub: SUB_B, blob: makeBlob('b'), contentType: 'image/png' });

    const listA = await listCaptures(SUB_A);
    const listB = await listCaptures(SUB_B);

    expect(listA).toHaveLength(1);
    expect(listA[0].sub).toBe(SUB_A);
    expect(listB).toHaveLength(1);
    expect(listB[0].sub).toBe(SUB_B);
  });
});

// ─── deleteCapture ────────────────────────────────────────────────────────────

describe('deleteCapture', () => {
  it('removes the entry so it no longer appears in listCaptures', async () => {
    const c = await enqueueCapture({ sub: SUB_A, blob: makeBlob(), contentType: 'image/jpeg' });
    await deleteCapture(c.id);
    const list = await listCaptures(SUB_A);
    expect(list).toHaveLength(0);
  });

  it('is a no-op for an unknown id', async () => {
    await expect(deleteCapture('nonexistent-id')).resolves.toBeUndefined();
  });
});

// ─── countCaptures ────────────────────────────────────────────────────────────

describe('countCaptures', () => {
  it('returns 0 for an empty queue', async () => {
    expect(await countCaptures(SUB_A)).toBe(0);
  });

  it('counts only the specified sub', async () => {
    await enqueueCapture({ sub: SUB_A, blob: makeBlob(), contentType: 'image/jpeg' });
    await enqueueCapture({ sub: SUB_A, blob: makeBlob(), contentType: 'image/jpeg' });
    await enqueueCapture({ sub: SUB_B, blob: makeBlob(), contentType: 'image/jpeg' });

    expect(await countCaptures(SUB_A)).toBe(2);
    expect(await countCaptures(SUB_B)).toBe(1);
  });

  it('decrements after deletion', async () => {
    const c = await enqueueCapture({ sub: SUB_A, blob: makeBlob(), contentType: 'image/jpeg' });
    expect(await countCaptures(SUB_A)).toBe(1);
    await deleteCapture(c.id);
    expect(await countCaptures(SUB_A)).toBe(0);
  });
});

// ─── replayCaptures ───────────────────────────────────────────────────────────

describe('replayCaptures', () => {
  it('all-ok path: uploads all captures, returns jobIds, empties queue', async () => {
    await enqueueCapture({ sub: SUB_A, blob: makeBlob('1'), contentType: 'image/jpeg' });
    await enqueueCapture({ sub: SUB_A, blob: makeBlob('2'), contentType: 'image/jpeg' });

    let callCount = 0;
    const uploadFn = vi.fn().mockImplementation(async (_blob: Blob) => {
      callCount++;
      return { jobId: `job-${callCount}` };
    });

    const result = await replayCaptures(SUB_A, { uploadFn });

    expect(result.processed).toEqual(['job-1', 'job-2']);
    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(0);
    expect(uploadFn).toHaveBeenCalledTimes(2);
  });

  it('throw mid-way: stops draining, leaves remaining entries, increments attempts', async () => {
    const c1 = await enqueueCapture({ sub: SUB_A, blob: makeBlob('1'), contentType: 'image/jpeg' });
    const c2 = await enqueueCapture({ sub: SUB_A, blob: makeBlob('2'), contentType: 'image/jpeg' });

    // Ensure FIFO ordering by setting distinct createdAt values.
    const idb = await getOfflineDB();
    if (idb) {
      await idb.put(CAPTURE_QUEUE_STORE, { ...c1, createdAt: 100 });
      await idb.put(CAPTURE_QUEUE_STORE, { ...c2, createdAt: 200 });
    }

    const uploadFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const result = await replayCaptures(SUB_A, { uploadFn });

    // Stops after first failure.
    expect(uploadFn).toHaveBeenCalledTimes(1);
    expect(result.processed).toHaveLength(0);
    expect(result.failed).toBe(1);
    // Both remain in the queue.
    expect(result.remaining).toBe(2);

    // The failed entry has its attempts incremented.
    const list = await listCaptures(SUB_A);
    const first = list.find((c) => c.createdAt === 100);
    expect(first?.attempts).toBe(1);
    const second = list.find((c) => c.createdAt === 200);
    expect(second?.attempts).toBe(0);
  });

  it('processes captures in FIFO order', async () => {
    const c1 = await enqueueCapture({ sub: SUB_A, blob: makeBlob('first'), contentType: 'image/jpeg' });
    const c2 = await enqueueCapture({ sub: SUB_A, blob: makeBlob('second'), contentType: 'image/jpeg' });

    const idb = await getOfflineDB();
    if (idb) {
      await idb.put(CAPTURE_QUEUE_STORE, { ...c1, createdAt: 100 });
      await idb.put(CAPTURE_QUEUE_STORE, { ...c2, createdAt: 200 });
    }

    const blobsReceived: string[] = [];
    const uploadFn = vi.fn().mockImplementation(async (blob: Blob) => {
      const text = await blob.text();
      blobsReceived.push(text);
      return { jobId: `job-${blobsReceived.length}` };
    });

    await replayCaptures(SUB_A, { uploadFn });

    expect(blobsReceived[0]).toBe('first');
    expect(blobsReceived[1]).toBe('second');
  });

  it('is idempotent: second replay does not re-upload already-processed captures', async () => {
    await enqueueCapture({ sub: SUB_A, blob: makeBlob(), contentType: 'image/jpeg' });

    const uploadFn = vi.fn().mockResolvedValue({ jobId: 'job-1' });
    await replayCaptures(SUB_A, { uploadFn });
    // Queue empty — second call should not upload anything.
    await replayCaptures(SUB_A, { uploadFn });

    expect(uploadFn).toHaveBeenCalledTimes(1);
  });
});
