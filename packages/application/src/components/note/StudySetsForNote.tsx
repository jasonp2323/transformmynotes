'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Icon, IconButton } from '@/src/components/ui';
import { STUDY_TYPE_META, type StudySetMeta } from '@/src/lib/study-ui';
import { relativeTime } from '@/src/lib/library';

// ── Component ──────────────────────────────────────────────────────────────────

export interface StudySetsForNoteProps {
  noteId: string;
  /** Increment this to trigger a re-fetch (e.g. after a new set becomes ready). */
  refreshNonce?: number;
}

export function StudySetsForNote({ noteId, refreshNonce = 0 }: StudySetsForNoteProps) {
  const router = useRouter();
  const [studySets, setStudySets] = useState<StudySetMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const fetchSets = useCallback(async () => {
    try {
      const res = await fetch(`/api/study?noteId=${encodeURIComponent(noteId)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { studySets: StudySetMeta[] };
      const sets = data.studySets ?? [];
      if (mountedRef.current) {
        setStudySets(sets);
        // Schedule next poll if any sets are still in-flight
        const hasPending = sets.some((s) => s.status === 'queued' || s.status === 'running');
        if (hasPending) {
          clearTimer();
          timerRef.current = setTimeout(() => {
            if (mountedRef.current) void fetchSets();
          }, 2000);
        }
      }
    } catch {
      // Silently fail — the list is supplementary
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, []);

  useEffect(() => {
    clearTimer();
    setLoading(true);
    void fetchSets();
  }, [fetchSets, refreshNonce]);

  // Escape-to-close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  if (loading || studySets.length === 0) return null;

  return (
    <>
      <button
        className="tmn-study-drawer-toggle"
        aria-expanded={open}
        aria-controls="tmn-study-drawer"
        aria-label="Study sets"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Icon name="panel-left" size={18} />
        <span className="tmn-study-drawer-toggle__count">{studySets.length}</span>
      </button>

      {open && (
        <div
          className="tmn-study-drawer-backdrop"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="tmn-study-drawer"
        className={`tmn-study-drawer${open ? ' tmn-study-drawer--open' : ''}`}
        role="dialog"
        aria-label="Study sets"
        aria-modal="true"
      >
        <div className="tmn-study-drawer__header">
          <h3 className="tmn-study-drawer__title">Study sets</h3>
          <IconButton
            label="Close study sets"
            variant="plain"
            onClick={() => setOpen(false)}
          >
            <Icon name="x" size={20} />
          </IconButton>
        </div>
        <div className="tmn-study-drawer__body">
          <ul className="tmn-study-sets-list">
            {studySets.map((set) => {
              const meta = STUDY_TYPE_META[set.type];
              const isReady = set.status === 'ready';
              const isPending = set.status === 'queued' || set.status === 'running';
              const isFailed = set.status === 'failed';

              return (
                <li key={set.studySetId}>
                  <button
                    type="button"
                    className={
                      'tmn-study-sets-item' +
                      (isReady ? ' tmn-study-sets-item--ready' : '') +
                      (isFailed ? ' tmn-study-sets-item--failed' : '')
                    }
                    disabled={!isReady}
                    onClick={() => {
                      if (isReady) {
                        router.push(`/study/${set.studySetId}`);
                        setOpen(false);
                      }
                    }}
                    aria-label={`${meta.label} — ${set.status}${isReady ? ', open' : ''}`}
                  >
                    <span className="tmn-study-sets-item__left">
                      <Badge tone={meta.tone}>
                        <Icon name={meta.icon} size={12} />
                        {meta.label}
                      </Badge>
                    </span>

                    <span className="tmn-study-sets-item__status">
                      {isPending && (
                        <span
                          className="tmn-study-sets-item__dot tmn-study-sets-item__dot--pulsing"
                          aria-hidden="true"
                        />
                      )}
                      {isReady && (
                        <Icon name="check-circle-2" size={14} />
                      )}
                      {isFailed && (
                        <Icon name="x" size={14} />
                      )}
                    </span>

                    <span className="tmn-study-sets-item__time">
                      {relativeTime(set.createdAt)}
                    </span>

                    {isReady && (
                      <span className="tmn-study-sets-item__arrow" aria-hidden="true">
                        <Icon name="arrow-right" size={14} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </>
  );
}

StudySetsForNote.displayName = 'StudySetsForNote';
