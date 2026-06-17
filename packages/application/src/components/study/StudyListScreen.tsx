'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { StudySetMeta } from '@/src/lib/study-ui';
import { STUDY_TYPE_META } from '@/src/lib/study-ui';
import { relativeTime } from '@/src/lib/library';
import { AppShell } from '@/src/components/shells';
import { Badge } from '@/src/components/ui/Badge';
import { Icon } from '@/src/components/ui/Icon';
import { IconButton } from '@/src/components/ui/IconButton';
import { Button } from '@/src/components/ui/Button';
import { Dialog } from '@/src/components/ui/Dialog';
import { Toast } from '@/src/components/ui/Toast';
import { useLongPress } from '@/src/lib/longPress';

function StatusIndicator({ status }: { status: StudySetMeta['status'] }) {
  if (status === 'ready') {
    return <Icon name="check-circle-2" size={16} className="text-success" />;
  }
  if (status === 'failed') {
    return <Icon name="x" size={16} className="text-danger" />;
  }
  // queued or running — pulsing dot
  return (
    <span className="inline-block w-2 h-2 rounded-full bg-brand animate-pulse" aria-label={status} />
  );
}

interface StudyListItemProps {
  set: StudySetMeta;
  meta: (typeof STUDY_TYPE_META)[keyof typeof STUDY_TYPE_META];
  isNavigable: boolean;
  armed: boolean;
  onNavigate: () => void;
  onArm: () => void;
  onDelete: () => void;
}

function StudyListItem({
  set,
  meta,
  isNavigable,
  armed,
  onNavigate,
  onArm,
  onDelete,
}: StudyListItemProps) {
  const longPressProps = useLongPress(onArm);

  return (
    <div
      className={[
        'w-full flex items-start gap-3 py-4 text-left relative',
        isNavigable ? 'cursor-pointer hover:bg-surface-sunken transition-colors' : 'cursor-default opacity-70',
      ].join(' ')}
      {...longPressProps}
      onClick={isNavigable && !armed ? onNavigate : undefined}
      role="button"
      tabIndex={isNavigable ? 0 : -1}
      onKeyDown={
        isNavigable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onNavigate();
            }
          : undefined
      }
      aria-label={set.title}
    >
      <div className="mt-0.5 shrink-0">
        <Badge tone={meta.tone}>
          <Icon name={meta.icon} size={12} />
          <span className="ml-1">{meta.label}</span>
        </Badge>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{set.title}</p>
        {set.status === 'failed' && set.error && (
          <p className="mt-0.5 text-xs text-danger line-clamp-2">{set.error}</p>
        )}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1.5 ml-2">
        {armed ? (
          <IconButton
            label="Delete study set"
            variant="soft"
            size="sm"
            style={{ color: 'var(--danger-600)' }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Icon name="trash-2" size={18} />
          </IconButton>
        ) : (
          <>
            <StatusIndicator status={set.status} />
            <span className="text-xs text-text-muted whitespace-nowrap">
              {relativeTime(set.createdAt)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function StudyListScreen() {
  const router = useRouter();
  const [studySets, setStudySets] = useState<StudySetMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Long-press delete state
  const [armedId, setArmedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StudySetMeta | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/study')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load study sets');
        const data = (await res.json()) as { studySets: StudySetMeta[] };
        setStudySets(data.studySets);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, []);

  // ── Outside-click / Escape dismissal of armed item ────────────────────────
  useEffect(() => {
    if (!armedId) return;

    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element | null;
      if (!target) return;
      const item = target.closest('[data-armed-item]');
      if (!item) {
        setArmedId(null);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setArmedId(null);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [armedId]);

  // ── Delete handler ────────────────────────────────────────────────────────
  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const studySetId = pendingDelete.studySetId;
    setDeleting(true);
    setDeleteError(null);

    // Optimistic removal
    setStudySets((prev) => prev.filter((s) => s.studySetId !== studySetId));
    setPendingDelete(null);
    setArmedId(null);

    try {
      const res = await fetch(`/api/study/${studySetId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete study set');
      // Refetch to restore
      fetch('/api/study')
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as { studySets: StudySetMeta[] };
          setStudySets(data.studySets);
        })
        .catch(() => {/* ignore */});
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete]);

  return (
    <>
      <AppShell active="study" title="Study">
        <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto">
          {loading && (
            <div className="flex justify-center py-12">
              <Icon name="loader-circle" size={32} className="animate-spin text-text-muted" />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-md bg-surface-sunken border border-border-default px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          {!loading && !error && studySets.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-16 text-center text-text-muted">
              <Icon name="inbox" size={48} className="opacity-40" />
              <div>
                <p className="font-medium text-text-strong">No study sets yet</p>
                <p className="mt-1 text-sm">Open a note and tap &ldquo;Generate study material&rdquo; to create one.</p>
              </div>
            </div>
          )}

          {!loading && !error && studySets.length > 0 && (
            <ul className="divide-y divide-border-default" role="list">
              {studySets.map((set) => {
                const meta = STUDY_TYPE_META[set.type];
                const isNavigable = set.status === 'ready';

                return (
                  <li key={set.studySetId} data-armed-item={armedId === set.studySetId ? 'true' : undefined}>
                    <StudyListItem
                      set={set}
                      meta={meta}
                      isNavigable={isNavigable}
                      armed={armedId === set.studySetId}
                      onNavigate={() => router.push(`/study/${set.studySetId}`)}
                      onArm={() => setArmedId(set.studySetId)}
                      onDelete={() => setPendingDelete(set)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </AppShell>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete study set?"
        description={
          pendingDelete?.title
            ? `"${pendingDelete.title}" will be permanently deleted.`
            : 'This study set will be permanently deleted.'
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
            title="Could not delete study set"
            onClose={() => setDeleteError(null)}
          >
            {deleteError}
          </Toast>
        </div>
      )}
    </>
  );
}

StudyListScreen.displayName = 'StudyListScreen';
