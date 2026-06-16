'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/src/components/shells';
import { Button, Icon, IconButton, Toast } from '@/src/components/ui';
import type {
  StudySetMeta,
  FlashcardsPayload,
  StudyBodyResponse,
} from '@/src/lib/study-ui';
import {
  editCardField,
  discardCard,
  toAcceptedPayload,
  remainingLabel,
  type EditableCard,
} from '@/src/lib/generate-cards';

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | { phase: 'generating' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; studySetId: string; cards: EditableCard[] }
  | { phase: 'accepting'; studySetId: string; cards: EditableCard[] }
  | { phase: 'done' };

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 60;

// ── Component ─────────────────────────────────────────────────────────────────

export function GenerateCardsScreen({ noteId }: { noteId: string }) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>({ phase: 'generating' });
  const [editing, setEditing] = useState<{
    cardId: string;
    field: 'front' | 'back';
  } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [toast, setToast] = useState<{
    tone: 'success' | 'danger';
    title: string;
  } | null>(null);

  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ── Polling ───────────────────────────────────────────────────────────────

  const schedulePoll = useCallback(
    (studySetId: string, pollCount: number) => {
      timerRef.current = setTimeout(async () => {
        if (!mountedRef.current) return;

        if (pollCount >= MAX_POLLS) {
          setPhase({
            phase: 'error',
            message: 'Generation timed out. Please try again.',
          });
          return;
        }

        try {
          const res = await fetch(`/api/study/${studySetId}`);
          if (!mountedRef.current) return;

          if (!res.ok) {
            setPhase({
              phase: 'error',
              message: 'Generation failed. Please try again.',
            });
            return;
          }

          const meta = (await res.json()) as StudySetMeta;
          if (!mountedRef.current) return;

          if (meta.status === 'failed') {
            setPhase({
              phase: 'error',
              message: 'Generation failed. Please try again.',
            });
            return;
          }

          if (meta.status === 'ready') {
            const bodyRes = await fetch(`/api/study/${studySetId}/body`);
            if (!mountedRef.current) return;

            if (!bodyRes.ok) {
              setPhase({
                phase: 'error',
                message: 'Generation failed. Please try again.',
              });
              return;
            }

            const body = (await bodyRes.json()) as StudyBodyResponse;
            const payload = body.payload as FlashcardsPayload;
            const cards: EditableCard[] = payload.cards.map((c, i) => ({
              id: String(i),
              front: c.front,
              back: c.back,
            }));

            setPhase({ phase: 'ready', studySetId, cards });
            return;
          }

          // Still queued or running — keep polling
          schedulePoll(studySetId, pollCount + 1);
        } catch {
          if (!mountedRef.current) return;
          setPhase({
            phase: 'error',
            message: 'Generation failed. Please try again.',
          });
        }
      }, POLL_INTERVAL_MS);
    },
    [],
  );

  // ── Start generation ──────────────────────────────────────────────────────

  const startGeneration = useCallback(async () => {
    setPhase({ phase: 'generating' });
    try {
      const res = await fetch('/api/study/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceNoteId: noteId, type: 'flashcards' }),
      });

      if (!mountedRef.current) return;

      if (res.status !== 202) {
        setPhase({
          phase: 'error',
          message: 'Failed to start generation',
        });
        return;
      }

      const data = (await res.json()) as { studySetId: string };
      if (!mountedRef.current) return;

      schedulePoll(data.studySetId, 0);
    } catch {
      if (!mountedRef.current) return;
      setPhase({
        phase: 'error',
        message: 'Failed to start generation',
      });
    }
  }, [noteId, schedulePoll]);

  useEffect(() => {
    void startGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Accept ────────────────────────────────────────────────────────────────

  const handleAccept = useCallback(async () => {
    if (phase.phase !== 'ready') return;
    const { studySetId, cards } = phase;

    setPhase({ phase: 'accepting', studySetId, cards });

    try {
      const res = await fetch(`/api/study/${studySetId}/accept-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted: toAcceptedPayload(cards) }),
      });

      if (!mountedRef.current) return;

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setToast({
        tone: 'success',
        title: `${cards.length} ${cards.length === 1 ? 'card' : 'cards'} added to your review deck`,
      });
      router.push(`/notes/${noteId}`);
    } catch {
      if (!mountedRef.current) return;
      setToast({ tone: 'danger', title: "Couldn't save cards — try again" });
      setPhase({ phase: 'ready', studySetId, cards });
    }
  }, [phase, noteId, router]);

  // ── Discard ───────────────────────────────────────────────────────────────

  const handleDiscard = useCallback(
    (cardId: string) => {
      setPhase((p) => {
        if (p.phase !== 'ready' && p.phase !== 'accepting') return p;
        return { ...p, cards: discardCard(p.cards, cardId) };
      });
    },
    [],
  );

  // ── Commit edit on blur ───────────────────────────────────────────────────

  const handleEditBlur = useCallback(
    (cardId: string, field: 'front' | 'back') => {
      setPhase((p) => {
        if (p.phase !== 'ready' && p.phase !== 'accepting') return p;
        return { ...p, cards: editCardField(p.cards, cardId, field, editingValue) };
      });
      setEditing(null);
    },
    [editingValue],
  );

  // ── Current cards (from ready/accepting phase) ────────────────────────────

  const currentCards =
    phase.phase === 'ready' || phase.phase === 'accepting' ? phase.cards : [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <AppShell active="notes" title="AI Flashcards">
        {/* Generating spinner */}
        {phase.phase === 'generating' && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Icon name="loader-circle" size={40} className="animate-spin" />
            <p className="text-text-muted text-sm">Generating flashcards…</p>
          </div>
        )}

        {/* Error state */}
        {phase.phase === 'error' && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 px-6">
            <p className="text-text-muted text-sm text-center">{phase.message}</p>
            <Button
              variant="secondary"
              onClick={() => void startGeneration()}
            >
              Try again
            </Button>
          </div>
        )}

        {/* Ready / Accepting state */}
        {(phase.phase === 'ready' || phase.phase === 'accepting') && (
          <div className="px-4 pb-32 pt-4">
            {/* Counter */}
            <p className="text-sm text-text-muted mb-4">
              {remainingLabel(currentCards.length)}
            </p>

            {/* Card list */}
            {currentCards.map((card) => (
              <div
                key={card.id}
                className="rounded-lg border border-border-default bg-surface-card p-4 mb-3 transition-all duration-200"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {/* Front field */}
                    {editing?.cardId === card.id && editing.field === 'front' ? (
                      <textarea
                        className="w-full font-serif font-semibold resize-none border-none outline-none bg-transparent"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={() => handleEditBlur(card.id, 'front')}
                        autoFocus
                        rows={2}
                      />
                    ) : (
                      <p
                        className="font-serif font-semibold cursor-pointer"
                        onClick={() => {
                          setEditing({ cardId: card.id, field: 'front' });
                          setEditingValue(card.front);
                        }}
                      >
                        {card.front}
                      </p>
                    )}

                    {/* Back field */}
                    {editing?.cardId === card.id && editing.field === 'back' ? (
                      <textarea
                        className="w-full text-sm text-text-muted mt-2 resize-none border-none outline-none bg-transparent"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={() => handleEditBlur(card.id, 'back')}
                        autoFocus
                        rows={2}
                      />
                    ) : (
                      <p
                        className="text-sm text-text-muted mt-2 cursor-pointer"
                        onClick={() => {
                          setEditing({ cardId: card.id, field: 'back' });
                          setEditingValue(card.back);
                        }}
                      >
                        {card.back}
                      </p>
                    )}
                  </div>

                  {/* Discard button */}
                  <IconButton
                    label="Discard card"
                    variant="plain"
                    size="sm"
                    onClick={() => handleDiscard(card.id)}
                  >
                    <Icon name="trash-2" size={16} />
                  </IconButton>
                </div>
              </div>
            ))}

            {/* CTAs */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface-page border-t border-border-default flex flex-col gap-2">
              <Button
                variant="primary"
                fullWidth
                onClick={() => void handleAccept()}
                disabled={
                  (phase.phase === 'ready' || phase.phase === 'accepting') &&
                  currentCards.length === 0
                }
                loading={phase.phase === 'accepting'}
              >
                Accept{' '}
                {phase.phase === 'ready' || phase.phase === 'accepting'
                  ? phase.cards.length
                  : 0}{' '}
                cards
              </Button>
              <Button
                variant="ghost"
                fullWidth
                onClick={() => router.push(`/notes/${noteId}`)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </AppShell>

      {/* Toast — outside AppShell */}
      {toast && (
        <Toast
          tone={toast.tone}
          title={toast.title}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}

GenerateCardsScreen.displayName = 'GenerateCardsScreen';
