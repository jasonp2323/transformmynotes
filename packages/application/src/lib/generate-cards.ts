export interface EditableCard {
  id: string;
  front: string;
  back: string;
}

export function editCardField(
  cards: EditableCard[],
  id: string,
  field: 'front' | 'back',
  value: string
): EditableCard[] {
  return cards.map((card) =>
    card.id === id ? { ...card, [field]: value } : card
  );
}

export function discardCard(cards: EditableCard[], id: string): EditableCard[] {
  return cards.filter((card) => card.id !== id);
}

export function toAcceptedPayload(
  cards: EditableCard[]
): { front: string; back: string }[] {
  return cards.map(({ front, back }) => ({ front, back }));
}

export function remainingLabel(n: number): string {
  return n === 1 ? '1 card remaining' : `${n} cards remaining`;
}
