'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StudySetMeta } from '@/src/lib/study-ui';
import { STUDY_TYPE_META } from '@/src/lib/study-ui';
import { relativeTime } from '@/src/lib/library';
import { AppShell } from '@/src/components/shells';
import { Badge } from '@/src/components/ui/Badge';
import { Icon } from '@/src/components/ui/Icon';

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

export function StudyListScreen() {
  const router = useRouter();
  const [studySets, setStudySets] = useState<StudySetMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
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
                <li key={set.studySetId}>
                  <button
                    type="button"
                    className={[
                      'w-full flex items-start gap-3 py-4 text-left',
                      isNavigable
                        ? 'cursor-pointer hover:bg-surface-sunken transition-colors'
                        : 'cursor-default opacity-70',
                    ].join(' ')}
                    onClick={isNavigable ? () => router.push(`/study/${set.studySetId}`) : undefined}
                    disabled={!isNavigable}
                    aria-disabled={!isNavigable}
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
                      <StatusIndicator status={set.status} />
                      <span className="text-xs text-text-muted whitespace-nowrap">
                        {relativeTime(set.createdAt)}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

StudyListScreen.displayName = 'StudyListScreen';
