'use client';

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import type { Card } from '@transformmynotes/core';
import { Button, Icon, IconButton, Toast } from '@/src/components/ui';
import { PlayButton } from '@/src/components/tts';

// ── Types ─────────────────────────────────────────────────────────────────────

type DeckState = 'loading' | 'overview' | 'session' | 'done';

interface ToastState {
  tone: 'success' | 'danger' | 'warning' | 'neutral';
  title: string;
}

interface NoteMetadataMin {
  noteId: string;
  title: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface GroupedNote {
  sourceNoteId: string;
  title: string;
  count: number;
}

function groupByNote(cards: Card[], titleMap: Map<string, string>): GroupedNote[] {
  const map = new Map<string, number>();
  for (const card of cards) {
    map.set(card.sourceNoteId, (map.get(card.sourceNoteId) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([sourceNoteId, count]) => ({
    sourceNoteId,
    title: titleMap.get(sourceNoteId) ?? 'Untitled note',
    count,
  }));
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DeckOverview({
  cards,
  titleMap,
  onStart,
}: {
  cards: Card[];
  titleMap: Map<string, string>;
  onStart: () => void;
}) {
  const count = cards.length;
  const groups = groupByNote(cards, titleMap);

  return (
    <div className="tmn-deck-page">
      <h1 className="tmn-deck-count-headline">
        {count === 0
          ? 'No cards due'
          : count === 1
          ? '1 card due'
          : `${count} cards due`}
      </h1>
      <p className="tmn-deck-sublabel">
        {count === 0
          ? 'Come back later to keep your streak going.'
          : 'Review your flashcards to strengthen memory.'}
      </p>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={count === 0}
        leftIcon={<Icon name="layers" size={18} />}
        onClick={onStart}
      >
        Start review
      </Button>

      {groups.length > 0 && (
        <div className="tmn-deck-note-list" role="list" aria-label="Notes with due cards">
          {groups.map((g) => (
            <div key={g.sourceNoteId} className="tmn-deck-note-row" role="listitem">
              <Icon name="book-open" size={16} color="var(--text-subtle)" />
              <span className="tmn-deck-note-row__title">{g.title}</span>
              <span className="tmn-deck-note-row__count">
                {g.count} {g.count === 1 ? 'card' : 'cards'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeckAllDone({ onBack }: { onBack: () => void }) {
  return (
    <div className="tmn-deck-all-done">
      <div className="tmn-deck-all-done__icon">
        <Icon name="check-circle-2" size={56} />
      </div>
      <h2 className="tmn-deck-all-done__title">All caught up</h2>
      <p className="tmn-deck-all-done__body">
        All caught up — check back tomorrow.
      </p>
      <Button variant="secondary" onClick={onBack}>
        Back to overview
      </Button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ReviewDeck() {
  const [deckState, setDeckState] = useState<DeckState>('loading');
  const [cards, setCards] = useState<Card[]>([]);
  const [titleMap, setTitleMap] = useState<Map<string, string>>(new Map());
  const [sessionCards, setSessionCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [grading, setGrading] = useState(false);
  const [rate, setRate] = useState<'1x' | '0.8x'>('1x');
  const [toast, setToast] = useState<ToastState | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // ── Fetch due cards ─────────────────────────────────────────────────────────

  const fetchDue = useCallback(async (signal?: AbortSignal): Promise<Card[]> => {
    const res = await fetch('/api/cards/due', { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { cards: Card[]; total: number };
    return data.cards;
  }, []);

  // ── Fetch note titles (best-effort) ─────────────────────────────────────────

  const fetchTitles = useCallback(async (signal?: AbortSignal): Promise<Map<string, string>> => {
    try {
      const res = await fetch('/api/notes', { signal });
      if (!res.ok) return new Map();
      const data = (await res.json()) as { notes: NoteMetadataMin[] };
      return new Map(data.notes.map((n) => [n.noteId, n.title]));
    } catch {
      return new Map();
    }
  }, []);

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    Promise.all([
      fetchDue(controller.signal),
      fetchTitles(controller.signal),
    ])
      .then(([fetchedCards, fetchedTitles]) => {
        setCards(fetchedCards);
        setTitleMap(fetchedTitles);
        setDeckState('overview');
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setDeckState('overview'); // Show overview even on error (0 cards)
      });

    return () => {
      controller.abort();
    };
  }, [fetchDue, fetchTitles]);

  // ── Focus card when session index changes ───────────────────────────────────

  useEffect(() => {
    if (deckState === 'session') {
      // Small delay to let React commit before focusing
      const id = setTimeout(() => cardRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [deckState, currentIndex]);

  // ── Announce front text whenever the active card changes ────────────────────

  useEffect(() => {
    if (deckState === 'session' && sessionCards[currentIndex]) {
      const front = sessionCards[currentIndex]!.front;
      setLiveAnnouncement(`Front: ${front} — press Space to flip`);
    }
  }, [deckState, currentIndex, sessionCards]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    setSessionCards(cards);
    setCurrentIndex(0);
    setFlipped(false);
    setDeckState('session');
  }, [cards]);

  const handleFlip = useCallback((back?: string) => {
    setFlipped(true);
    setLiveAnnouncement(back ? `Back: ${back}` : 'Card flipped');
  }, []);

  const handleCardKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, backText?: string) => {
      if (!flipped && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        handleFlip(backText);
      }
    },
    [flipped, handleFlip],
  );

  const handleGrade = useCallback(
    async (grade: 0 | 1 | 2 | 3 | 4 | 5) => {
      const card = sessionCards[currentIndex];
      if (!card) return;

      setGrading(true);
      try {
        const res = await fetch(`/api/cards/${card.cardId}/grade`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grade }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        // Advance to next card
        const nextIndex = currentIndex + 1;
        if (nextIndex < sessionCards.length) {
          setCurrentIndex(nextIndex);
          setFlipped(false);
        } else {
          // Queue exhausted — re-fetch to pick up any remaining due cards
          const refreshed = await fetchDue();
          if (refreshed.length > 0) {
            // Continue session with newly-due cards
            setSessionCards(refreshed);
            setCurrentIndex(0);
            setFlipped(false);
          } else {
            // Truly done
            setDeckState('done');
          }
        }
      } catch {
        setToast({ tone: 'danger', title: "Couldn't record review — try again" });
      } finally {
        setGrading(false);
      }
    },
    [sessionCards, currentIndex, fetchDue],
  );

  const handleExitSession = useCallback(async () => {
    // Re-fetch to update the overview count
    try {
      const [refreshedCards, refreshedTitles] = await Promise.all([
        fetchDue(),
        fetchTitles(),
      ]);
      setCards(refreshedCards);
      setTitleMap(refreshedTitles);
    } catch {
      // Ignore — overview will show stale count
    }
    setDeckState('overview');
  }, [fetchDue, fetchTitles]);

  // ── Render: Loading ─────────────────────────────────────────────────────────

  if (deckState === 'loading') {
    return (
      <div className="tmn-deck-loading">
        <Icon name="layers" size={28} />
        <span>Loading your deck…</span>
      </div>
    );
  }

  // ── Render: Overview ────────────────────────────────────────────────────────

  if (deckState === 'overview') {
    return (
      <DeckOverview
        cards={cards}
        titleMap={titleMap}
        onStart={handleStart}
      />
    );
  }

  // ── Render: All done ────────────────────────────────────────────────────────

  if (deckState === 'done') {
    return <DeckAllDone onBack={() => setDeckState('overview')} />;
  }

  // ── Render: Session ─────────────────────────────────────────────────────────

  const currentCard = sessionCards[currentIndex];
  const total = sessionCards.length;
  const position = currentIndex + 1;
  const ssmlRate = rate === '0.8x' ? 'slow' : undefined;

  if (!currentCard) {
    // Defensive — shouldn't happen, but avoid a crash
    return <DeckAllDone onBack={() => setDeckState('overview')} />;
  }

  return (
    <div className="tmn-deck-session">
      {/* ── Session header ── */}
      <div className="tmn-deck-session-header">
        <IconButton label="Exit review" variant="plain" onClick={handleExitSession}>
          <Icon name="chevron-left" size={24} />
        </IconButton>
        <span className="tmn-deck-session-header__progress">
          Card {position} of {total}
        </span>
        {/* Spacer to keep progress centred */}
        <div style={{ width: 44 }} aria-hidden="true" />
      </div>

      {/* ── Session body ── */}
      <div className="tmn-deck-session-body">
        {/* Card surface */}
        <div
          ref={cardRef}
          className="tmn-deck-card"
          role="button"
          tabIndex={0}
          aria-label={flipped ? 'Card revealed' : 'Tap to reveal the answer'}
          onClick={!flipped ? () => handleFlip(currentCard.back) : undefined}
          onKeyDown={(e) => handleCardKeyDown(e, currentCard.back)}
        >
          <div className="tmn-deck-card__accent-bar" aria-hidden="true" />
          <div
            className="tmn-deck-card__audio"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <PlayButton text={currentCard.front} ssmlRate={ssmlRate} />
            <div
              className="tmn-deck-speed-toggle"
              role="group"
              aria-label="Playback speed"
            >
              <button
                type="button"
                className={
                  'tmn-deck-speed-toggle__option' +
                  (rate === '1x' ? ' tmn-deck-speed-toggle__option--active' : '')
                }
                aria-pressed={rate === '1x'}
                onClick={() => setRate('1x')}
              >
                1×
              </button>
              <button
                type="button"
                className={
                  'tmn-deck-speed-toggle__option' +
                  (rate === '0.8x' ? ' tmn-deck-speed-toggle__option--active' : '')
                }
                aria-pressed={rate === '0.8x'}
                onClick={() => setRate('0.8x')}
              >
                0.8×
              </button>
            </div>
          </div>
          <div className="tmn-deck-card__inner">
            <p className="tmn-deck-card__front">{currentCard.front}</p>

            {!flipped && (
              <p className="tmn-deck-card__hint">
                <Icon name="eye" size={14} />
                Tap to reveal
              </p>
            )}

            {flipped && (
              <>
                <hr className="tmn-deck-card__divider" />
                <div
                  className="tmn-deck-card__back-audio"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <PlayButton text={currentCard.back} ssmlRate={ssmlRate} />
                </div>
                <p className="tmn-deck-card__back">{currentCard.back}</p>
              </>
            )}
          </div>
        </div>

        {/* Grade buttons — only shown when flipped */}
        {flipped && (
          <div className="tmn-deck-grade-row" role="group" aria-label="Grade this card">
            <Button
              variant="danger"
              size="sm"
              aria-label="Grade Again — see this card again soon"
              disabled={grading}
              onClick={() => void handleGrade(0)}
            >
              Again
            </Button>
            <Button
              variant="soft"
              size="sm"
              aria-label="Grade Hard — you remembered but it was difficult"
              disabled={grading}
              onClick={() => void handleGrade(2)}
            >
              Hard
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Grade Good — you remembered correctly"
              disabled={grading}
              onClick={() => void handleGrade(3)}
            >
              Good
            </Button>
            <Button
              variant="primary"
              size="sm"
              aria-label="Grade Easy — you remembered effortlessly"
              disabled={grading}
              onClick={() => void handleGrade(5)}
            >
              Easy
            </Button>
          </div>
        )}
      </div>

      {/* ── Screen-reader live region for card flips ── */}
      <span
        className="sr-only"
        aria-live="assertive"
        aria-atomic="true"
      >
        {liveAnnouncement}
      </span>

      {/* ── Toast ── */}
      {toast && (
        <div className="tmn-deck-toast-container">
          <Toast
            tone={toast.tone}
            title={toast.title}
            onClose={() => setToast(null)}
            duration={3200}
          />
        </div>
      )}
    </div>
  );
}

ReviewDeck.displayName = 'ReviewDeck';
