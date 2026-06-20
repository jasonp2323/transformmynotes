/**
 * Unit tests for `activityKeys` (keys.ts) and `buildActivityItem` /
 * `buildAppendStepUpdate` (activity.ts).
 * No I/O — pure function tests only.
 *
 * Covers:
 *   - activityKeys.activityItemKey — correct pk/sk encoding
 *   - activityKeys.activityListQuery — base-table query shape (no Limit, no IndexName,
 *     no FilterExpression, ScanIndexForward false)
 *   - activityKeys.activityInFlightQuery — FilterExpression + ExpressionAttributeNames +
 *     queued/running values, no IndexName
 *   - activityKeys.parseActivitySk — happy path and malformed-key throw
 *   - buildActivityItem — default status, steps seed, ttl, no gsi attrs,
 *     optional fields absent/present
 *   - buildAppendStepUpdate — expression building with and without optional fields
 */

import { describe, it, expect } from 'vitest';
import { activityKeys } from '../keys.js';
import {
  buildActivityItem,
  buildAppendStepUpdate,
} from '../activity.js';

// ---------------------------------------------------------------------------
// activityKeys.activityItemKey
// ---------------------------------------------------------------------------

describe('activityKeys.activityItemKey', () => {
  it('returns correct pk and sk', () => {
    const key = activityKeys.activityItemKey('s', '01ABC');
    expect(key.pk).toBe('USER#s');
    expect(key.sk).toBe('ACTIVITY#01ABC');
  });
});

// ---------------------------------------------------------------------------
// activityKeys.activityListQuery
// ---------------------------------------------------------------------------

