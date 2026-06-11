import { describe, it, expect } from 'vitest';
import { extractCards } from '../../src/srs/extract.js';

// ---------------------------------------------------------------------------
// Canonical fixture — the design-system NOTE_MD sample
// ---------------------------------------------------------------------------

const NOTE_MD = `## What is the subjunctive?

El ==subjuntivo== is a verb **mood** that expresses doubt, desire, emotion and possibility — not plain fact. It almost always lives in a subordinate clause introduced by *que*.

> Indicative states what *is*. Subjunctive colours what *might*, *should*, or *is wished* to be.

## The three regular patterns

Regular verbs swap their theme vowel. Learn the endings by infinitive group:

| Infinitive | yo form | Example |
| --- | --- | --- |
| hablar (-ar) | hable | que yo ==hable== |
| comer (-er) | coma | que yo ==coma== |
| vivir (-ir) | viva | que yo ==viva== |

## Common triggers`;

// ---------------------------------------------------------------------------
// Main extraction tests
// ---------------------------------------------------------------------------

describe('extractCards', () => {
  describe('NOTE_MD sample — canonical fixture', () => {
    it('produces exactly 4 cards in document order', () => {
      const cards = extractCards('note-1', NOTE_MD);
      expect(cards).toHaveLength(4);
    });

    it('fronts are [subjuntivo, hable, coma, viva] in document order', () => {
      const cards = extractCards('note-1', NOTE_MD);
      expect(cards.map((c) => c.front)).toEqual(['subjuntivo', 'hable', 'coma', 'viva']);
    });

    it('subjuntivo back contains surrounding sentence text (verb / mood)', () => {
      const cards = extractCards('note-1', NOTE_MD);
      const { back } = cards[0];
      // The sentence containing the match references the verb mood concept
      expect(back).toMatch(/verb/);
      expect(back).toMatch(/mood/);
    });

    it('subjuntivo back has no == markers remaining', () => {
      const cards = extractCards('note-1', NOTE_MD);
      expect(cards[0].back).not.toContain('==');
    });

    it('table-row cards (hable/coma/viva) backs have no == markers', () => {
      const cards = extractCards('note-1', NOTE_MD);
      for (const card of cards.slice(1)) {
        expect(card.back).not.toContain('==');
      }
    });

    it('table-row cards backs are derived from their line', () => {
      const cards = extractCards('note-1', NOTE_MD);
      // Each table row contains the Spanish verb form — confirm the line text is captured
      expect(cards[1].back).toMatch(/hablar/);
      expect(cards[2].back).toMatch(/comer/);
      expect(cards[3].back).toMatch(/vivir/);
    });
  });

  // ---------------------------------------------------------------------------
  // Non-greedy regex — multiple highlights on one line
  // ---------------------------------------------------------------------------

  describe('multiple highlights on a single line', () => {
    it('yields two separate cards for ==a== and ==b== on the same line', () => {
      const body = 'Some ==alpha== and ==beta== text.';
      const cards = extractCards('note-2', body);
      expect(cards).toHaveLength(2);
      expect(cards[0].front).toBe('alpha');
      expect(cards[1].front).toBe('beta');
    });

    it('non-greedy: ==a== and ==b== does not produce one spanning match', () => {
      const body = '==first== middle ==second==';
      const cards = extractCards('note-x', body);
      expect(cards.map((c) => c.front)).toEqual(['first', 'second']);
    });
  });

  // ---------------------------------------------------------------------------
  // Noise guard — front length
  // ---------------------------------------------------------------------------

  describe('noise guard — front length', () => {
    it('skips a 1-character front (==x==)', () => {
      const cards = extractCards('note-3', 'The ==x== is short.');
      expect(cards).toHaveLength(0);
    });

    it('keeps a 2-character front (==xy==)', () => {
      const cards = extractCards('note-4', 'The ==xy== is ok.');
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe('xy');
    });

    it('skips a front longer than 200 characters', () => {
      const longFront = 'a'.repeat(201);
      const cards = extractCards('note-5', `The ==${longFront}== ends here.`);
      expect(cards).toHaveLength(0);
    });

    it('keeps a front of exactly 200 characters', () => {
      const exactFront = 'b'.repeat(200);
      const cards = extractCards('note-6', `The ==${exactFront}== ends here.`);
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe(exactFront);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases — empty / no highlights
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns [] for an empty body', () => {
      expect(extractCards('note-7', '')).toEqual([]);
    });

    it('returns [] for a body with no highlights', () => {
      const body = 'This is plain text.\nNo markers here.\n## Heading\nJust prose.';
      expect(extractCards('note-8', body)).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Front trimming
  // ---------------------------------------------------------------------------

  describe('front trimming', () => {
    it('trims surrounding spaces from the captured front text', () => {
      const cards = extractCards('note-9', 'The ==  spaced  == word.');
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe('spaced');
    });

    it('trimmed front still passes noise guard length check', () => {
      // "  xy  " trimmed to "xy" is length 2, which is the minimum kept value
      const cards = extractCards('note-10', 'Test ==  xy  == value.');
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe('xy');
    });
  });

  // ---------------------------------------------------------------------------
  // Back context — no markers
  // ---------------------------------------------------------------------------

  describe('back context', () => {
    it('back never contains == markers regardless of how many highlights are on the line', () => {
      const body = '==first== and ==second== are both here.';
      const cards = extractCards('note-11', body);
      for (const card of cards) {
        expect(card.back).not.toContain('==');
      }
    });

    it('back for a line with no sentence delimiter is the whole line (markers stripped)', () => {
      const body = 'El ==subjuntivo== es un modo verbal';
      const cards = extractCards('note-12', body);
      expect(cards[0].back).toBe('El subjuntivo es un modo verbal');
    });
  });

  // ---------------------------------------------------------------------------
  // noteId parameter — accepted but not used
  // ---------------------------------------------------------------------------

  describe('noteId parameter', () => {
    it('same result regardless of noteId value', () => {
      const body = 'The ==concept== is important.';
      const cards1 = extractCards('id-aaa', body);
      const cards2 = extractCards('id-bbb', body);
      expect(cards1).toEqual(cards2);
    });
  });
});
