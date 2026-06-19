import { openDB, type IDBPDatabase } from 'idb';
import type { NoteMetadata } from '@/src/lib/library';
import {
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  NOTE_LIST_STORE,
  NOTE_STORE,
} from './constants';

// ─── Typed schema ────────────────────────────────────────────────────────────

export interface CachedNoteList {
  sub: string;
  notes: NoteMetadata[];
  cachedAt: number;
}

export interface CachedNote {
  sub: string;
  noteId: string;
  note: NoteMetadata;
  markdown: string;
  cachedAt: number;
}

interface OfflineDBSchema {
  [NOTE_LIST_STORE]: {
    key: string; // sub
    value: CachedNoteList;
  };
  [NOTE_STORE]: {
    key: string; // `${sub}::${noteId}`
    value: CachedNote;
  };
}

// ─── DB singleton ─────────────────────────────────────────────────────────────

let _db: IDBPDatabase<OfflineDBSchema> | null = null;

async function getDB(): Promise<IDBPDatabase<OfflineDBSchema> | null> {
  if (typeof indexedDB === 'undefined') {
    // SSR or unsupported browser — no-op.
    return null;
  }
  if (_db) return _db;
  _db = await openDB<OfflineDBSchema>(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(NOTE_LIST_STORE)) {
        db.createObjectStore(NOTE_LIST_STORE, { keyPath: 'sub' });
      }
      if (!db.objectStoreNames.contains(NOTE_STORE)) {
        // Compound string key: `${sub}::${noteId}` — stored inline as part of the value key path
        // We use out-of-line keys (no keyPath) for flexibility.
        db.createObjectStore(NOTE_STORE);
      }
    },
  });
  return _db;
}

// Exported so tests can reset the singleton between runs.
export function _resetDBForTests(): void {
  _db = null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Persist the unfiltered recent note list for a user. Overwrites any previous
 * cached list for the same sub.
 */
export async function cacheNoteList(sub: string, notes: NoteMetadata[]): Promise<void> {
  const db = await getDB();
  if (!db) return;
  const record: CachedNoteList = { sub, notes, cachedAt: Date.now() };
  await db.put(NOTE_LIST_STORE, record);
}

/**
 * Retrieve the cached note list for a user. Returns null if not cached.
 */
export async function readNoteList(sub: string): Promise<CachedNoteList | null> {
  const db = await getDB();
  if (!db) return null;
  const record = await db.get(NOTE_LIST_STORE, sub);
  return record ?? null;
}

/**
 * Persist a single note (metadata + markdown body) for a user.
 */
export async function cacheNote(
  sub: string,
  noteId: string,
  note: NoteMetadata,
  markdown: string,
): Promise<void> {
  const db = await getDB();
  if (!db) return;
  const key = `${sub}::${noteId}`;
  const record: CachedNote = { sub, noteId, note, markdown, cachedAt: Date.now() };
  await db.put(NOTE_STORE, record, key);
}

/**
 * Retrieve a cached note for a user. Returns null if not cached. Namespaced
 * per-user: looking up sub B's copy of a noteId will not return sub A's data.
 */
export async function readNote(sub: string, noteId: string): Promise<CachedNote | null> {
  const db = await getDB();
  if (!db) return null;
  const key = `${sub}::${noteId}`;
  const record = await db.get(NOTE_STORE, key);
  return record ?? null;
}

/**
 * Wipe ALL object stores — used on sign-out so the next user on this device
 * never sees another user's cached notes.
 */
export async function clearOfflineReadStore(): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await Promise.all([db.clear(NOTE_LIST_STORE), db.clear(NOTE_STORE)]);
}
