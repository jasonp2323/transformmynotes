'use client';

import React from 'react';
import type { ActivitySummary } from '@transformmynotes/core';

/** Shape of the value provided by {@link AiActivityContext}. */
export interface AiActivityContextValue {
  /** Activities that are currently queued or running. */
  inFlight: ActivitySummary[];
  /** Recently completed or failed activities (not still in-flight). */
  recent: ActivitySummary[];
  /**
   * Signal that an activity was just enqueued by the current user.
   * Fires an immediate poll and temporarily holds the fast-poll loop
   * open for 10 s even if the server returns empty inFlight.
   */
  registerActivity: () => void;
}

/** React context — consume via {@link useAiActivity}. */
export const AiActivityContext = React.createContext<AiActivityContextValue>({
  inFlight: [],
  recent: [],
  registerActivity: () => undefined,
});

/** Hook for any component that needs to read or interact with AI-activity state. */
export function useAiActivity(): AiActivityContextValue {
  return React.useContext(AiActivityContext);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAST_INTERVAL_MS = 2_000;
const SLOW_INTERVAL_MS = 30_000;
const ACTIVE_GRACE_MS = 10_000;

interface ListResponse {
  ok: true;
  inFlight: ActivitySummary[];
  recent: ActivitySummary[];
}

interface ErrorResponse {
  ok: false;
  error: string;
}

type ApiResponse = ListResponse | ErrorResponse;

function dedupeByActivityId(items: ActivitySummary[]): ActivitySummary[] {
  const seen = new Map<string, ActivitySummary>();
  for (const item of items) {
    // Prefer later entries (more-recent copy wins).
    seen.set(item.activityId, item);
  }
  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** Provides AI-activity state to all descendant components. */
export function AiActivityProvider({ children }: { children: React.ReactNode }) {
  const [inFlight, setInFlight] = React.useState<ActivitySummary[]>([]);
  const [recent, setRecent] = React.useState<ActivitySummary[]>([]);

  // Refs that must not trigger re-renders.
  const mountedRef = React.useRef(true);
  const isActiveRef = React.useRef(false);
  const activeGraceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = React.useRef(false); // set to true on 401 to halt polling

  // Keep a stable ref to current inFlight length so the schedule callback
  // doesn't need to close over stale state.
  const inFlightCountRef = React.useRef(0);
  inFlightCountRef.current = inFlight.length;

  const clearPollTimer = React.useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const clearGraceTimer = React.useCallback(() => {
    if (activeGraceTimerRef.current !== null) {
      clearTimeout(activeGraceTimerRef.current);
      activeGraceTimerRef.current = null;
    }
  }, []);

  const schedulePoll = React.useCallback(
    (fetchFn: () => void, delayMs: number) => {
      clearPollTimer();
      pollTimerRef.current = setTimeout(fetchFn, delayMs);
    },
    [clearPollTimer],
  );

  const fetchActivities = React.useCallback(async () => {
    if (!mountedRef.current || stoppedRef.current) return;

    let data: ApiResponse;
    try {
      const res = await fetch('/api/activity');
      if (res.status === 401) {
        stoppedRef.current = true;
        return;
      }
      data = (await res.json()) as ApiResponse;
    } catch {
      // Network error — schedule the next attempt normally.
      if (mountedRef.current && !stoppedRef.current) {
        schedulePoll(fetchActivities, FAST_INTERVAL_MS);
      }
      return;
    }

    if (!mountedRef.current || stoppedRef.current) return;

    if (!data.ok) {
      // Server error — back off to slow poll.
      schedulePoll(fetchActivities, SLOW_INTERVAL_MS);
      return;
    }

    const { inFlight: newInFlight, recent: newRecent } = data;

    setInFlight(newInFlight);
    // recent = items that are NOT already in inFlight (deduplicated)
    const inFlightIds = new Set(newInFlight.map((a) => a.activityId));
    const filteredRecent = dedupeByActivityId(newRecent).filter(
      (a) => !inFlightIds.has(a.activityId),
    );
    setRecent(filteredRecent);

    // Clear isActiveRef when server confirms nothing is in-flight,
    // but only after the grace period has elapsed.
    if (newInFlight.length === 0 && isActiveRef.current) {
      clearGraceTimer();
      activeGraceTimerRef.current = setTimeout(() => {
        isActiveRef.current = false;
      }, ACTIVE_GRACE_MS);
    }

    if (!mountedRef.current || stoppedRef.current) return;

    const needsFast = newInFlight.length > 0 || isActiveRef.current;
    schedulePoll(fetchActivities, needsFast ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS);
  }, [clearGraceTimer, schedulePoll]);

  // Initial fetch on mount.
  React.useEffect(() => {
    mountedRef.current = true;
    void fetchActivities();

    return () => {
      mountedRef.current = false;
      clearPollTimer();
      clearGraceTimer();
    };
  }, [fetchActivities, clearPollTimer, clearGraceTimer]);

  const registerActivity = React.useCallback(() => {
    isActiveRef.current = true;
    clearGraceTimer();
    clearPollTimer();
    // Fire immediately, which will reschedule itself.
    void fetchActivities();
  }, [clearGraceTimer, clearPollTimer, fetchActivities]);

  const value = React.useMemo<AiActivityContextValue>(
    () => ({ inFlight, recent, registerActivity }),
    [inFlight, recent, registerActivity],
  );

  return (
    <AiActivityContext.Provider value={value}>{children}</AiActivityContext.Provider>
  );
}
