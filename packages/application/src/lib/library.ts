/**
 * Pure helpers for the library (NotebookHome) screen.
 * No DOM / React dependencies — safe for unit tests.
 */

export type NoteStatus = 'clean' | 'original';
export type LibraryTab = 'all' | 'review' | 'shared';

export interface NoteMetadata {
  noteId: string;
  title: string;
  tags: string[];
  status: NoteStatus;
  words: number;
  highlights: number;
  langPair: string;
  ocrConfidence: number;
  createdAt: string;
  updatedAt: string;
  groupId?: string;
}

// ─── Relative-time formatter ─────────────────────────────────────────────────

/**
 * Returns a human-readable relative time string for a given ISO-8601 date.
 *
 * Buckets:
 *  - < 60 s     → "just now"
 *  - < 60 m     → "<N> min ago"
 *  - < 24 h     → "<N> hr ago"  (same calendar day)
 *  - yesterday  → "Yesterday"
 *  - older      → locale date string (e.g. "Jun 5, 2025")
 *
 * @param iso   ISO-8601 datetime string (e.g. from `updatedAt`)
 * @param now   Optional reference Date for deterministic tests (defaults to new Date())
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return 'just now';

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  // Check if it was "yesterday" relative to `now`
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((nowDate.getTime() - itemDate.getTime()) / 86_400_000);

  if (dayDiff === 1) return 'Yesterday';

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Tab filter ──────────────────────────────────────────────────────────────

/**
 * Filters a list of NoteMetadata for a given library tab.
 *
 * - 'all'    → all notes
 * - 'review' → notes where status === 'clean'
 * - 'shared' → always empty (feature placeholder)
 */
export function filterNotesByTab(notes: NoteMetadata[], tab: LibraryTab): NoteMetadata[] {
  switch (tab) {
    case 'all':
      return notes;
    case 'review':
      return notes.filter((n) => n.status === 'clean');
    case 'shared':
      return [];
  }
}
