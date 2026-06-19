/**
 * Shared IndexedDB opener for the offline layer.
 *
 * All stores (read cache, mutation queue, capture queue) share a SINGLE
 * openDB call so that version upgrades are coordinated and there are never
 * competing schema declarations for the same database.
 *
 * Version history:
 *   v1 — noteList + notes (M22.2 read store)
 *   v2 — adds mutationQueue + captureQueue (M22.3 offline mutations)
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { CachedNoteList, CachedNote } from './readStore';
import type { QueuedMutation } from './mutationQueue';
import type { QueuedCapture } from './captureQueue';
import {
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  NOTE_LIST_STORE,
  NOTE_STORE,
  MUTATION_QUEUE_STORE,
  CAPTURE_QUEUE_STORE,
} from './constants';

// ─── Combined schema ─────────────────────────────────────────────────────────

export interface OfflineDBSchema {
  [NOTE_LIST_STORE]: {
    key: string; // sub
    value: CachedNoteList;
  };
  [NOTE_STORE]: {
    key: string; // `${sub}::${noteId}` — out-of-line key
    value: CachedNote;
  };
  [MUTATION_QUEUE_STORE]: {
    key: string; // id (keyPath)
    value: QueuedMutation;
  };
  [CAPTURE_QUEUE_STORE]: {
    key: string; // id (keyPath)
    value: QueuedCapture;
  };
}

// ─── DB singleton ─────────────────────────────────────────────────────────────

let _db: IDBPDatabase<OfflineDBSchema> | null = null;

/**
 * Returns the shared offline IndexedDB instance, or null in SSR / environments
 * where IndexedDB is unavailable. Subsequent calls return the cached singleton.
 */
export async function getOfflineDB(): Promise<IDBPDatabase<OfflineDBSchema> | null> {
  if (typeof indexedDB === 'undefined') {
    // SSR or unsupported browser — no-op.
    return null;
  }
  if (_db) return _db;
  _db = await openDB<OfflineDBSchema>(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
    upgrade(db, oldVersion) {
      // v1 stores — idempotent so upgrading a v1 DB keeps existing data.
      if (!db.objectStoreNames.contains(NOTE_LIST_STORE)) {
        db.createObjectStore(NOTE_LIST_STORE, { keyPath: 'sub' });
      }
      if (!db.objectStoreNames.contains(NOTE_STORE)) {
        // Out-of-line keys: `${sub}::${noteId}` passed explicitly on put/get.
        db.createObjectStore(NOTE_STORE);
      }
      // v2 stores — only created when upgrading from v1 or initialising fresh.
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(MUTATION_QUEUE_STORE)) {
          db.createObjectStore(MUTATION_QUEUE_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(CAPTURE_QUEUE_STORE)) {
          db.createObjectStore(CAPTURE_QUEUE_STORE, { keyPath: 'id' });
        }
      }
    },
  });
  return _db;
}

/**
 * Closes the open DB connection and resets the singleton.
 * Only for use in tests — lets each test delete and re-open the database
 * without leftover connections blocking deleteDB().
 */
export function _resetDBForTests(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
