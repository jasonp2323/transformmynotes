import { describe, it, expect } from 'vitest';
import { formatProvenance } from '../study-ui';

describe('formatProvenance', () => {
  it('returns null for single-source run (totalSourceCount = 1)', () => {
    expect(formatProvenance(['n1'], { n1: 'Note A' }, 1)).toBeNull();
  });

  it('returns null for totalSourceCount = 0', () => {
    expect(formatProvenance(['n1'], { n1: 'Note A' }, 0)).toBeNull();
  });

  it('returns "From: A, B" for multi-source with 2 resolved titles', () => {
    expect(
      formatProvenance(['n1', 'n2'], { n1: 'Note A', n2: 'Note B' }, 2)
    ).toBe('From: Note A, Note B');
  });

  it('skips ids with no resolved title', () => {
    expect(
      formatProvenance(['n1', 'unknown'], { n1: 'Note A' }, 2)
    ).toBe('From: Note A');
  });

  it('returns null when no ids resolve to titles', () => {
    expect(
      formatProvenance(['unknown'], { n1: 'Note A' }, 2)
    ).toBeNull();
  });

  it('returns null for undefined artifactSourceNoteIds', () => {
    expect(formatProvenance(undefined, { n1: 'Note A' }, 2)).toBeNull();
  });

  it('returns null for empty artifactSourceNoteIds', () => {
    expect(formatProvenance([], { n1: 'Note A' }, 2)).toBeNull();
  });

  it('returns null for undefined noteTitles', () => {
    expect(formatProvenance(['n1'], undefined, 2)).toBeNull();
  });

  it('deduplicates repeated titles', () => {
    expect(
      formatProvenance(['n1', 'n1'], { n1: 'Note A' }, 2)
    ).toBe('From: Note A');
  });

  it('supports a custom prefix', () => {
    expect(
      formatProvenance(['n1'], { n1: 'Note A' }, 2, 'Sources')
    ).toBe('Sources: Note A');
  });
});
