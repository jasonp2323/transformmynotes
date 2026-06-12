'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Icon, NoteCard } from '@/src/components/ui';
import { relativeTime } from '@/src/lib/library';
import type { NoteMetadata } from '@/src/lib/library';

// ─── Sub-components ───────────────────────────────────────────────────────────

function SearchPromptState() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '60px 20px',
        minHeight: 280,
      }}
    >
      <div
        style={{
          marginBottom: 20,
          color: 'var(--text-muted)',
          opacity: 0.5,
        }}
      >
        <Icon name="search" size={40} />
      </div>
      <h2
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 22,
          fontWeight: 600,
          color: 'var(--text-strong)',
          margin: '0 0 8px',
        }}
      >
        Search your notes
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          color: 'var(--text-muted)',
          margin: 0,
          lineHeight: 1.6,
          maxWidth: 280,
        }}
      >
        Find any note by a word in its title or body.
      </p>
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

// ─── Main component ───────────────────────────────────────────────────────────

export function SearchScreen() {
  const router = useRouter();

  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultsReady, setResultsReady] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // ── Debounce search input (300 ms) ────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Fetch notes when debounced query changes ──────────────────────────────
  useEffect(() => {
    if (!debouncedQuery) {
      abortRef.current?.abort();
      setNotes([]);
      setResultsReady(false);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const url = `/api/notes?q=${encodeURIComponent(debouncedQuery)}`;
    setLoading(true);
    setResultsReady(false);

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{ notes: NoteMetadata[] }>;
      })
      .then((data) => {
        setNotes(data.notes);
        setLoading(false);
        setResultsReady(true);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setLoading(false);
        setResultsReady(true);
      });

    return () => {
      controller.abort();
    };
  }, [debouncedQuery]);

  // ── Eyebrow label ─────────────────────────────────────────────────────────
  const eyebrow =
    resultsReady && !loading
      ? `${notes.length} result${notes.length === 1 ? '' : 's'}`
      : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Search input */}
      <Input
        leadingIcon={<Icon name="search" size={18} />}
        placeholder="Search your notes"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        aria-label="Search your notes"
        autoFocus
      />

      {/* Content area */}
      {!debouncedQuery ? (
        <SearchPromptState />
      ) : (
        <>
          {/* Eyebrow */}
          {eyebrow != null && (
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-subtle)',
                margin: '16px 0 12px',
              }}
            >
              {eyebrow}
            </div>
          )}

          {/* Results / empty state */}
          {resultsReady && notes.length === 0 ? (
            <SearchEmptyState query={debouncedQuery} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
              {notes.map((note) => (
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
    </div>
  );
}

SearchScreen.displayName = 'SearchScreen';
