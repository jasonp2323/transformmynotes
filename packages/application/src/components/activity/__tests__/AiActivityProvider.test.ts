import { describe, it, expect } from 'vitest';
import type { ActivitySummary } from '@transformmynotes/core';

// Pure helpers (duplicated here for unit-testing; sourced from AiActivityProvider logic)

function mergeAndDedupeActivities(
  inFlight: ActivitySummary[],
  recent: ActivitySummary[],
): ActivitySummary[] {
  const seen = new Set(inFlight.map((a) => a.activityId));
  return [...inFlight, ...recent.filter((a) => !seen.has(a.activityId))];
}

function formatActivityChipSubject(
  inFlight: ActivitySummary[],
  recent: ActivitySummary[],
): string {
  return inFlight[0]?.phaseDetail ?? recent[0]?.title ?? '';
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeActivity(overrides: Partial<ActivitySummary> & { activityId: string }): ActivitySummary {
  return {
    activityId: overrides.activityId,
    kind: overrides.kind ?? 'study',
    title: overrides.title ?? 'Untitled',
    phaseDetail: overrides.phaseDetail ?? 'Working…',
    phase: overrides.phase ?? 'running',
    status: overrides.status ?? 'running',
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// mergeAndDedupeActivities
// ---------------------------------------------------------------------------

describe('mergeAndDedupeActivities', () => {
  it('returns an empty array when both inputs are empty', () => {
    expect(mergeAndDedupeActivities([], [])).toEqual([]);
  });

  it('puts inFlight items first and deduplicates recent items whose activityId appears in inFlight', () => {
    const a1 = makeActivity({ activityId: 'id-1', title: 'Note summary', phaseDetail: 'Summarising…' });
    const a2 = makeActivity({ activityId: 'id-2', title: 'Quiz', phaseDetail: 'Generating quiz…' });
    const a3 = makeActivity({ activityId: 'id-3', title: 'Flashcards', phaseDetail: 'Done' });

    const inFlight = [a1, a2];
    // recent includes a1 (duplicate) and a3 (new)
    const recent = [a1, a3];

    const result = mergeAndDedupeActivities(inFlight, recent);

    // inFlight items come first
    expect(result[0]?.activityId).toBe('id-1');
    expect(result[1]?.activityId).toBe('id-2');
    // a3 from recent is included (not a duplicate)
    expect(result[2]?.activityId).toBe('id-3');
    // a1 from recent must NOT appear again
    expect(result).toHaveLength(3);
  });

  it('returns recent items unchanged when inFlight is empty', () => {
    const a1 = makeActivity({ activityId: 'id-1', title: 'Quiz' });
    const a2 = makeActivity({ activityId: 'id-2', title: 'Summary' });
    const recent = [a1, a2];

    const result = mergeAndDedupeActivities([], recent);
    expect(result).toEqual(recent);
  });
});

// ---------------------------------------------------------------------------
// formatActivityChipSubject
// ---------------------------------------------------------------------------

describe('formatActivityChipSubject', () => {
  it('returns the first inFlight phaseDetail when inFlight is non-empty', () => {
    const a1 = makeActivity({ activityId: 'id-1', phaseDetail: 'Summarising your note…', title: 'Summary' });
    const a2 = makeActivity({ activityId: 'id-2', phaseDetail: 'Generating quiz…', title: 'Quiz' });
    const recent = [makeActivity({ activityId: 'id-3', title: 'Old activity', phaseDetail: 'Done' })];

    expect(formatActivityChipSubject([a1, a2], recent)).toBe('Summarising your note…');
  });

  it('returns the first recent title when inFlight is empty', () => {
    const r1 = makeActivity({ activityId: 'id-1', title: 'Completed quiz', phaseDetail: 'Done' });
    const r2 = makeActivity({ activityId: 'id-2', title: 'Old summary', phaseDetail: 'Done' });

    expect(formatActivityChipSubject([], [r1, r2])).toBe('Completed quiz');
  });
});
