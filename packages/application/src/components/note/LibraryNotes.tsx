'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Input,
  Icon,
  SegmentedControl,
  NoteCard,
  HandNote,
  Button,
  Toast,
  Checkbox,
  Dialog,
} from '@/src/components/ui';
import { relativeTime, filterNotesByTab } from '@/src/lib/library';
import type { NoteMetadata, LibraryTab } from '@/src/lib/library';
import { SharedNotes } from './SharedNotes';
import { NoteSetPicker } from '@/src/components/study/NoteSetPicker';

// ─── Sub-components ───────────────────────────────────────────────────────────

function NotebookEmptyState() {
  const router = useRouter();
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 14px 60px',
        minHeight: 340,
      }}
    >
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <HandNote
          tilt={-4}
          lines={['minhas anotações…', 'para transformar', '— ✎ —']}
          style={{ width: 168, padding: '18px 16px', opacity: 0.96 }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: -14,
            bottom: -12,
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'var(--gradient-transform)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-brand)',
          }}
        >
          <Icon name="sparkles" size={20} color="#fff" />
        </div>
      </div>
      <h2
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 24,
          fontWeight: 600,
          color: 'var(--text-strong)',
          margin: '0 0 8px',
        }}
      >
        Your notebook is empty
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 16,
          color: 'var(--text-muted)',
          margin: '0 0 24px',
          lineHeight: 1.6,
          maxWidth: 280,
        }}
      >
        Photograph a handwritten page and we&rsquo;ll turn it into a clean, searchable note.
      </p>
      <Button
        variant="primary"
        size="lg"
        leftIcon={<Icon name="scan-line" size={19} />}
        onClick={() => router.push('/capture')}
      >
        Capture your first note
      </Button>
      <button
        onClick={() => router.push('/capture')}
        style={{
          marginTop: 14,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: 'var(--text-link)',
          fontFamily: 'var(--font-sans)',
          fontSize: 14.5,
          fontWeight: 600,
        }}
      >
        or upload an image
      </button>
    </div>
  );
}

function SearchEmptyState({ query }: { query: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 20px',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-sans)',
        fontSize: 15,
      }}
    >
      No notes match &ldquo;{query}&rdquo;
    </div>
  );
}

