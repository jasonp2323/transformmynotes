import { describe, it, expect } from 'vitest';
import type { ActivitySummary } from '@transformmynotes/core';
import { selectVisibleRecent, RECENT_WINDOW_MS } from './activity-indicator';

// Minimal stub that satisfies the ActivitySummary shape for test purposes.
function makeSummary(
  activityId: string,
  updatedAt: string,
): ActivitySummary {
  return {
    activityId,
    kind: 'study',
    status: 'ready',
    phase: 'done',
    phaseDetail: '',
    title: `Activity ${activityId}`,
    updatedAt,
  };
}

const NOW_MS = new Date('2026-06-20T12:00:00.000Z').getTime();

// An ISO string exactly `deltaMs` before NOW_MS.
function msAgo(deltaMs: number): string {
  return new Date(NOW_MS - deltaMs).toISOString();
}

describe('selectVisibleRecent', () => {
  it('returns an empty array when given an empty list', () => {
    expect(selectVisibleRecent([], new Set(), NOW_MS)).toEqual([]);
  });

  it('keeps items whose updatedAt is within the window', () => {
    const recent = [
      makeSummary('a', msAgo(30_000)),          // 30 s ago — well within 2 min
      makeSummary('b', msAgo(RECENT_WINDOW_MS)), // exactly at boundary — still visible
    ];
    const result = selectVisibleRecent(recent, new Set(), NOW_MS);
    expect(result.map((r) => r.activityId)).toEqual(['a', 'b']);
  });

  it('filters out items whose updatedAt is older than the window', () => {
    const recent = [
      makeSummary('old', msAgo(RECENT_WINDOW_MS + 1)), // 1 ms past the boundary
      makeSummary('new', msAgo(60_000)),                // 1 min ago — still in window
    ];
    const result = selectVisibleRecent(recent, new Set(), NOW_MS);
    expect(result.map((r) => r.activityId)).toEqual(['new']);
  });

  it('filters out dismissed ids regardless of age', () => {
    const recent = [
      makeSummary('dismissed', msAgo(10_000)), // recent, but dismissed
      makeSummary('kept', msAgo(10_000)),
    ];
    const result = selectVisibleRecent(recent, new Set(['dismissed']), NOW_MS);
    expect(result.map((r) => r.activityId)).toEqual(['kept']);
  });

  it('respects a custom windowMs override', () => {
    const tenSecondWindow = 10_000;
    const recent = [
      makeSummary('inside', msAgo(9_000)),
      makeSummary('outside', msAgo(11_000)),
    ];
    const result = selectVisibleRecent(recent, new Set(), NOW_MS, tenSecondWindow);
    expect(result.map((r) => r.activityId)).toEqual(['inside']);
  });

  it('returns an empty array when all items are dismissed', () => {
    const recent = [makeSummary('a', msAgo(1_000)), makeSummary('b', msAgo(2_000))];
    const result = selectVisibleRecent(recent, new Set(['a', 'b']), NOW_MS);
    expect(result).toEqual([]);
  });
});
