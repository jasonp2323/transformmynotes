import { describe, it, expect } from 'vitest';
import { relativeTime, filterNotesByTab } from '../library';
import type { NoteMetadata } from '../library';

// ── relativeTime ──────────────────────────────────────────────────────────────

describe('relativeTime', () => {
  const NOW = new Date('2025-06-11T14:00:00.000Z');

  it('returns "just now" for < 60 seconds ago', () => {
    const iso = new Date(NOW.getTime() - 30_000).toISOString();
    expect(relativeTime(iso, NOW)).toBe('just now');
  });

  it('returns "just now" for exactly 59 seconds ago', () => {
    const iso = new Date(NOW.getTime() - 59_000).toISOString();
    expect(relativeTime(iso, NOW)).toBe('just now');
  });

  it('returns "1 min ago" for 60 seconds ago', () => {
    const iso = new Date(NOW.getTime() - 60_000).toISOString();
    expect(relativeTime(iso, NOW)).toBe('1 min ago');
  });

  it('returns "45 min ago" for 45 minutes ago', () => {
    const iso = new Date(NOW.getTime() - 45 * 60_000).toISOString();
    expect(relativeTime(iso, NOW)).toBe('45 min ago');
  });

  it('returns "1 hr ago" for 61 minutes ago', () => {
    const iso = new Date(NOW.getTime() - 61 * 60_000).toISOString();
    expect(relativeTime(iso, NOW)).toBe('1 hr ago');
  });

  it('returns "5 hr ago" for 5 hours ago (same calendar day)', () => {
    const iso = new Date(NOW.getTime() - 5 * 3_600_000).toISOString();
    expect(relativeTime(iso, NOW)).toBe('5 hr ago');
  });

  it('returns "Yesterday" for exactly 1 calendar day ago', () => {
    // 2025-06-10 same time
    const iso = new Date('2025-06-10T14:00:00.000Z').toISOString();
    expect(relativeTime(iso, NOW)).toBe('Yesterday');
  });

  it('returns a date string for 2+ days ago', () => {
    const iso = new Date('2025-06-05T10:00:00.000Z').toISOString();
    const result = relativeTime(iso, NOW);
    // Should be a locale date string, not "Yesterday" or time-based
    expect(result).toBe('Jun 5, 2025');
  });

  it('returns a date string for much older dates', () => {
    const iso = new Date('2024-01-15T08:00:00.000Z').toISOString();
    const result = relativeTime(iso, NOW);
    expect(result).toBe('Jan 15, 2024');
  });
});

// ── filterNotesByTab ──────────────────────────────────────────────────────────

const makeNote = (id: string, status: 'clean' | 'original'): NoteMetadata => ({
  noteId: id,
  title: `Note ${id}`,
  tags: [],
  status,
  words: 100,
  highlights: 2,
  langPair: 'es-en',
  ocrConfidence: 98,
  createdAt: '2025-06-01T00:00:00.000Z',
  updatedAt: '2025-06-01T00:00:00.000Z',
});

const NOTES: NoteMetadata[] = [
  makeNote('a', 'clean'),
  makeNote('b', 'original'),
  makeNote('c', 'clean'),
];

describe('filterNotesByTab', () => {
  it('returns all notes for "all" tab', () => {
    expect(filterNotesByTab(NOTES, 'all')).toHaveLength(3);
    expect(filterNotesByTab(NOTES, 'all')).toEqual(NOTES);
  });

  it('returns only clean notes for "review" tab', () => {
    const result = filterNotesByTab(NOTES, 'review');
    expect(result).toHaveLength(2);
    expect(result.every((n) => n.status === 'clean')).toBe(true);
  });

  it('returns empty array for "shared" tab', () => {
    expect(filterNotesByTab(NOTES, 'shared')).toEqual([]);
  });

  it('handles empty note list gracefully', () => {
    expect(filterNotesByTab([], 'all')).toEqual([]);
    expect(filterNotesByTab([], 'review')).toEqual([]);
    expect(filterNotesByTab([], 'shared')).toEqual([]);
  });

  it('returns empty array for "review" when all notes are original', () => {
    const originals = [makeNote('x', 'original'), makeNote('y', 'original')];
    expect(filterNotesByTab(originals, 'review')).toEqual([]);
  });
});