describe('activityKeys.activityListQuery', () => {
  const q = activityKeys.activityListQuery('s');

  it('has KeyConditionExpression with begins_with', () => {
    expect(q.KeyConditionExpression).toContain('begins_with');
  });

  it('has :prefix === ACTIVITY#', () => {
    expect(q.ExpressionAttributeValues[':prefix']).toBe('ACTIVITY#');
  });

  it('has :pk === USER#s', () => {
    expect(q.ExpressionAttributeValues[':pk']).toBe('USER#s');
  });

  it('has ScanIndexForward === false', () => {
    expect(q.ScanIndexForward).toBe(false);
  });

  it('does NOT have a Limit', () => {
    expect('Limit' in q).toBe(false);
  });

  it('does NOT have an IndexName', () => {
    expect('IndexName' in q).toBe(false);
  });

  it('does NOT have a FilterExpression', () => {
    expect('FilterExpression' in q).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// activityKeys.activityInFlightQuery
// ---------------------------------------------------------------------------

describe('activityKeys.activityInFlightQuery', () => {
  const q = activityKeys.activityInFlightQuery('s');

  it('has FilterExpression with queued and running', () => {
    expect(q.FilterExpression).toBe('#status = :queued OR #status = :running');
  });

  it('has ExpressionAttributeNames aliasing status', () => {
    expect(q.ExpressionAttributeNames).toEqual({ '#status': 'status' });
  });

  it('has :queued value', () => {
    expect(q.ExpressionAttributeValues[':queued']).toBe('queued');
  });

  it('has :running value', () => {
    expect(q.ExpressionAttributeValues[':running']).toBe('running');
  });

  it('has ScanIndexForward === false', () => {
    expect(q.ScanIndexForward).toBe(false);
  });

  it('does NOT have an IndexName', () => {
    expect('IndexName' in q).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// activityKeys.parseActivitySk
// ---------------------------------------------------------------------------

describe('activityKeys.parseActivitySk', () => {
  it('parses a valid activity sort key', () => {
    expect(activityKeys.parseActivitySk('ACTIVITY#01ABC')).toEqual({ activityId: '01ABC' });
  });

  it('throws on a malformed sort key', () => {
    expect(() => activityKeys.parseActivitySk('NOPE#x')).toThrow(
      'activityKeys.parseActivitySk: malformed activity sort key "NOPE#x"',
    );
  });
});

// ---------------------------------------------------------------------------
// buildActivityItem — defaults and key shape
// ---------------------------------------------------------------------------

describe('buildActivityItem — defaults and key shape', () => {
  const NOW = '2026-06-20T00:00:00.000Z';
  const INPUT = {
    sub: 'sub-a',
    kind: 'study' as const,
    refId: 'ss-1',
    title: 'Flashcards from 3 notes',
    phase: 'queued',
    phaseDetail: 'Queued',
    now: NOW,
    activityId: '01TEST',
  };

  const item = buildActivityItem(INPUT);

  it('sets pk correctly', () => {
    expect(item.pk).toBe('USER#sub-a');
  });

  it('sets sk correctly', () => {
    expect(item.sk).toBe('ACTIVITY#01TEST');
  });

  it('defaults status to queued', () => {
    expect(item.status).toBe('queued');
  });

  it('seeds exactly one step', () => {
    expect(item.steps).toHaveLength(1);
    expect(item.steps[0]).toEqual({ phase: 'queued', detail: 'Queued', at: NOW });
  });

  it('sets createdAt === now', () => {
    expect(item.createdAt).toBe(NOW);
  });

  it('sets updatedAt === now', () => {
    expect(item.updatedAt).toBe(NOW);
  });

  it('computes ttl as epoch seconds + 86400', () => {
    const expectedTtl = Math.floor(Date.parse(NOW) / 1000) + 86400;
    expect(item.ttl).toBe(expectedTtl);
  });

  it('has NO gsi attributes', () => {
    expect(Object.keys(item).some((k) => k.startsWith('gsi'))).toBe(false);
  });

  it('progress is absent when not passed', () => {
    expect('progress' in item).toBe(false);
  });

  it('stream is absent when not passed', () => {
    expect('stream' in item).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildActivityItem — explicit status and progress
// ---------------------------------------------------------------------------

describe('buildActivityItem — explicit status and progress', () => {
  const item = buildActivityItem({
    sub: 'sub-b',
    kind: 'transcription' as const,
    refId: 'note-1',
    title: 'Transcription job',
    phase: 'running',
    phaseDetail: 'Transcribing audio',
    status: 'running',
    progress: { current: 1, total: 3 },
    activityId: '01PROG',
    now: '2026-06-20T01:00:00.000Z',
  });

  it('reflects explicit status', () => {
    expect(item.status).toBe('running');
  });

  it('reflects explicit progress', () => {
    expect(item.progress).toEqual({ current: 1, total: 3 });
  });
});

// ---------------------------------------------------------------------------
// buildAppendStepUpdate — base clause only (no optional fields)
// ---------------------------------------------------------------------------

describe('buildAppendStepUpdate — base clause only', () => {
  const result = buildAppendStepUpdate({
    sub: 'sub-c',
    activityId: '01STEP',
    phase: 'generating',
    phaseDetail: 'Generating cards',
    at: '2026-06-20T02:00:00.000Z',
  });

  it('UpdateExpression contains list_append(if_not_exists(steps, :empty), :newstep)', () => {
    expect(result.UpdateExpression).toContain(
      'list_append(if_not_exists(steps, :empty), :newstep)',
    );
  });

  it('UpdateExpression sets phase', () => {
    expect(result.UpdateExpression).toContain('phase = :phase');
  });

  it('UpdateExpression sets phaseDetail', () => {
    expect(result.UpdateExpression).toContain('phaseDetail = :phaseDetail');
  });

  it('UpdateExpression sets updatedAt', () => {
    expect(result.UpdateExpression).toContain('updatedAt = :updatedAt');
  });

  it(':newstep is a one-element array with the step', () => {
    expect(result.ExpressionAttributeValues[':newstep']).toEqual([
      { phase: 'generating', detail: 'Generating cards', at: '2026-06-20T02:00:00.000Z' },
    ]);
  });

  it(':empty is []', () => {
    expect(result.ExpressionAttributeValues[':empty']).toEqual([]);
  });

  it('ExpressionAttributeNames is undefined (no reserved words used)', () => {
    expect(result.ExpressionAttributeNames).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildAppendStepUpdate — with status
// ---------------------------------------------------------------------------

describe('buildAppendStepUpdate — with status', () => {
  const result = buildAppendStepUpdate({
    sub: 'sub-c',
    activityId: '01STEP',
    phase: 'done',
    phaseDetail: 'Ready',
    status: 'ready',
    at: '2026-06-20T03:00:00.000Z',
  });

  it('UpdateExpression contains #status = :status', () => {
    expect(result.UpdateExpression).toContain('#status = :status');
  });

  it('ExpressionAttributeNames has #status alias', () => {
    expect(result.ExpressionAttributeNames).toEqual({ '#status': 'status' });
  });

  it(':status === ready', () => {
    expect(result.ExpressionAttributeValues[':status']).toBe('ready');
  });
});

// ---------------------------------------------------------------------------
// buildAppendStepUpdate — with progress
// ---------------------------------------------------------------------------

describe('buildAppendStepUpdate — with progress', () => {
  const result = buildAppendStepUpdate({
    sub: 'sub-c',
    activityId: '01STEP',
    phase: 'generating',
    phaseDetail: 'Generating',
    progress: { current: 2, total: 5 },
    at: '2026-06-20T04:00:00.000Z',
  });

  it('UpdateExpression contains progress = :progress', () => {
    expect(result.UpdateExpression).toContain('progress = :progress');
  });

  it(':progress matches the input', () => {
    expect(result.ExpressionAttributeValues[':progress']).toEqual({ current: 2, total: 5 });
  });
});

// ---------------------------------------------------------------------------
// buildAppendStepUpdate — with error
// ---------------------------------------------------------------------------

describe('buildAppendStepUpdate — with error', () => {
  const result = buildAppendStepUpdate({
    sub: 'sub-c',
    activityId: '01STEP',
    phase: 'failed',
    phaseDetail: 'Failed',
    error: 'Bedrock throttled',
    at: '2026-06-20T05:00:00.000Z',
  });

  it('UpdateExpression contains #error = :error', () => {
    expect(result.UpdateExpression).toContain('#error = :error');
  });

  it('ExpressionAttributeNames has #error alias', () => {
    expect(result.ExpressionAttributeNames!['#error']).toBe('error');
  });

  it(':error === the error string', () => {
    expect(result.ExpressionAttributeValues[':error']).toBe('Bedrock throttled');
  });
});
