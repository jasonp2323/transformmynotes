import { describe, it, expect } from 'vitest';
import { sanitizeSourceNoteIds, applyProvenance } from '../provenance.js';

// ── sanitizeSourceNoteIds ─────────────────────────────────────────────────────

describe('sanitizeSourceNoteIds', () => {
  const allowed = ['note-a', 'note-b', 'note-c'];

  it('passes through a valid subset in first-seen order', () => {
    expect(sanitizeSourceNoteIds(['note-b', 'note-a'], allowed)).toEqual(['note-b', 'note-a']);
  });

  it('deduplicates ids', () => {
    expect(sanitizeSourceNoteIds(['note-a', 'note-a', 'note-b'], allowed)).toEqual([
      'note-a',
      'note-b',
    ]);
  });

  it('filters out ids not in allowed', () => {
    expect(sanitizeSourceNoteIds(['note-a', 'bogus-id'], allowed)).toEqual(['note-a']);
  });

  it('falls back to full allowed set when all ids are bogus', () => {
    expect(sanitizeSourceNoteIds(['bogus'], allowed)).toEqual(allowed);
  });

  it('falls back to full allowed set when input is empty array', () => {
    expect(sanitizeSourceNoteIds([], allowed)).toEqual(allowed);
  });

  it('falls back to full allowed set when input is not an array (undefined)', () => {
    expect(sanitizeSourceNoteIds(undefined, allowed)).toEqual(allowed);
  });

  it('falls back to full allowed set when input is not an array (null)', () => {
    expect(sanitizeSourceNoteIds(null, allowed)).toEqual(allowed);
  });

  it('falls back to full allowed set when input is not an array (string)', () => {
    expect(sanitizeSourceNoteIds('note-a', allowed)).toEqual(allowed);
  });

  it('falls back to full allowed set when input is not an array (number)', () => {
    expect(sanitizeSourceNoteIds(42, allowed)).toEqual(allowed);
  });

  it('filters non-string elements within the array', () => {
    expect(sanitizeSourceNoteIds(['note-a', 123, null, 'note-b'], allowed)).toEqual([
      'note-a',
      'note-b',
    ]);
  });

  it('preserves first-seen order for duplicates across allowed set', () => {
    expect(sanitizeSourceNoteIds(['note-c', 'note-a'], allowed)).toEqual(['note-c', 'note-a']);
  });
});

// ── applyProvenance — flashcards ──────────────────────────────────────────────

describe('applyProvenance — flashcards', () => {
  const allowed = ['note-1', 'note-2'];

  it('fills missing sourceNoteIds with full allowed set', () => {
    const payload = { cards: [{ front: 'Q', back: 'A' }] };
    const result = applyProvenance('flashcards', payload, allowed) as {
      cards: Array<{ sourceNoteIds: string[] }>;
    };
    expect(result.cards[0]!.sourceNoteIds).toEqual(allowed);
  });

  it('passes through valid sourceNoteIds unchanged', () => {
    const payload = {
      cards: [{ front: 'Q', back: 'A', sourceNoteIds: ['note-1'] }],
    };
    const result = applyProvenance('flashcards', payload, allowed) as {
      cards: Array<{ sourceNoteIds: string[] }>;
    };
    expect(result.cards[0]!.sourceNoteIds).toEqual(['note-1']);
  });

  it('filters bogus ids and falls back to allowed when result is empty', () => {
    const payload = {
      cards: [{ front: 'Q', back: 'A', sourceNoteIds: ['bogus'] }],
    };
    const result = applyProvenance('flashcards', payload, allowed) as {
      cards: Array<{ sourceNoteIds: string[] }>;
    };
    expect(result.cards[0]!.sourceNoteIds).toEqual(allowed);
  });

  it('returns payload unchanged when cards is not an array', () => {
    const payload = { cards: 'not-an-array' };
    const result = applyProvenance('flashcards', payload, allowed);
    expect(result).toEqual(payload);
  });

  it('does not mutate the original payload', () => {
    const original = { cards: [{ front: 'Q', back: 'A' }] };
    applyProvenance('flashcards', original, allowed);
    expect((original.cards[0] as Record<string, unknown>)['sourceNoteIds']).toBeUndefined();
  });
});

// ── applyProvenance — quiz ────────────────────────────────────────────────────

describe('applyProvenance — quiz', () => {
  const allowed = ['note-1', 'note-2'];

  it('fills missing sourceNoteIds on each question', () => {
    const payload = { questions: [{ type: 'mcq', stem: 'Q?', options: ['A', 'B'] }] };
    const result = applyProvenance('quiz', payload, allowed) as {
      questions: Array<{ sourceNoteIds: string[] }>;
    };
    expect(result.questions[0]!.sourceNoteIds).toEqual(allowed);
  });

  it('passes through valid sourceNoteIds on questions', () => {
    const payload = {
      questions: [{ type: 'mcq', stem: 'Q?', options: ['A'], sourceNoteIds: ['note-2'] }],
    };
    const result = applyProvenance('quiz', payload, allowed) as {
      questions: Array<{ sourceNoteIds: string[] }>;
    };
    expect(result.questions[0]!.sourceNoteIds).toEqual(['note-2']);
  });

  it('filters bogus ids on questions and falls back', () => {
    const payload = {
      questions: [{ type: 'mcq', stem: 'Q?', options: ['A'], sourceNoteIds: ['bogus'] }],
    };
    const result = applyProvenance('quiz', payload, allowed) as {
      questions: Array<{ sourceNoteIds: string[] }>;
    };
    expect(result.questions[0]!.sourceNoteIds).toEqual(allowed);
  });
});

