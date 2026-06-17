'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Icon } from '@/src/components/ui';
import { ActionBar } from '@/src/components/review/ActionBar';
import { STUDY_TYPE_META, type StudySetMeta } from '@/src/lib/study-ui';

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 150;
const TERMINAL_STATUSES = new Set<string>(['ready', 'failed', 'too_large']);

type ItemState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; meta: StudySetMeta };

export function GeneratedMaterialsQueue({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(ids.map((id) => [id, { kind: 'loading' }])),
  );

  useEffect(() => {
    if (ids.length === 0) return;

    let cancelled = false;
    const timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    const attempts: Map<string, number> = new Map(ids.map((id) => [id, 0]));

    function pollOne(id: string): void {
      if (cancelled) return;
      const attemptCount = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, attemptCount);

      void (async () => {
        try {
          const res = await fetch(`/api/study/${id}`);
          if (cancelled) return;
          if (!res.ok) {
            setItems((prev) => ({
              ...prev,
              [id]: { kind: 'error', message: `Failed to load (${res.status})` },
            }));
            return;
          }
          const data = (await res.json()) as StudySetMeta;
          if (cancelled) return;
          setItems((prev) => ({ ...prev, [id]: { kind: 'loaded', meta: data } }));
          if (!TERMINAL_STATUSES.has(data.status) && attemptCount < MAX_ATTEMPTS) {
            timers.set(id, setTimeout(() => pollOne(id), POLL_INTERVAL_MS));
          }
        } catch {
          if (cancelled) return;
          setItems((prev) => ({
            ...prev,
            [id]: { kind: 'error', message: 'Network error' },
          }));
        }
      })();
    }

    // Initial fetch for all ids
    void Promise.all(
      ids.map((id) =>
        fetch(`/api/study/${id}`)
          .then(async (res) => {
            if (cancelled) return;
            if (!res.ok) {
              setItems((prev) => ({
                ...prev,
                [id]: { kind: 'error', message: `Failed to load (${res.status})` },
              }));
              return;
            }
            const data = (await res.json()) as StudySetMeta;
            if (cancelled) return;
            setItems((prev) => ({ ...prev, [id]: { kind: 'loaded', meta: data } }));
            if (!TERMINAL_STATUSES.has(data.status)) {
              timers.set(id, setTimeout(() => pollOne(id), POLL_INTERVAL_MS));
            }
          })
          .catch(() => {
            if (cancelled) return;
            setItems((prev) => ({
              ...prev,
              [id]: { kind: 'error', message: 'Network error' },
            }));
          }),
      ),
    );

    return () => {
      cancelled = true;
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, [ids]);

  const queueUrl = `/study/review?ids=${ids.join(',')}`;

  function handleRowClick(id: string, meta: StudySetMeta) {
    if (meta.type === 'flashcards') {
      router.push(`/study/${id}/review-cards?returnTo=${encodeURIComponent(queueUrl)}`);
    } else {
      router.push(`/study/${id}`);
    }
  }

  if (ids.length === 0) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">
          <p className="text-text-muted text-sm">No materials to review.</p>
        </div>
        <ActionBar>
          <Button variant="primary" fullWidth onClick={() => router.push('/study')}>
            Done
          </Button>
        </ActionBar>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 px-4 pt-6 pb-2">
        <h1 className="text-xl font-semibold mb-1">Generated materials</h1>
        <p className="text-sm text-text-muted mb-4">Review each item below.</p>
        <ul className="divide-y divide-border-default" role="list">
          {ids.map((id) => {
            const item = items[id];
            if (!item || item.kind === 'loading') {
              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled
                    className="w-full flex items-start gap-3 py-3 opacity-70 cursor-default text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-muted">Loading…</p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5 ml-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-brand animate-pulse" />
                    </div>
                  </button>
                </li>
              );
            }

            if (item.kind === 'error') {
              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled
                    className="w-full flex items-start gap-3 py-3 opacity-70 cursor-default text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-danger">{item.message}</p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5 ml-2">
                      <Icon name="x" size={16} className="text-danger" />
                    </div>
                  </button>
                </li>
              );
            }

            const { meta } = item;
            const typeMeta = STUDY_TYPE_META[meta.type];
            const isReady = meta.status === 'ready';
            const isFailed = meta.status === 'failed' || meta.status === 'too_large';
            const isPending = !isReady && !isFailed;

            return (
              <li key={id}>
                <button
                  type="button"
                  disabled={!isReady}
                  onClick={() => handleRowClick(id, meta)}
                  className={[
                    'w-full flex items-start gap-3 py-3 text-left',
                    isReady
                      ? 'hover:bg-surface-sunken transition-colors cursor-pointer'
                      : 'opacity-70 cursor-default',
                  ].join(' ')}
                >
                  <div className="mt-0.5 shrink-0">
                    <Badge tone={typeMeta.tone}>
                      <Icon name={typeMeta.icon} size={12} />
                      <span className="ml-1">{typeMeta.label}</span>
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{meta.title}</p>
                    {isFailed && (
                      <p className="mt-0.5 text-xs text-danger">
                        {meta.status === 'too_large'
                          ? 'Note is too large to process.'
                          : (meta.error ?? 'Generation failed.')}
                      </p>
                    )}
                    {isPending && (
                      <p className="mt-0.5 text-xs text-text-muted">Generating…</p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5 ml-2">
                    {isReady && (
                      <Icon name="check-circle-2" size={16} className="text-success" />
                    )}
                    {isFailed && (
                      <Icon name="x" size={16} className="text-danger" />
                    )}
                    {isPending && (
                      <span className="inline-block w-2 h-2 rounded-full bg-brand animate-pulse" />
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <ActionBar>
        <Button variant="primary" fullWidth onClick={() => router.push('/study')}>
          Done
        </Button>
      </ActionBar>
    </div>
  );
}
