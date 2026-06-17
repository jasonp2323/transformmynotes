'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Checkbox,
  Dialog,
  Icon,
  Input,
  Toast,
} from '@/src/components/ui';
import { STUDY_TYPE_META, STUDY_TYPE_ORDER } from '@/src/lib/study-ui';
import type { StudyMaterialType } from '@transformmynotes/core';
import type { NoteMetadata } from '@/src/lib/library';

// ── Constants ─────────────────────────────────────────────────────────────────

const HARD_CAP_TOKENS = 200_000;
const MAX_SOURCE_NOTES = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToastState {
  tone: 'success' | 'danger' | 'neutral' | 'warning';
  title: string;
}

interface DryRunResult {
  estimatedTokens: number;
  estimatedCostUsd: number;
  mapReduceNeeded: boolean;
  noteCount: number;
  rateLimitRemaining: number;
  truncatedFrom?: number;
}

type DryRunState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'done'; result: DryRunResult };

// ── Props ─────────────────────────────────────────────────────────────────────

export interface NoteSetPickerProps {
  open: boolean;
  onClose: () => void;
  initialSelectedIds?: string[];
  initialGroupId?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NoteSetPicker({
  open,
  onClose,
  initialSelectedIds,
  initialGroupId,
}: NoteSetPickerProps) {
  const router = useRouter();

  // Step: 1=note picker, 2=type picker, 3=confirm (multi-note only)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Selection state
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [selectedType, setSelectedType] = useState<StudyMaterialType | null>(null);

  // Note data
  const [recentNotes, setRecentNotes] = useState<NoteMetadata[]>([]);
  const [searchResults, setSearchResults] = useState<NoteMetadata[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  // Search
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Dry-run state (step 3)
  const [dryRun, setDryRun] = useState<DryRunState>({ phase: 'idle' });
  const [submitting, setSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<ToastState | null>(null);

  // AbortController for search
  const searchAbortRef = useRef<AbortController | null>(null);
  const prevOpenRef = useRef(false);

  // ── Reset on open ────────────────────────────────────────────────────────

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      // Transitioned from closed → open
      setStep(1);
      setSelectedType(null);
      setSearchInput('');
      setDebouncedQuery('');
      setDryRun({ phase: 'idle' });
      setSubmitting(false);

      // Apply initialSelectedIds
      const initial = new Set<string>(initialSelectedIds ?? []);
      setSelectedNoteIds(initial);

      // Fetch recent notes
      fetchRecentNotes(initial, initialGroupId);
    }
    prevOpenRef.current = open;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounce search ──────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Fetch on debounced query change ──────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    if (debouncedQuery === '') {
      setSearchResults([]);
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    void (async () => {
      try {
        const res = await fetch(
          `/api/notes?q=${encodeURIComponent(debouncedQuery)}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { notes: NoteMetadata[] };
        setSearchResults(data.notes);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    })();

    return () => controller.abort();
  }, [debouncedQuery, open]);

  // ── Fetch recent notes ───────────────────────────────────────────────────

  const fetchRecentNotes = useCallback(
    async (preSelected: Set<string>, groupId?: string) => {
      setLoadingNotes(true);
      try {
        const res = await fetch('/api/notes');
        if (!res.ok) return;
        const data = (await res.json()) as { notes: NoteMetadata[] };
        setRecentNotes(data.notes);

        // Pre-check notes with matching groupId
        if (groupId) {
          const groupMatches = data.notes
            .filter((n) => n.groupId === groupId)
            .map((n) => n.noteId);
          setSelectedNoteIds((prev) => {
            const next = new Set(prev);
            for (const id of groupMatches) next.add(id);
            // Also add from preSelected
            for (const id of preSelected) next.add(id);
            return next;
          });
        }
      } catch {
        // best-effort
      } finally {
        setLoadingNotes(false);
      }
    },
    [],
  );

  // ── All fetched notes (recent + search results merged, deduplicated) ──────

  const allKnownNotes = React.useMemo(() => {
    const map = new Map<string, NoteMetadata>();
    for (const n of recentNotes) map.set(n.noteId, n);
    for (const n of searchResults) map.set(n.noteId, n);
    return map;
  }, [recentNotes, searchResults]);

  // ── Token estimate ────────────────────────────────────────────────────────

  const estimatedTokens = React.useMemo(() => {
    let total = 0;
    for (const id of selectedNoteIds) {
      const note = allKnownNotes.get(id);
      if (note) total += note.words * 1.3;
    }
    return total;
  }, [selectedNoteIds, allKnownNotes]);

  // ── Distinct groupIds from recent notes ───────────────────────────────────

  const distinctGroups = React.useMemo(() => {
    const seen = new Set<string | undefined>();
    const groups: Array<{ groupId: string | undefined; label: string }> = [];
    for (const n of recentNotes) {
      const key = n.groupId || undefined;
      if (!seen.has(key)) {
        seen.add(key);
        groups.push({
          groupId: key,
          label: key ? `All in ${key}` : 'All in Ungrouped',
        });
      }
    }
    return groups;
  }, [recentNotes]);

  // ── Toggle selection ──────────────────────────────────────────────────────

  const toggleNote = useCallback((noteId: string) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  }, []);

  const selectGroup = useCallback(
    (groupId: string | undefined) => {
      const groupNoteIds = recentNotes
        .filter((n) => (n.groupId || undefined) === groupId)
        .map((n) => n.noteId);
      setSelectedNoteIds((prev) => {
        const next = new Set(prev);
        for (const id of groupNoteIds) next.add(id);
        return next;
      });
    },
    [recentNotes],
  );

  const removeNote = useCallback((noteId: string) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      next.delete(noteId);
      return next;
    });
  }, []);

  // ── Step 1 CTA validation ─────────────────────────────────────────────────

  const step1Disabled =
    selectedNoteIds.size === 0 ||
    selectedNoteIds.size > MAX_SOURCE_NOTES ||
    estimatedTokens > HARD_CAP_TOKENS;

  const step1Title =
    selectedNoteIds.size > MAX_SOURCE_NOTES
      ? 'Maximum 50 notes per generation'
      : estimatedTokens > HARD_CAP_TOKENS
      ? 'Too many notes — remove some.'
      : undefined;

  // ── Step 2: proceed ───────────────────────────────────────────────────────

  const handleStep2Continue = useCallback(async () => {
    if (!selectedType) return;
    const sourceNoteIds = Array.from(selectedNoteIds);

    if (sourceNoteIds.length === 1) {
      const noteId = sourceNoteIds[0]!;

      if (selectedType === 'flashcards') {
        onClose();
        setStep(1);
        router.push(`/notes/${noteId}/generate-cards`);
        return;
      }

      // Single note, non-flashcard: dispatch immediately
      setSubmitting(true);
      try {
        const res = await fetch('/api/study/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceNoteId: noteId, type: selectedType }),
        });
        if (res.status === 202) {
          const data = (await res.json()) as { studySetId: string };
          onClose();
          setStep(1);
          router.push(`/study/${data.studySetId}`);
        } else if (res.status === 429) {
          const data = (await res.json()) as { error?: string };
          setToast({
            tone: 'warning',
            title: data.error ?? 'Too many in-flight generations.',
          });
        } else {
          setToast({ tone: 'danger', title: 'Something went wrong — please try again.' });
        }
      } catch {
        setToast({ tone: 'danger', title: 'Network error — please try again.' });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Multi-note: go to step 3 and kick off dry run
    setStep(3);
    setDryRun({ phase: 'loading' });

    try {
      const res = await fetch('/api/study/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedType,
          sourceNoteIds,
          dryRun: true,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setDryRun({
          phase: 'error',
          message: data.error ?? `Request failed (${res.status})`,
        });
        return;
      }
      const result = (await res.json()) as DryRunResult;
      setDryRun({ phase: 'done', result });
    } catch {
      setDryRun({ phase: 'error', message: 'Network error — please try again.' });
    }
  }, [selectedType, selectedNoteIds, onClose, router]);

  // ── Step 3: dispatch ──────────────────────────────────────────────────────

  const handleDispatch = useCallback(async () => {
    if (!selectedType) return;
    const sourceNoteIds = Array.from(selectedNoteIds);

    setSubmitting(true);
    try {
      const res = await fetch('/api/study/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: selectedType, sourceNoteIds }),
      });

      if (res.status === 202) {
        const data = (await res.json()) as { studySetId: string };
        onClose();
        setStep(1);
        router.push(`/study/${data.studySetId}`);
      } else if (res.status === 422) {
        const data = (await res.json()) as { error?: string; max?: number };
        setToast({
          tone: 'danger',
          title:
            data.error === 'too_many_notes' && data.max != null
              ? `Too many notes — the limit is ${data.max}.`
              : 'Too many notes — remove some and try again.',
        });
      } else if (res.status === 429) {
        const data = (await res.json()) as { error?: string };
        setToast({
          tone: 'warning',
          title: data.error ?? 'Too many in-flight generations.',
        });
      } else {
        setToast({ tone: 'danger', title: 'Something went wrong — please try again.' });
      }
    } catch {
      setToast({ tone: 'danger', title: 'Network error — please try again.' });
    } finally {
      setSubmitting(false);
    }
  }, [selectedType, selectedNoteIds, onClose, router]);

  // ── Retry dry run ────────────────────────────────────────────────────────

  const handleRetryDryRun = useCallback(async () => {
    if (!selectedType) return;
    const sourceNoteIds = Array.from(selectedNoteIds);

    setDryRun({ phase: 'loading' });
    try {
      const res = await fetch('/api/study/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedType,
          sourceNoteIds,
          dryRun: true,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setDryRun({
          phase: 'error',
          message: data.error ?? `Request failed (${res.status})`,
        });
        return;
      }
      const result = (await res.json()) as DryRunResult;
      setDryRun({ phase: 'done', result });
    } catch {
      setDryRun({ phase: 'error', message: 'Network error — please try again.' });
    }
  }, [selectedType, selectedNoteIds]);

  // ── Handle close ──────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    onClose();
    setStep(1);
  }, [onClose]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const displayNotes = debouncedQuery ? searchResults : recentNotes;
  const selectedCount = selectedNoteIds.size;

  // Selected notes that we know about (for chips)
  const selectedNotesMeta = Array.from(selectedNoteIds)
    .map((id) => allKnownNotes.get(id))
    .filter((n): n is NoteMetadata => n != null);

  // ── Dialog title / description ────────────────────────────────────────────

  const dialogTitle =
    step === 1
      ? 'Select notes'
      : step === 2
      ? 'Choose format'
      : 'Confirm generation';

  const dialogDescription =
    step === 1
      ? 'Select the notes to generate study material from.'
      : step === 2
      ? `Choose a format to generate from ${selectedCount} ${selectedCount === 1 ? 'note' : 'notes'}.`
      : undefined;

  // ── Step 1 footer ─────────────────────────────────────────────────────────

  const step1Footer = (
    <Button
      variant="primary"
      fullWidth
      disabled={step1Disabled}
      title={step1Title}
      onClick={() => setStep(2)}
    >
      Generate from {selectedCount} {selectedCount === 1 ? 'note' : 'notes'}
    </Button>
  );

  // ── Step 2 footer ─────────────────────────────────────────────────────────

  const step2Footer = (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button variant="ghost" onClick={() => setStep(1)}>
        Back
      </Button>
      <Button
        variant="primary"
        fullWidth
        disabled={!selectedType || submitting}
        loading={submitting}
        onClick={() => void handleStep2Continue()}
      >
        Continue
      </Button>
    </div>
  );

  // ── Step 3 footer ─────────────────────────────────────────────────────────

  const canDispatch =
    dryRun.phase === 'done' &&
    dryRun.result.rateLimitRemaining > 0 &&
    (dryRun.result.mapReduceNeeded || dryRun.result.estimatedTokens <= HARD_CAP_TOKENS);

  const step3Footer = (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button variant="ghost" onClick={() => setStep(2)}>
        Back
      </Button>
      {canDispatch && (
        <Button
          variant="primary"
          fullWidth
          loading={submitting}
          disabled={submitting}
          onClick={() => void handleDispatch()}
        >
          Continue
        </Button>
      )}
    </div>
  );

  const dialogFooter =
    step === 1 ? step1Footer : step === 2 ? step2Footer : step3Footer;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        title={dialogTitle}
        description={dialogDescription}
        footer={dialogFooter}
      >
        {/* ── Step 1: Note picker ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Selected notes chips */}
            {selectedNotesMeta.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selectedNotesMeta.map((note) => (
                  <div
                    key={note.noteId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 8px',
                      borderRadius: 999,
                      background: 'var(--brand-50)',
                      border: '1px solid var(--brand-200)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 13,
                      color: 'var(--brand-700)',
                    }}
                  >
                    <span>{note.title}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${note.title}`}
                      onClick={() => removeNote(note.noteId)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        padding: 2,
                        color: 'var(--brand-500)',
                      }}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Search input */}
            <Input
              leadingIcon={<Icon name="search" size={18} />}
              placeholder="Search notes"
              aria-label="Search notes"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />

            {/* Recently edited section */}
            {!debouncedQuery && (
              <>
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-subtle)',
                    marginBottom: 2,
                  }}
                >
                  Recently edited
                </div>

                {/* Notebook quick-select buttons */}
                {distinctGroups.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {distinctGroups.map(({ groupId, label }) => (
                      <button
                        key={groupId ?? '__ungrouped__'}
                        type="button"
                        onClick={() => selectGroup(groupId)}
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: 12,
                          fontWeight: 500,
                          padding: '4px 10px',
                          borderRadius: 999,
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--surface-1)',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Note rows */}
            {loadingNotes ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  padding: '8px 0',
                }}
              >
                <Icon name="loader-circle" size={16} />
                Loading…
              </div>
            ) : displayNotes.length === 0 && debouncedQuery ? (
              <div
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  color: 'var(--text-muted)',
                  padding: '12px 0',
                  textAlign: 'center',
                }}
              >
                No notes match &ldquo;{debouncedQuery}&rdquo;
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {displayNotes.map((note) => {
                  const checked = selectedNoteIds.has(note.noteId);
                  return (
                    <label
                      key={note.noteId}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '8px 4px',
                        borderRadius: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <Checkbox
                        checked={checked}
                        onChange={() => toggleNote(note.noteId)}
                        aria-label={note.title}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize: 14,
                            fontWeight: 500,
                            color: 'var(--text-strong)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {note.title}
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            marginTop: 2,
                          }}
                        >
                          {note.groupId && (
                            <span style={{ marginRight: 6 }}>{note.groupId}</span>
                          )}
                          <span>{formatDate(note.updatedAt)}</span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Type picker ── */}
        {step === 2 && (
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
        )}

        {/* ── Step 3: Confirm ── */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {dryRun.phase === 'loading' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                }}
              >
                <Icon name="loader-circle" size={18} />
                Estimating…
              </div>
            )}

            {dryRun.phase === 'error' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 14,
                    color: 'var(--danger-600)',
                  }}
                >
                  {dryRun.message}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleRetryDryRun()}
                >
                  Retry
                </Button>
              </div>
            )}

            {dryRun.phase === 'done' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Note count */}
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 14,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {dryRun.result.truncatedFrom != null
                    ? `Generating from ${dryRun.result.noteCount} of ${dryRun.result.truncatedFrom} notes (limit reached)`
                    : `Generating from ${dryRun.result.noteCount} notes`}
                </div>

                {/* Token estimate */}
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    color: 'var(--text-muted)',
                  }}
                >
                  Estimated tokens: {dryRun.result.estimatedTokens.toLocaleString()}
                </div>

                {/* Cost estimate */}
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    color: 'var(--text-muted)',
                  }}
                >
                  Estimated cost: ~${dryRun.result.estimatedCostUsd.toFixed(2)}
                </div>

                {/* Map-reduce notice */}
                {dryRun.result.mapReduceNeeded && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'var(--brand-50)',
                      border: '1px solid var(--brand-200)',
                    }}
                  >
                    <Icon name="info" size={16} color="var(--brand-600)" />
                    <span
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 13,
                        color: 'var(--brand-700)',
                      }}
                    >
                      This run uses multi-pass processing and may take 30–60 s.
                    </span>
                  </div>
                )}

                {/* Rate limit error */}
                {dryRun.result.rateLimitRemaining <= 0 && (
                  <div
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 13,
                      color: 'var(--danger-600)',
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'var(--danger-50)',
                      border: '1px solid var(--danger-200)',
                    }}
                  >
                    Generation limit reached — wait for an in-progress run to finish.
                  </div>
                )}

                {/* Token cap error (non-map-reduce only) */}
                {!dryRun.result.mapReduceNeeded &&
                  dryRun.result.estimatedTokens > HARD_CAP_TOKENS && (
                    <div
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 13,
                        color: 'var(--danger-600)',
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: 'var(--danger-50)',
                        border: '1px solid var(--danger-200)',
                      }}
                    >
                      Too many notes — remove some notes and try again.
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
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

NoteSetPicker.displayName = 'NoteSetPicker';
