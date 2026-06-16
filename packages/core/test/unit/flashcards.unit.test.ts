import { describe, it, expect } from 'vitest';
import { parseFlashcardsPayload } from '../../src/study/flashcards';
import { TOOL_SCHEMAS } from '../../src/study/generate';

describe('parseFlashcardsPayload', () => {
  it('happy path: returns 3 cards unchanged', () => {
    const payload = {
      cards: [
        { front: 'Q1', back: 'A1' },
        { front: 'Q2', back: 'A2' },
        { front: 'Q3', back: 'A3' },
      ],
    };
    const result = parseFlashcardsPayload(payload);
    expect(result).toEqual([
      { front: 'Q1', back: 'A1' },
      { front: 'Q2', back: 'A2' },
      { front: 'Q3', back: 'A3' },
    ]);
  });

  it('preserves sourceSpan when present, omits it when absent', () => {
    const payload = {
      cards: [
        { front: 'Q1', back: 'A1', sourceSpan: 'see paragraph 2' },
        { front: 'Q2', back: 'A2' },
      ],
    };
    const result = parseFlashcardsPayload(payload);
    expect(result[0]).toEqual({ front: 'Q1', back: 'A1', sourceSpan: 'see paragraph 2' });
    expect(result[1]).toEqual({ front: 'Q2', back: 'A2' });
    expect('sourceSpan' in result[1]).toBe(false);
    expect(result[1].sourceSpan).toBeUndefined();
  });

  it('throws when cards is empty', () => {
    expect(() => parseFlashcardsPayload({ cards: [] })).toThrow(/no cards/);
  });

  it('throws when cards key is missing', () => {
    expect(() => parseFlashcardsPayload({})).toThrow(/cards/);
  });

  it('throws when cards is not an array', () => {
    expect(() => parseFlashcardsPayload({ cards: 'nope' })).toThrow(/cards/);
    expect(() => parseFlashcardsPayload({ cards: { front: 'Q', back: 'A' } })).toThrow(/cards/);
  });

  it('throws when payload is not an object', () => {
    expect(() => parseFlashcardsPayload(null)).toThrow();
    expect(() => parseFlashcardsPayload('a string')).toThrow();
    expect(() => parseFlashcardsPayload(42)).toThrow();
    expect(() => parseFlashcardsPayload([{ front: 'Q', back: 'A' }])).toThrow();
  });

  it('throws when a card is missing/invalid front or back', () => {
    expect(() => parseFlashcardsPayload({ cards: [{ back: 'A' }] })).toThrow(/front/);
    expect(() => parseFlashcardsPayload({ cards: [{ front: 123, back: 'A' }] })).toThrow(/front/);
    expect(() => parseFlashcardsPayload({ cards: [{ front: '', back: 'A' }] })).toThrow(/front/);
    expect(() => parseFlashcardsPayload({ cards: [{ front: 'Q' }] })).toThrow(/back/);
    expect(() => parseFlashcardsPayload({ cards: [{ front: 'Q', back: '   ' }] })).toThrow(/back/);
    expect(() => parseFlashcardsPayload({ cards: ['not an object'] })).toThrow(/not an object/);
  });

  it('throws when more than 20 cards (maxItems guard)', () => {
    const cards = Array.from({ length: 21 }, (_, i) => ({ front: `Q${i}`, back: `A${i}` }));
    expect(() => parseFlashcardsPayload({ cards })).toThrow(/max 20/);
  });

  it('accepts exactly 20 cards (boundary)', () => {
    const cards = Array.from({ length: 20 }, (_, i) => ({ front: `Q${i}`, back: `A${i}` }));
    expect(parseFlashcardsPayload({ cards })).toHaveLength(20);
  });

  it('drops unknown extra properties on a card', () => {
    const payload = {
      cards: [{ front: 'Q', back: 'A', extra: 'junk', id: 7 }],
    };
    const result = parseFlashcardsPayload(payload);
    expect(result[0]).toEqual({ front: 'Q', back: 'A' });
    expect('extra' in result[0]).toBe(false);
    expect('id' in result[0]).toBe(false);
  });
});

describe('TOOL_SCHEMAS.flashcards (M14 tuned shape)', () => {
  const schema = TOOL_SCHEMAS.flashcards as {
    properties: {
      cards: {
        minItems: number;
        maxItems: number;
        items: {
          properties: {
            front: { maxLength: number };
            back: { maxLength: number };
            sourceSpan: { type: string; maxLength: number };
          };
          required: string[];
        };
      };
    };
  };

  it('cards array has minItems 1 and maxItems 20', () => {
    expect(schema.properties.cards.minItems).toBe(1);
    expect(schema.properties.cards.maxItems).toBe(20);
  });

  it('front/back have maxLength 300/600 and required is exactly [front, back]', () => {
    const item = schema.properties.cards.items;
    expect(item.properties.front.maxLength).toBe(300);
    expect(item.properties.back.maxLength).toBe(600);
    expect(item.required).toEqual(['front', 'back']);
  });

  it('has an optional sourceSpan string with maxLength 300', () => {
    const item = schema.properties.cards.items;
    expect(item.properties.sourceSpan).toEqual({ type: 'string', maxLength: 300 });
    expect(item.required).not.toContain('sourceSpan');
  });
});
