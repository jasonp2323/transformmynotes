'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Dialog,
  Icon,
  Toast,
} from '@/src/components/ui';
import {
  STUDY_TYPE_META,
  STUDY_TYPE_ORDER,
} from '@/src/lib/study-ui';
import type { StudyMaterialType } from '@transformmynotes/core';
import { useAiActivity } from '@/src/components/activity/AiActivityProvider';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ToastState {
  tone: 'success' | 'danger' | 'neutral' | 'warning';
  title: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export interface GenerateStudyMaterialProps {
  noteId: string;
  onStudySetReady?: () => void;
}

export function GenerateStudyMaterial({
  noteId,
  onStudySetReady,
}: GenerateStudyMaterialProps) {
  const router = useRouter();
  const { registerActivity } = useAiActivity();

  // Picker dialog state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<StudyMaterialType>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<ToastState | null>(null);

  // ── Toggle type selection ─────────────────────────────────────────────────

  const toggleType = useCallback((type: StudyMaterialType) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // ── Generate handler (from picker) ────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    setSubmitting(true);
    const types = Array.from(selected);
    const hasFlashcards = types.includes('flashcards');
    const otherTypes = types.filter((t) => t !== 'flashcards');

    try {
      // ── Flashcards branch: route to the deck review flow ─────────────────
      // The generate-cards screen fires its own POST on mount, so we must NOT
      // fire a generate request for flashcards here — doing so would double-generate.
      if (hasFlashcards) {
        // Fire generate requests for any other selected types (fire-and-forget).
        if (otherTypes.length > 0) {
          const otherResults = await Promise.all(
            otherTypes.map((type) =>
              fetch('/api/study/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceNoteId: noteId, type }),
              }).then(async (res) => ({ type, status: res.status, data: await res.json() as { studySetId?: string; error?: string } }))
            )
          );

          const unauthorized = otherResults.some((r) => r.status === 401);
          const rateLimited = otherResults.filter((r) => r.status === 429).length;
          const succeeded = otherResults.filter((r) => r.status === 202).length;

          if (unauthorized) {
            setToast({ tone: 'danger', title: 'Please sign in again.' });
          } else if (rateLimited > 0 && succeeded === 0) {
            setToast({ tone: 'warning', title: 'All requests hit the in-flight limit — wait for a generation to finish.' });
          } else if (rateLimited > 0) {
            setToast({
              tone: 'warning',
              title: `Started ${succeeded} of ${otherTypes.length} — the rest hit the in-flight limit. Try the others shortly.`,
            });
          }

          if (succeeded > 0) {
            registerActivity();
          }
        }

        // Navigate to the deck review flow regardless of other-type outcomes.
        setPickerOpen(false);
        setSelected(new Set());
        onStudySetReady?.();
        registerActivity();
        router.push(`/notes/${noteId}/generate-cards`);
        return;
      }

      // ── Non-flashcard branch: operating on otherTypes ──
      // (In this branch hasFlashcards is false, so otherTypes === types.)
      const results = await Promise.all(
        otherTypes.map((type) =>
          fetch('/api/study/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceNoteId: noteId, type }),
          }).then(async (res) => ({ type, status: res.status, data: await res.json() as { studySetId?: string; error?: string } }))
        )
      );

      if (otherTypes.length === 1) {
        // Single-type path
        const result = results[0];
        if (!result) return;
        if (result.status === 202) {
          setPickerOpen(false);
          setSelected(new Set());
          registerActivity();
        } else if (result.status === 429) {
          setPickerOpen(false);
          setToast({ tone: 'warning', title: result.data.error ?? 'Too many in-flight generations — wait for one to finish.' });
        } else if (result.status === 401) {
          setPickerOpen(false);
          setToast({ tone: 'danger', title: 'Please sign in again.' });
        } else {
          setToast({ tone: 'danger', title: 'Something went wrong — please try again.' });
        }
      } else {
        // Multi-type path — close picker, bump refresh, show toast
        setPickerOpen(false);
        setSelected(new Set());
        const succeeded = results.filter((r) => r.status === 202).length;
        const rateLimited = results.filter((r) => r.status === 429).length;
        const unauthorized = results.some((r) => r.status === 401);

        onStudySetReady?.(); // bump the refresh nonce

        if (succeeded > 0) {
          registerActivity();
        }

        if (unauthorized) {
          setToast({ tone: 'danger', title: 'Please sign in again.' });
        } else if (rateLimited > 0 && succeeded > 0) {
          setToast({
            tone: 'warning',
            title: `Started ${succeeded} of ${otherTypes.length} — the rest hit the in-flight limit. Try the others shortly.`,
          });
        } else if (rateLimited > 0 && succeeded === 0) {
          setToast({ tone: 'warning', title: 'All requests hit the in-flight limit — wait for a generation to finish.' });
        } else {
          setToast({ tone: 'success', title: `Generating ${succeeded} study ${succeeded === 1 ? 'set' : 'sets'}…` });
        }
      }
    } catch {
      setToast({ tone: 'danger', title: 'Network error — please try again.' });
    } finally {
      setSubmitting(false);
    }
  }, [noteId, selected, onStudySetReady, router, registerActivity]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Trigger button (rendered inline by NoteViewScreen into ActionBar) ── */}
      <Button
        variant="secondary"
        fullWidth
        leftIcon={<Icon name="sparkles" size={18} />}
        onClick={() => {
          if (!submitting) {
            setPickerOpen(true);
          }
        }}
        disabled={submitting}
      >
        Generate study material
      </Button>

      {/* ── Type-picker Dialog ── */}
      <Dialog
        open={pickerOpen}
        onClose={() => {
          if (!submitting) {
            setPickerOpen(false);
            setSelected(new Set());
          }
        }}
        title="Generate study material"
        description="Choose a format to generate from this note."
        footer={
          <Button
            variant="primary"
            fullWidth
            loading={submitting}
            disabled={submitting || selected.size === 0}
            onClick={() => void handleGenerate()}
          >
            Generate
          </Button>
        }
      >
        <div className="tmn-study-type-picker">
          {STUDY_TYPE_ORDER.map((type) => {
            const meta = STUDY_TYPE_META[type];
            const isSelected = selected.has(type);
            return (
              <button
                key={type}
                type="button"
                className={
                  'tmn-study-type-option' +
                  (isSelected ? ' tmn-study-type-option--selected' : '')
                }
                onClick={() => toggleType(type)}
                aria-pressed={isSelected}
              >
                <span className="tmn-study-type-option__icon">
                  <Icon name={meta.icon} size={20} />
                </span>
                <span className="tmn-study-type-option__text">
                  <span className="tmn-study-type-option__label">{meta.label}</span>
                  <span className="tmn-study-type-option__desc">{meta.description}</span>
                </span>
              </button>
            );
          })}
          <p className="tmn-study-type-picker__count">
            {selected.size} {selected.size === 1 ? 'option' : 'options'} selected
          </p>
        </div>
      </Dialog>

      {/* ── Toast ── */}
      {toast && (
        <Toast
          tone={toast.tone}
          title={toast.title}
          onClose={() => setToast(null)}
          duration={4000}
        />
      )}
    </>
  );
}

GenerateStudyMaterial.displayName = 'GenerateStudyMaterial';
