'use client';

import React from 'react';
import type { ActivityDetail, ActivitySummary } from '@transformmynotes/core';
import { cn } from '@/src/lib/cn';
import { Icon } from '@/src/components/ui';
import { Collapsible } from '@/src/components/ui';
import { useAiActivity } from './AiActivityProvider';
import { selectVisibleRecent } from '@/src/lib/activity-indicator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DetailResponse {
  ok: true;
  activity: ActivityDetail;
}

interface ErrorResponse {
  ok: false;
  error: string;
}

type DetailApiResponse = DetailResponse | ErrorResponse;

// ---------------------------------------------------------------------------
// ActivityItem — expanded per-activity panel
// ---------------------------------------------------------------------------

interface ActivityItemProps {
  summary: ActivitySummary;
}

function ActivityItem({ summary }: ActivityItemProps) {
  const { activityId, title, status } = summary;

  const [detail, setDetail] = React.useState<ActivityDetail | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const [streamBuffer, setStreamBuffer] = React.useState('');
  const esRef = React.useRef<EventSource | null>(null);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  // Fetch detail when panel opens.
  React.useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    async function loadDetail() {
      try {
        const res = await fetch(`/api/activity/${activityId}`);
        const data = (await res.json()) as DetailApiResponse;
        if (!cancelled && mountedRef.current && data.ok) {
          setDetail(data.activity);
        }
      } catch {
        // Silently ignore — we still show the summary.
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [isOpen, activityId]);

  // Open SSE stream for running activities with streamable kinds.
  React.useEffect(() => {
    const streamable = status === 'running' && (summary.kind === 'study' || summary.kind === 'transcription');

    if (!isOpen || !streamable) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    if (esRef.current) return; // already open

    const es = new EventSource(`/api/activity/${activityId}/stream`);
    esRef.current = es;

    es.onmessage = (ev: MessageEvent<string>) => {
      if (!mountedRef.current) return;
      // Each message carries a JSON-stringified string delta; parse before appending.
      try {
        const delta = JSON.parse(ev.data) as string;
        setStreamBuffer((prev) => prev + delta);
      } catch {
        // Malformed frame — append raw data as a fallback.
        setStreamBuffer((prev) => prev + ev.data);
      }
    };

    es.addEventListener('done', () => {
      es.close();
      if (esRef.current === es) esRef.current = null;
    });

    es.onerror = () => {
      es.close();
      if (esRef.current === es) esRef.current = null;
    };

    return () => {
      es.close();
      if (esRef.current === es) esRef.current = null;
    };
  }, [isOpen, status, summary.kind, activityId]);

  // Reset stream buffer when status changes away from running.
  React.useEffect(() => {
    if (status !== 'running') {
      setStreamBuffer('');
    }
  }, [status]);

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) {
      esRef.current?.close();
      esRef.current = null;
    }
  }

  const titleNode = (
    <span className={cn('tmn-activity__item-title-row')}>
      <StatusDot status={status} />
      <span>{title}</span>
      <StatusBadge status={status} />
    </span>
  );

  const phaseDetail = detail?.phaseDetail ?? summary.phaseDetail;
  const progress = detail?.progress ?? summary.progress;
  const steps = detail?.steps ?? [];
  const error = detail?.error;
  const refId = detail?.refId;
  const showStream =
    status === 'running' &&
    (summary.kind === 'study' || summary.kind === 'transcription') &&
    streamBuffer.length > 0;

  return (
    <li className={cn('tmn-activity__item', `tmn-activity__item--${status}`)}>
      <Collapsible
        title={titleNode}
        open={isOpen}
        onOpenChange={handleOpenChange}
        className="tmn-activity__collapsible"
      >
        {/* Phase detail */}
        <p className="tmn-activity__phase-detail">{phaseDetail}</p>

        {/* Progress */}
        {progress != null && (
          <p className="tmn-activity__progress">
            Section {progress.current} of {progress.total}
          </p>
        )}

        {/* Step history */}
        {steps.length > 0 && (
          <ol className="tmn-activity__steps" reversed>
            {[...steps].reverse().map((step, idx) => (
              <li
                key={`${step.at}-${idx}`}
                className={cn('tmn-activity__step', idx === 0 && 'tmn-activity__step--current')}
              >
                <time dateTime={step.at} className="tmn-activity__step-time">
                  {new Date(step.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </time>{' '}
                {step.detail}
              </li>
            ))}
          </ol>
        )}

        {/* Stream output */}
        {showStream && (
          <pre className="tmn-activity__stream">{streamBuffer}</pre>
        )}

        {/* View link for ready items */}
        {status === 'ready' && refId != null && (
          <a href={`/study/${refId}`} className="tmn-activity__view-link">
            View →
          </a>
        )}

        {/* Error */}
        {status === 'failed' && error != null && (
          <p className="tmn-activity__error">{error}</p>
        )}
      </Collapsible>
    </li>
  );
}

// ---------------------------------------------------------------------------
// StatusDot
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: ActivitySummary['status'] }) {
  return (
    <span
      className={cn(
        'tmn-activity__status-dot',
        status === 'running' && 'tmn-activity__status-dot--running',
        status === 'ready' && 'tmn-activity__status-dot--ready',
        status === 'failed' && 'tmn-activity__status-dot--failed',
        status === 'queued' && 'tmn-activity__status-dot--queued',
      )}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// StatusBadge — small inline icon
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: ActivitySummary['status'] }) {
  if (status === 'running') return <Icon name="zap" size={12} className="tmn-activity__status-icon tmn-activity__status-icon--running" />;
  if (status === 'ready') return <Icon name="check-circle-2" size={12} className="tmn-activity__status-icon tmn-activity__status-icon--ready" />;
  if (status === 'failed') return <Icon name="x" size={12} className="tmn-activity__status-icon tmn-activity__status-icon--failed" />;
  if (status === 'queued') return <Icon name="hourglass" size={12} className="tmn-activity__status-icon tmn-activity__status-icon--queued" />;
  return null;
}

