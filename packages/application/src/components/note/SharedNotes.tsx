'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { NoteCard } from '@/src/components/ui';

// Mirrors the SharedNoteSummary shape returned by GET /api/shared
interface SharedNoteSummary {
  noteId: string;
  noteTitle: string;
  ownerSub: string;
  ownerName: string;
  groupId: string;
  groupName: string;
  sharedAt: string;
}

export function SharedNotes() {
  const router = useRouter();
  const [notes, setNotes] = useState<SharedNoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(false);

    fetch('/api/shared', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{ notes: SharedNoteSummary[] }>;
      })
      .then((data) => {
        setNotes(data.notes);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(true);
        setLoading(false);
      });

    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (loading) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '48px 20px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-sans)',
          fontSize: 14.5,
        }}
      >
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '48px 20px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-sans)',
          fontSize: 14.5,
        }}
      >
        Couldn&rsquo;t load shared notes &mdash; try again.
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '48px 20px',
          color: 'var(--text-subtle)',
          fontFamily: 'var(--font-sans)',
          fontSize: 14.5,
        }}
      >
        No notes shared with you yet.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {notes.map((note) => (
        <NoteCard
          key={note.noteId}
          title={note.noteTitle}
          sharedBy={
            note.groupName
              ? `Shared by ${note.ownerName} · ${note.groupName}`
              : `Shared by ${note.ownerName}`
          }
          onClick={() => router.push(`/notes/${note.noteId}?owner=${note.ownerSub}`)}
        />
      ))}
    </div>
  );
}

SharedNotes.displayName = 'SharedNotes';