function OfflineBanner() {
  return (
    <div
      role="status"
      style={{
        margin: '0 0 16px',
        padding: '12px 14px',
        borderRadius: 12,
        background: 'var(--warning-50)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Icon name="cloud-off" size={20} color="var(--warning-500)" />
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13.5,
          color: 'var(--stone-700)',
          lineHeight: 1.4,
        }}
      >
        <strong>You&rsquo;re offline.</strong> Saved notes are still readable.
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LibraryNotes() {
  const router = useRouter();

  // Search state
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Notes state
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Tab state
  const [tab, setTab] = useState<LibraryTab>('all');

  // Offline state — initialize to true (online) to avoid hydration mismatch
  const [isOnline, setIsOnline] = useState(true);
  const [showOfflineToast, setShowOfflineToast] = useState(false);
  const [genPickerOpen, setGenPickerOpen] = useState(false);

  // Selection mode state
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickerInitialStep, setPickerInitialStep] = useState<1 | 2>(1);

  // Long-press delete state
  const [armedNoteId, setArmedNoteId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NoteMetadata | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // AbortController ref to cancel stale in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  // ── Outside-click / Escape dismissal of armed card ────────────────────────
  useEffect(() => {
    if (!armedNoteId) return;

    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element | null;
      if (!target) return;
      const card = target.closest('[data-armed-card]');
      if (!card) {
        setArmedNoteId(null);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setArmedNoteId(null);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [armedNoteId]);

  // ── Online/offline detection ───────────────────────────────────────────────
  useEffect(() => {
    // Sync to actual browser value after mount (avoids SSR mismatch)
    setIsOnline(navigator.onLine);

    function handleOnline() {
      setIsOnline(true);
      setShowOfflineToast(false);
    }
    function handleOffline() {
      setIsOnline(false);
      setShowOfflineToast(true);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── Debounce search input (300 ms) ────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Fetch notes ────────────────────────────────────────────────────────────
  const fetchNotes = useCallback((query: string) => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const url = query
      ? `/api/notes?q=${encodeURIComponent(query)}`
      : '/api/notes';

    setLoading(true);

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{ notes: NoteMetadata[] }>;
      })
      .then((data) => {
        setNotes(data.notes);
        setLoading(false);
        setInitialLoadDone(true);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setLoading(false);
        setInitialLoadDone(true);
      });
  }, []);

  // Refetch whenever the debounced query changes (including on initial mount)
  useEffect(() => {
    fetchNotes(debouncedQuery);
    return () => {
      abortRef.current?.abort();
    };
  }, [debouncedQuery, fetchNotes]);

  // ── Filtered notes (client-side tab filter) ───────────────────────────────
  const filteredNotes = filterNotesByTab(notes, tab);

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleSelect = useCallback((noteId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  }, []);

  const allFilteredSelected =
    filteredNotes.length > 0 && filteredNotes.every((n) => selected.has(n.noteId));
  const someFilteredSelected = filteredNotes.some((n) => selected.has(n.noteId));

  const toggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const filteredIds = new Set(filteredNotes.map((n) => n.noteId));
        const next = new Set(prev);
        for (const id of filteredIds) next.delete(id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const n of filteredNotes) next.add(n.noteId);
        return next;
      });
    }
  }, [allFilteredSelected, filteredNotes]);

  const exitSelecting = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  const openGeneratePicker = useCallback(() => {
    setPickerInitialStep(2);
    setGenPickerOpen(true);
  }, []);

  const handlePickerClose = useCallback(() => {
    setGenPickerOpen(false);
    exitSelecting();
  }, [exitSelecting]);

  // ── Long-press delete helpers ─────────────────────────────────────────────
  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const noteId = pendingDelete.noteId;
    setDeleting(true);
    setDeleteError(null);

    // Optimistic removal
    setNotes((prev) => prev.filter((n) => n.noteId !== noteId));
    setPendingDelete(null);
    setArmedNoteId(null);

    try {
      const res = await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
    } catch (err) {
      // Rollback: refetch
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete note');
      fetchNotes(debouncedQuery);
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, fetchNotes, debouncedQuery]);

  // ── Window event: tmn:study-select-toggle (dispatched by mobile nav button) ─
  useEffect(() => {
    function handleStudySelectToggle() {
      if (selecting) {
        exitSelecting();
      } else {
        setSelecting(true);
      }
    }
    window.addEventListener('tmn:study-select-toggle', handleStudySelectToggle);
    return () => {
      window.removeEventListener('tmn:study-select-toggle', handleStudySelectToggle);
    };
  }, [selecting, exitSelecting]);

  // ── Eyebrow label ─────────────────────────────────────────────────────────
  const eyebrow = debouncedQuery
    ? `${filteredNotes.length} result${filteredNotes.length === 1 ? '' : 's'}`
    : 'Recent';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Offline banner */}
      {!isOnline && <OfflineBanner />}

      {/* Search input */}
      <Input
        leadingIcon={<Icon name="search" size={18} />}
        placeholder="Search your notes"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        aria-label="Search your notes"
      />

      {/* Segmented tab control */}
      <div style={{ margin: '16px 0 18px' }}>
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as LibraryTab)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'review', label: 'Review' },
            { value: 'shared', label: 'Shared' },
          ]}
        />
      </div>

      {/* Shared notes (no eyebrow, no search list) */}
      {tab === 'shared' ? (
        <SharedNotes />
      ) : (
        <>
          {/* Eyebrow — hide while first load is in progress */}
          {initialLoadDone && (
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-subtle)',
                margin: '0 0 12px',
              }}
            >
              {eyebrow}
            </div>
          )}

          {/* Note list / empty states */}
          {!initialLoadDone && loading ? null : filteredNotes.length === 0 ? (
            debouncedQuery ? (
              <SearchEmptyState query={debouncedQuery} />
            ) : (
              <NotebookEmptyState />
            )
          ) : (
            <>
              {/* Desktop-only trigger — shown above the note list, hidden on mobile */}
              {!selecting && (
                <div className="hidden md:block" style={{ marginBottom: 14 }}>
                  <Button
                    variant="secondary"
                    leftIcon={<Icon name="sparkles" size={18} />}
                    onClick={() => {
                      setPickerInitialStep(1);
                      setSelecting(true);
                    }}
                  >
                    Generate study material
                  </Button>
                </div>
              )}

              {/* Selection mode header row */}
              {selecting && (
                <div style={{ marginBottom: 12 }}>
                  {/* Row: Select all checkbox + count + Cancel */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 0',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <Checkbox
                      checked={allFilteredSelected}
                      indeterminate={someFilteredSelected && !allFilteredSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all notes"
                    />
                    <span
                      style={{
                        flex: 1,
                        fontFamily: 'var(--font-sans)',
                        fontSize: 14,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {selected.size} selected
                    </span>
                    <button
                      type="button"
                      onClick={exitSelecting}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 14,
                        fontWeight: 500,
                        color: 'var(--text-link)',
                        padding: '4px 0',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {/* Full-width in-flow CTA — not fixed, never overlaps bottom nav */}
                  <div style={{ paddingTop: 10 }}>
                    <Button
                      variant="primary"
                      leftIcon={<Icon name="sparkles" size={18} />}
                      disabled={selected.size === 0}
                      onClick={openGeneratePicker}
                      style={{ width: '100%' }}
                    >
                      Generate study material
                    </Button>
                  </div>
                </div>
              )}

              {/* Note list */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                {filteredNotes.map((note) => (
                  <div key={note.noteId} data-armed-card={armedNoteId === note.noteId ? 'true' : undefined}>
                    <NoteCard
                      title={note.title}
                      tags={note.tags}
                      highlights={note.highlights}
                      words={note.words}
                      status={note.status}
                      when={relativeTime(note.updatedAt)}
                      course={note.groupId}
                      selectable={selecting}
                      selected={selected.has(note.noteId)}
                      onClick={
                        selecting
                          ? () => toggleSelect(note.noteId)
                          : () => router.push(`/notes/${note.noteId}`)
                      }
                      onLongPress={
                        selecting
                          ? undefined
                          : () => setArmedNoteId(note.noteId)
                      }
                      armed={armedNoteId === note.noteId}
                      onDelete={() => setPendingDelete(note)}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <NoteSetPicker
        open={genPickerOpen}
        onClose={handlePickerClose}
        initialSelectedIds={Array.from(selected)}
        initialStep={pickerInitialStep}
      />

      {/* Offline toast */}
      {showOfflineToast && (
        <div
          style={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: 88,
            zIndex: 50,
          }}
        >
          <Toast
            tone="neutral"
            icon={<Icon name="cloud-off" size={20} />}
            title="You're offline"
            onClose={() => setShowOfflineToast(false)}
          >
            Saved notes are still readable.
          </Toast>
        </div>
      )}

      {/* Delete error toast */}
      {deleteError && (
        <div
          style={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: 88,
            zIndex: 50,
          }}
        >
          <Toast
            tone="danger"
            icon={<Icon name="alert-circle" size={20} />}
            title="Could not delete note"
            onClose={() => setDeleteError(null)}
          >
            {deleteError}
          </Toast>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete note?"
        description={
          pendingDelete?.title
            ? `"${pendingDelete.title}" will be permanently deleted.`
            : 'This note will be permanently deleted.'
        }
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
              disabled={deleting}
              leftIcon={deleting ? <Icon name="loader-circle" size={16} className="animate-spin" /> : undefined}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        }
      />
    </div>
  );
}

LibraryNotes.displayName = 'LibraryNotes';