// ---------------------------------------------------------------------------
// AiActivityIndicator — the top-level exported component
// ---------------------------------------------------------------------------

/** Global fixed-position AI activity indicator. Mount once inside {@link AiActivityProvider}. */
export function AiActivityIndicator() {
  const { inFlight, recent } = useAiActivity();
  const [expanded, setExpanded] = React.useState(false);
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(new Set());
  // Tick counter bumped every 15 s so stale recent items auto-hide without waiting
  // for the next provider poll.
  const [, setTick] = React.useState(0);

  // Filter recent items: only show those within the 2-minute window and not dismissed.
  const visibleRecent = selectVisibleRecent(recent, dismissedIds, Date.now());
  // Filter in-flight items: exclude any that the user has dismissed (handles stuck items).
  const visibleInFlight = inFlight.filter((a) => !dismissedIds.has(a.activityId));

  const hasAny = visibleInFlight.length > 0 || visibleRecent.length > 0;
  const hasInFlight = visibleInFlight.length > 0;
  const totalCount = visibleInFlight.length + visibleRecent.length;

  // Merge visibleInFlight + visibleRecent deduplicated for the panel list (inFlight first).
  const inFlightIds = new Set(visibleInFlight.map((a) => a.activityId));
  const recentOnly = visibleRecent.filter((a) => !inFlightIds.has(a.activityId));
  const allItems: ActivitySummary[] = [...visibleInFlight, ...recentOnly];

  const chipLabel =
    visibleInFlight[0]?.phaseDetail ??
    visibleInFlight[0]?.title ??
    visibleRecent[0]?.title ??
    '';

  // Auto-collapse when nothing left to show.
  React.useEffect(() => {
    if (!hasAny) setExpanded(false);
  }, [hasAny]);

  // Bump the tick counter every 15 s while there is something to show, so that
  // stale "recent" items auto-hide without waiting for the next provider poll.
  React.useEffect(() => {
    if (!hasAny) return;
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, [hasAny]);

  if (!hasAny) return null;

  /** Add all currently-visible activity ids to the dismissed set. */
  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    const ids = new Set(dismissedIds);
    for (const a of [...visibleInFlight, ...visibleRecent]) {
      ids.add(a.activityId);
    }
    setDismissedIds(ids);
    setExpanded(false);
  }

  // ---- Expanded panel ----
  if (expanded) {
    return (
      <div className="tmn-activity__panel" role="dialog" aria-label="AI activity">
        <div className="tmn-activity__panel-header">
          <span className="tmn-activity__panel-title">AI Activity</span>
          <button
            type="button"
            className="tmn-activity__panel-close"
            aria-label="Collapse activity panel"
            onClick={() => setExpanded(false)}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <ul className="tmn-activity__list" aria-label="Activity list">
          {allItems.map((activity) => (
            <ActivityItem key={activity.activityId} summary={activity} />
          ))}
        </ul>
      </div>
    );
  }

  // ---- Collapsed chip ----
  // The chip is a container div so we can place an independent dismiss button
  // alongside the expand button without nesting interactive elements.
  return (
    <div className="tmn-activity__chip-wrapper">
      <button
        type="button"
        className="tmn-activity__chip"
        onClick={() => setExpanded(true)}
        aria-label={`AI activity${totalCount > 1 ? ` — ${totalCount} items` : ''}: ${chipLabel}`}
      >
        {hasInFlight ? (
          <Icon
            name="loader-circle"
            size={16}
            className="tmn-activity__chip-spinner"
            aria-hidden="true"
          />
        ) : (
          <Icon
            name="check-circle-2"
            size={16}
            className="tmn-activity__chip-check"
            aria-hidden="true"
          />
        )}
        {totalCount > 1 && (
          <span className="tmn-activity__chip-count" aria-label={`${totalCount} activities`}>
            {totalCount}
          </span>
        )}
        <span aria-live="polite" className="tmn-activity__chip-label">
          {chipLabel}
        </span>
      </button>
      <button
        type="button"
        className="tmn-activity__chip-dismiss"
        aria-label="Dismiss activity"
        onClick={handleDismiss}
      >
        <Icon name="x" size={12} aria-hidden="true" />
      </button>
    </div>
  );
}