// ── applyProvenance — study_guide ─────────────────────────────────────────────

describe('applyProvenance — study_guide', () => {
  const allowed = ['note-1', 'note-2'];

  it('fills missing sourceNoteIds on each section', () => {
    const payload = { title: 'Guide', sections: [{ heading: 'H1', keyPoints: ['p1'] }] };
    const result = applyProvenance('study_guide', payload, allowed) as {
      sections: Array<{ sourceNoteIds: string[] }>;
    };
    expect(result.sections[0]!.sourceNoteIds).toEqual(allowed);
  });

  it('passes through valid sourceNoteIds on sections', () => {
    const payload = {
      title: 'Guide',
      sections: [{ heading: 'H1', keyPoints: [], sourceNoteIds: ['note-1'] }],
    };
    const result = applyProvenance('study_guide', payload, allowed) as {
      sections: Array<{ sourceNoteIds: string[] }>;
    };
    expect(result.sections[0]!.sourceNoteIds).toEqual(['note-1']);
  });

  it('filters bogus ids on sections and falls back', () => {
    const payload = {
      title: 'Guide',
      sections: [{ heading: 'H', keyPoints: [], sourceNoteIds: ['nope'] }],
    };
    const result = applyProvenance('study_guide', payload, allowed) as {
      sections: Array<{ sourceNoteIds: string[] }>;
    };
    expect(result.sections[0]!.sourceNoteIds).toEqual(allowed);
  });
});

// ── applyProvenance — summary ─────────────────────────────────────────────────

describe('applyProvenance — summary', () => {
  const allowed = ['note-1', 'note-2'];

  it('fills missing top-level sourceNoteIds', () => {
    const payload = { title: 'T', tldr: 'S', keyPoints: [], terms: [] };
    const result = applyProvenance('summary', payload, allowed) as {
      sourceNoteIds: string[];
    };
    expect(result.sourceNoteIds).toEqual(allowed);
  });

  it('passes through valid top-level sourceNoteIds', () => {
    const payload = { title: 'T', tldr: 'S', keyPoints: [], terms: [], sourceNoteIds: ['note-1'] };
    const result = applyProvenance('summary', payload, allowed) as {
      sourceNoteIds: string[];
    };
    expect(result.sourceNoteIds).toEqual(['note-1']);
  });

  it('filters bogus ids and falls back', () => {
    const payload = { title: 'T', tldr: 'S', keyPoints: [], terms: [], sourceNoteIds: ['x'] };
    const result = applyProvenance('summary', payload, allowed) as {
      sourceNoteIds: string[];
    };
    expect(result.sourceNoteIds).toEqual(allowed);
  });
});

// ── applyProvenance — glossary ────────────────────────────────────────────────

describe('applyProvenance — glossary', () => {
  const allowed = ['note-1'];

  it('fills missing top-level sourceNoteIds', () => {
    const payload = { terms: [{ term: 'foo', definition: 'bar' }] };
    const result = applyProvenance('glossary', payload, allowed) as {
      sourceNoteIds: string[];
    };
    expect(result.sourceNoteIds).toEqual(allowed);
  });

  it('passes through valid top-level sourceNoteIds', () => {
    const payload = { terms: [], sourceNoteIds: ['note-1'] };
    const result = applyProvenance('glossary', payload, allowed) as {
      sourceNoteIds: string[];
    };
    expect(result.sourceNoteIds).toEqual(['note-1']);
  });

  it('filters bogus ids and falls back', () => {
    const payload = { terms: [], sourceNoteIds: ['bogus'] };
    const result = applyProvenance('glossary', payload, allowed) as {
      sourceNoteIds: string[];
    };
    expect(result.sourceNoteIds).toEqual(allowed);
  });
});

// ── applyProvenance — assignment ──────────────────────────────────────────────

describe('applyProvenance — assignment', () => {
  const allowed = ['note-1', 'note-2'];

  it('fills missing top-level sourceNoteIds', () => {
    const payload = { title: 'A', instructions: 'Do X', rubric: [] };
    const result = applyProvenance('assignment', payload, allowed) as {
      sourceNoteIds: string[];
    };
    expect(result.sourceNoteIds).toEqual(allowed);
  });

  it('passes through valid top-level sourceNoteIds', () => {
    const payload = {
      title: 'A',
      instructions: 'Do X',
      rubric: [],
      sourceNoteIds: ['note-2'],
    };
    const result = applyProvenance('assignment', payload, allowed) as {
      sourceNoteIds: string[];
    };
    expect(result.sourceNoteIds).toEqual(['note-2']);
  });

  it('filters bogus ids and falls back', () => {
    const payload = { title: 'A', instructions: 'Do X', rubric: [], sourceNoteIds: ['nope'] };
    const result = applyProvenance('assignment', payload, allowed) as {
      sourceNoteIds: string[];
    };
    expect(result.sourceNoteIds).toEqual(allowed);
  });
});

// ── applyProvenance — defensive edge cases ────────────────────────────────────

describe('applyProvenance — defensive', () => {
  const allowed = ['note-1'];

  it('returns null unchanged', () => {
    expect(applyProvenance('flashcards', null, allowed)).toBeNull();
  });

  it('returns a number unchanged', () => {
    expect(applyProvenance('flashcards', 42, allowed)).toBe(42);
  });

  it('returns a string unchanged', () => {
    expect(applyProvenance('flashcards', 'bad', allowed)).toBe('bad');
  });

  it('handles payload with no cards field without throwing', () => {
    const payload = { something: 'else' };
    expect(() => applyProvenance('flashcards', payload, allowed)).not.toThrow();
  });
});
