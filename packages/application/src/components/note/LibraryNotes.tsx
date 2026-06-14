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
} from '@/src/components/ui';
import { relativeTime, filterNotesByTab } from '@/src/lib/library';
import type { NoteMetadata, LibraryTab } from '@/src/lib/library';
import { SharedNotes } from './SharedNotes';

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

  // AbortController ref to cancel stale in-flight requests
  const abortRef = useRef<AbortController | null>(null);

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {filteredNotes.map((note) => (
                <NoteCard
                  key={note.noteId}
                  title={note.title}
                  tags={note.tags}
                  highlights={note.highlights}
                  words={note.words}
                  status={note.status}
                  when={relativeTime(note.updatedAt)}
                  course={note.groupId}
                  onClick={() => router.push(`/notes/${note.noteId}`)}
                />
              ))}
            </div>
          )}
        </>
      )}

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
    </div>
  );
}

LibraryNotes.displayName = 'LibraryNotes';
