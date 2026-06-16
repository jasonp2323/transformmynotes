'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Icon } from '@/src/components/ui';
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

  if (loading || studySets.length === 0) return null;

  return (
    <section className="tmn-study-sets-section" aria-label="Study sets for this note">
      <h2 className="tmn-study-sets-section__heading">Study sets</h2>
      <ul className="tmn-study-sets-list" role="list">
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
                  if (isReady) router.push(`/study/${set.studySetId}`);
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
    </section>
  );
}

StudySetsForNote.displayName = 'StudySetsForNote';
