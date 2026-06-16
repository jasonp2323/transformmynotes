import { describe, it, expect } from 'vitest';
import {
  editCardField,
  discardCard,
  toAcceptedPayload,
  remainingLabel,
  type EditableCard,
} from '../generate-cards';

const makeCards = (): EditableCard[] => [
  { id: '0', front: 'Front A', back: 'Back A' },
  { id: '1', front: 'Front B', back: 'Back B' },
  { id: '2', front: 'Front C', back: 'Back C' },
];

describe('editCardField', () => {
  it('updates only the targeted card front field', () => {
    const cards = makeCards();
    const result = editCardField(cards, '1', 'front', 'Updated Front');
    expect(result[1].front).toBe('Updated Front');
    expect(result[0].front).toBe('Front A');
    expect(result[2].front).toBe('Front C');
  });

  it('updates only the targeted card back field', () => {
    const cards = makeCards();
    const result = editCardField(cards, '0', 'back', 'Updated Back');
    expect(result[0].back).toBe('Updated Back');
    expect(result[1].back).toBe('Back B');
    expect(result[2].back).toBe('Back C');
  });

  it('does not mutate the input array', () => {
    const cards = makeCards();
    const original = cards.map((c) => ({ ...c }));
    editCardField(cards, '0', 'front', 'Changed');
    expect(cards).toEqual(original);
  });
});

describe('discardCard', () => {
  it('removes the card with the given id and leaves others intact', () => {
    const cards = makeCards();
    const result = discardCard(cards, '1');
    expect(result).toHaveLength(2);
    expect(result.find((c) => c.id === '1')).toBeUndefined();
    expect(result[0].id).toBe('0');
    expect(result[1].id).toBe('2');
  });

  it('returns cards unchanged when id is unknown', () => {
    const cards = makeCards();
    const result = discardCard(cards, 'unknown-id');
    expect(result).toHaveLength(3);
    expect(result).toEqual(cards);
  });
});

describe('toAcceptedPayload', () => {
  it('strips the id field and returns { front, back }[]', () => {
    const cards = makeCards();
    const result = toAcceptedPayload(cards);
    expect(result).toEqual([
      { front: 'Front A', back: 'Back A' },
      { front: 'Front B', back: 'Back B' },
      { front: 'Front C', back: 'Back C' },
    ]);
    result.forEach((item) => {
      expect(item).not.toHaveProperty('id');
    });
  });

  it('returns an empty array when given an empty array', () => {
    expect(toAcceptedPayload([])).toEqual([]);
  });
});

describe('remainingLabel', () => {
  it('returns singular label for 1 card', () => {
    expect(remainingLabel(1)).toBe('1 card remaining');
  });

  it('returns plural label for 5 cards', () => {
    expect(remainingLabel(5)).toBe('5 cards remaining');
  });

  it('returns "0 cards remaining" for 0', () => {
    expect(remainingLabel(0)).toBe('0 cards remaining');
  });
});
