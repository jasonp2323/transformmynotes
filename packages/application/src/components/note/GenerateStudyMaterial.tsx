'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  type StudySetMeta,
} from '@/src/lib/study-ui';
import type { StudyMaterialType } from '@transformmynotes/core';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ToastState {
  tone: 'success' | 'danger' | 'neutral' | 'warning';
  title: string;
}

type GenerationState =
  | { phase: 'idle' }
  | { phase: 'generating'; studySetId: string; type: StudyMaterialType; polls: number }
  | { phase: 'failed'; studySetId: string; type: StudyMaterialType; error: string }
  | { phase: 'timeout'; studySetId: string; type: StudyMaterialType };

// ── Constants ──────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 60;

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

  // Picker dialog state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<StudyMaterialType>('flashcards');
  const [submitting, setSubmitting] = useState(false);

  // Generation / polling state
  const [generation, setGeneration] = useState<GenerationState>({ phase: 'idle' });

  // Toast
  const [toast, setToast] = useState<ToastState | null>(null);

  // Timer ref for cleanup
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // ── Polling ────────────────────────────────────────────────────────────────

  const schedulePoll = useCallback(
    (studySetId: string, type: StudyMaterialType, pollCount: number) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;

        void (async () => {
          try {
            const res = await fetch(`/api/study/${studySetId}`);
            if (!mountedRef.current) return;

            if (!res.ok) {
              setGeneration({ phase: 'idle' });
              setToast({ tone: 'danger', title: 'Lost track of the generation — try again.' });
              return;
            }

            const data = (await res.json()) as StudySetMeta;
            if (!mountedRef.current) return;

            if (data.status === 'ready') {
              setGeneration({ phase: 'idle' });
              onStudySetReady?.();
              router.push(`/study/${studySetId}`);
              return;
            }

            if (data.status === 'failed') {
              setGeneration({
                phase: 'failed',
                studySetId,
                type,
                error: data.error ?? 'Generation failed — please try again.',
              });
              return;
            }

            // queued | running
            const nextCount = pollCount + 1;
            if (nextCount >= MAX_POLLS) {
              setGeneration({ phase: 'timeout', studySetId, type });
              return;
            }

            // Schedule next poll
            setGeneration({ phase: 'generating', studySetId, type, polls: nextCount });
            schedulePoll(studySetId, type, nextCount);
          } catch {
            if (!mountedRef.current) return;
            setGeneration({ phase: 'idle' });
            setToast({ tone: 'danger', title: 'Lost connection while generating — try again.' });
          }
        })();
      }, POLL_INTERVAL_MS);
    },
    [router, onStudySetReady],
  );

  // ── Manual re-poll for timeout state ─────────────────────────────────────

  const handleManualRefresh = useCallback(
    (studySetId: string, type: StudyMaterialType) => {
      setGeneration({ phase: 'generating', studySetId, type, polls: 0 });
      schedulePoll(studySetId, type, 0);
    },
    [schedulePoll],
  );

  // ── Retry for failed state ────────────────────────────────────────────────

  const handleRetry = useCallback(
    async (studySetId: string, type: StudyMaterialType) => {
      setSubmitting(true);
      try {
        const res = await fetch('/api/study/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceNoteId: noteId, type }),
        });

        if (!mountedRef.current) return;

        if (res.status === 202) {
          const data = (await res.json()) as { studySetId: string };
          setGeneration({ phase: 'generating', studySetId: data.studySetId, type, polls: 0 });
          schedulePoll(data.studySetId, type, 0);
        } else if (res.status === 429) {
          const data = (await res.json()) as { error?: string };
          setGeneration({ phase: 'idle' });
          setToast({
            tone: 'warning',
            title:
              data.error ?? 'Too many in-flight generations — wait for one to finish.',
          });
        } else if (res.status === 401) {
          setGeneration({ phase: 'idle' });
          setToast({ tone: 'danger', title: 'Please sign in again.' });
        } else {
          setGeneration({ phase: 'idle' });
          setToast({ tone: 'danger', title: 'Something went wrong — please try again.' });
        }
      } catch {
        if (!mountedRef.current) return;
        setGeneration({ phase: 'idle' });
        setToast({ tone: 'danger', title: 'Network error — please try again.' });
      } finally {
        if (mountedRef.current) setSubmitting(false);
      }
    },
    [noteId, schedulePoll],
  );

  // ── Generate handler (from picker) ────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/study/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceNoteId: noteId, type: selectedType }),
      });

      if (!mountedRef.current) return;

      if (res.status === 202) {
        const data = (await res.json()) as { studySetId: string };
        setPickerOpen(false);
        setGeneration({ phase: 'generating', studySetId: data.studySetId, type: selectedType, polls: 0 });
        schedulePoll(data.studySetId, selectedType, 0);
      } else if (res.status === 429) {
        const data = (await res.json()) as { error?: string };
        setPickerOpen(false);
        setToast({
          tone: 'warning',
          title:
            data.error ?? 'Too many in-flight generations — wait for one to finish.',
        });
      } else if (res.status === 401) {
        setPickerOpen(false);
        setToast({ tone: 'danger', title: 'Please sign in again.' });
      } else {
        setToast({ tone: 'danger', title: 'Something went wrong — please try again.' });
      }
    } catch {
      if (!mountedRef.current) return;
      setToast({ tone: 'danger', title: 'Network error — please try again.' });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }, [noteId, selectedType, schedulePoll]);

  // ── Render ────────────────────────────────────────────────────────────────

  const genState = generation;

  return (
    <>
      {/* ── Trigger button (rendered inline by NoteViewScreen into ActionBar) ── */}
      <Button
        variant="secondary"
        fullWidth
        leftIcon={<Icon name="sparkles" size={18} />}
        onClick={() => {
          if (genState.phase === 'idle') {
            setPickerOpen(true);
          }
        }}
        disabled={genState.phase !== 'idle'}
      >
        Generate study material
      </Button>

      {/* ── In-progress banner ── */}
      {genState.phase === 'generating' && (
        <div className="tmn-study-progress" role="status">
          <Icon name="loader-circle" size={18} />
          <span>
            Generating your {STUDY_TYPE_META[genState.type].label.toLowerCase()}…
          </span>
        </div>
      )}

      {/* ── Failed state ── */}
      {genState.phase === 'failed' && (
        <div className="tmn-study-progress tmn-study-progress--error" role="alert">
          <Icon name="x" size={18} />
          <span>{genState.error}</span>
          <Button
            variant="ghost"
            size="sm"
            loading={submitting}
            onClick={() => void handleRetry(genState.studySetId, genState.type)}
          >
            Try again
          </Button>
        </div>
      )}

      {/* ── Timeout state ── */}
      {genState.phase === 'timeout' && (
        <div className="tmn-study-progress" role="status">
          <Icon name="loader-circle" size={18} />
          <span>Still processing — check back later.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleManualRefresh(genState.studySetId, genState.type)}
          >
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            rightIcon={<Icon name="arrow-right" size={14} />}
            onClick={() => router.push('/study')}
          >
            View all
          </Button>
        </div>
      )}

      {/* ── Type-picker Dialog ── */}
      <Dialog
        open={pickerOpen}
        onClose={() => {
          if (!submitting) setPickerOpen(false);
        }}
        title="Generate study material"
        description="Choose a format to generate from this note."
        footer={
          <Button
            variant="primary"
            fullWidth
            loading={submitting}
            onClick={() => void handleGenerate()}
          >
            Generate
          </Button>
        }
      >
        <div className="tmn-study-type-picker">
          {STUDY_TYPE_ORDER.map((type) => {
            const meta = STUDY_TYPE_META[type];
            const isSelected = selectedType === type;
            return (
              <button
                key={type}
                type="button"
                className={
                  'tmn-study-type-option' +
                  (isSelected ? ' tmn-study-type-option--selected' : '')
                }
                onClick={() => setSelectedType(type)}
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
