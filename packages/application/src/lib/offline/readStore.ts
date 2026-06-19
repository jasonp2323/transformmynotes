import type { NoteMetadata } from '@/src/lib/library';
import { NOTE_LIST_STORE, NOTE_STORE } from './constants';
import { getOfflineDB, _resetDBForTests as _resetSharedDB } from './db';

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

// ─── DB access ───────────────────────────────────────────────────────────────

// Re-export so that readStore tests can reset the shared singleton in beforeEach
// without importing from db.ts directly — the existing test uses this name.
export { _resetSharedDB as _resetDBForTests };

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Persist the unfiltered recent note list for a user. Overwrites any previous
 * cached list for the same sub.
 */
export async function cacheNoteList(sub: string, notes: NoteMetadata[]): Promise<void> {
  const db = await getOfflineDB();
  if (!db) return;
  const record: CachedNoteList = { sub, notes, cachedAt: Date.now() };
  await db.put(NOTE_LIST_STORE, record);
}

/**
 * Retrieve the cached note list for a user. Returns null if not cached.
 */
export async function readNoteList(sub: string): Promise<CachedNoteList | null> {
  const db = await getOfflineDB();
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
  const db = await getOfflineDB();
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
  const db = await getOfflineDB();
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
  const db = await getOfflineDB();
  if (!db) return;
  await Promise.all([db.clear(NOTE_LIST_STORE), db.clear(NOTE_STORE)]);
}
