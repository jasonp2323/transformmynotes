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

export interface GenerateFromSourceProps {
  sourceId: string;
}

export function GenerateFromSource({ sourceId }: GenerateFromSourceProps) {
  const router = useRouter();

  // Picker dialog state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<StudyMaterialType>>(new Set());
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
    [router],
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
          body: JSON.stringify({
            type,
            sourceRefs: [{ type: 'document', id: sourceId }],
          }),
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
            title: data.error ?? 'Too many in-flight generations — wait for one to finish.',
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
    [sourceId, schedulePoll],
  );

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

    try {
      // All types (including flashcards) use the generic sourceRefs flow for document sources.
      const results = await Promise.all(
        types.map((type) =>
          fetch('/api/study/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type,
              sourceRefs: [{ type: 'document', id: sourceId }],
            }),
          }).then(async (res) => ({
            type,
            status: res.status,
            data: (await res.json()) as { studySetId?: string; error?: string },
          })),
        ),
      );

      if (!mountedRef.current) return;

      if (types.length === 1) {
        // Single-type path
        const result = results[0];
        if (!result) return;
        if (result.status === 202) {
          setPickerOpen(false);
          setSelected(new Set());
          setGeneration({
            phase: 'generating',
            studySetId: result.data.studySetId!,
            type: result.type,
            polls: 0,
          });
          schedulePoll(result.data.studySetId!, result.type, 0);
        } else if (result.status === 429) {
          setPickerOpen(false);
          setToast({
            tone: 'warning',
            title: result.data.error ?? 'Too many in-flight generations — wait for one to finish.',
          });
        } else if (result.status === 401) {
          setPickerOpen(false);
          setToast({ tone: 'danger', title: 'Please sign in again.' });
        } else if (result.status === 422) {
          setPickerOpen(false);
          setToast({
            tone: 'danger',
            title:
              result.data.error === 'source_not_ready'
                ? 'Source is not ready yet — wait for extraction to complete.'
                : 'Something went wrong — please try again.',
          });
        } else {
          setToast({ tone: 'danger', title: 'Something went wrong — please try again.' });
        }
      } else {
        // Multi-type path
        setPickerOpen(false);
        setSelected(new Set());

        const succeeded = results.filter((r) => r.status === 202).length;
        const rateLimited = results.filter((r) => r.status === 429).length;
        const unauthorized = results.some((r) => r.status === 401);

        if (unauthorized) {
          setToast({ tone: 'danger', title: 'Please sign in again.' });
        } else if (rateLimited > 0 && succeeded > 0) {
          setToast({
            tone: 'warning',
            title: `Started ${succeeded} of ${types.length} — the rest hit the in-flight limit. Try the others shortly.`,
          });
        } else if (rateLimited > 0 && succeeded === 0) {
          setToast({
            tone: 'warning',
            title: 'All requests hit the in-flight limit — wait for a generation to finish.',
          });
        } else {
          setToast({
            tone: 'success',
            title: `Generating ${succeeded} study ${succeeded === 1 ? 'set' : 'sets'}…`,
          });
          router.push('/study');
        }
      }
    } catch {
      if (!mountedRef.current) return;
      setToast({ tone: 'danger', title: 'Network error — please try again.' });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }, [selected, sourceId, schedulePoll, router]);

  // ── Render ────────────────────────────────────────────────────────────────

  const genState = generation;

  return (
    <>
      {/* Trigger button */}
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<Icon name="sparkles" size={14} />}
        onClick={() => {
          if (genState.phase === 'idle') {
            setPickerOpen(true);
          }
        }}
        disabled={genState.phase !== 'idle'}
      >
        Generate study material
      </Button>

      {/* In-progress banner */}
      {genState.phase === 'generating' && (
        <div className="tmn-study-progress" role="status">
          <Icon name="loader-circle" size={18} />
          <span>
            Generating your {STUDY_TYPE_META[genState.type].label.toLowerCase()}…
          </span>
        </div>
      )}

      {/* Failed state */}
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

      {/* Timeout state */}
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

      {/* Type-picker Dialog */}
      <Dialog
        open={pickerOpen}
        onClose={() => {
          if (!submitting) {
            setPickerOpen(false);
            setSelected(new Set());
          }
        }}
        title="Generate study material"
        description="Choose a format to generate from this document."
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

      {/* Toast */}
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

GenerateFromSource.displayName = 'GenerateFromSource';
