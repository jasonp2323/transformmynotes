import { describe, it, expect } from 'vitest';
import { cardOrigin, filterCardsByOrigin, isOriginFilter } from '../deckFilter';

// ── cardOrigin ─────────────────────────────────────────────────────────────────

describe('cardOrigin', () => {
  it('returns highlight for a card with no origin (undefined)', () => {
    expect(cardOrigin({})).toBe('highlight');
  });

  it('returns highlight for a card with origin: highlight', () => {
    expect(cardOrigin({ origin: 'highlight' })).toBe('highlight');
  });

  it('returns ai for a card with origin: ai', () => {
    expect(cardOrigin({ origin: 'ai' })).toBe('ai');
  });
});

// ── filterCardsByOrigin ────────────────────────────────────────────────────────

describe('filterCardsByOrigin', () => {
  const fixture = [
    { id: 1, origin: undefined as undefined | 'highlight' | 'ai' },   // treated as highlight
    { id: 2, origin: 'highlight' as const },
    { id: 3, origin: 'ai' as const },
    { id: 4, origin: 'ai' as const },
  ];

  it('returns all 4 cards for filter all', () => {
    expect(filterCardsByOrigin(fixture, 'all')).toHaveLength(4);
  });

  it('returns 2 cards (including undefined-origin) for filter highlights', () => {
    const result = filterCardsByOrigin(fixture, 'highlights');
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual([1, 2]);
  });

  it('returns 2 ai cards for filter ai', () => {
    const result = filterCardsByOrigin(fixture, 'ai');
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual([3, 4]);
  });
});

// ── isOriginFilter ─────────────────────────────────────────────────────────────

describe('isOriginFilter', () => {
  it('returns true for all', () => expect(isOriginFilter('all')).toBe(true));
  it('returns true for highlights', () => expect(isOriginFilter('highlights')).toBe(true));
  it('returns true for ai', () => expect(isOriginFilter('ai')).toBe(true));

  it('returns false for uppercase AI', () => expect(isOriginFilter('AI')).toBe(false));
  it('returns false for empty string', () => expect(isOriginFilter('')).toBe(false));
  it('returns false for null', () => expect(isOriginFilter(null)).toBe(false));
  it('returns false for undefined', () => expect(isOriginFilter(undefined)).toBe(false));
  it('returns false for other string', () => expect(isOriginFilter('other')).toBe(false));
});
