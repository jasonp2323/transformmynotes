// Pure helpers for the Review deck origin filter — no React import.

export type OriginFilter = 'all' | 'highlights' | 'ai';

export const REVIEW_FILTER_STORAGE_KEY = 'tmn-review-filter';

/** Treat undefined origin (pre-M14 cards) as 'highlight'. */
export function cardOrigin(card: { origin?: 'highlight' | 'ai' }): 'highlight' | 'ai' {
  return card.origin === 'ai' ? 'ai' : 'highlight';
}

/** Filter a card array by the chosen OriginFilter. */
export function filterCardsByOrigin<T extends { origin?: 'highlight' | 'ai' }>(
  cards: T[],
  filter: OriginFilter,
): T[] {
  if (filter === 'all') return cards;
  const target = filter === 'ai' ? 'ai' : 'highlight';
  return cards.filter((c) => cardOrigin(c) === target);
}

/** Type guard — true only for the three valid OriginFilter literals. */
export function isOriginFilter(v: unknown): v is OriginFilter {
  return v === 'all' || v === 'highlights' || v === 'ai';
}
