/**
 * Integration test: ACTIVITY write→read round-trip — `putActivity`,
 * `getActivity`, `listActivities`, `listInFlightActivities`, and
 * `appendStepUpdate` (M28.1.1).
 *
 * Exercises the real `ddb` DocumentClient, `activityKeys` builders,
 * `buildActivityItem`, and the DynamoDB access functions — no mocks.
 * The dynalite server is started by `dynalite-global.ts` (globalSetup) and
 * the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles), which run in workers before test files.
 *
 * Cross-user isolation: SUB_B's activity must never appear in SUB_A queries.
 */

import { describe, it, expect } from 'vitest';
import {
  buildActivityItem,
  putActivity,
  getActivity,
  listActivities,
  listInFlightActivities,
  appendStepUpdate,
} from '../src/db/activity.js';

const SUB_A = 'sub-activity-a';
const SUB_B = 'sub-activity-b';

// ---------------------------------------------------------------------------
// Integration: putActivity + getActivity
// ---------------------------------------------------------------------------

describe('putActivity + getActivity — basic write→read', () => {
  it('setup: puts an activity for SUB_A (status running)', async () => {
    await putActivity(
      buildActivityItem({
        sub: SUB_A,
        kind: 'study',
        refId: 'ss-1',
        title: 'Flashcards from 3 notes',
        phase: 'queued',
        phaseDetail: 'Queued',
        status: 'running',
        activityId: '01ACTA',
      }),
    );
  });

  it('getActivity returns the item with status running', async () => {
    const item = await getActivity(SUB_A, '01ACTA');
    expect(item).toBeDefined();
    expect(item!.status).toBe('running');
    expect(item!.activityId).toBe('01ACTA');
    expect(item!.kind).toBe('study');
    expect(item!.refId).toBe('ss-1');
  });

  it('initial steps has exactly one entry', async () => {
    const item = await getActivity(SUB_A, '01ACTA');
    expect(item!.steps).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Integration: listInFlightActivities — sees running activity
// ---------------------------------------------------------------------------

describe('listInFlightActivities — sees SUB_A running activity', () => {
  it('includes 01ACTA in in-flight list', async () => {
    const items = await listInFlightActivities(SUB_A);
    const found = items.find((a) => a.activityId === '01ACTA');
    expect(found).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Integration: appendStepUpdate — adds step + updates phase/progress
// ---------------------------------------------------------------------------

describe('appendStepUpdate — phase transition with progress', () => {
  it('appends a step and updates phase/progress', async () => {
    await appendStepUpdate({
      sub: SUB_A,
      activityId: '01ACTA',
      phase: 'generating',
      phaseDetail: 'Generating cards',
      progress: { current: 1, total: 3 },
    });

    const item = await getActivity(SUB_A, '01ACTA');
    expect(item).toBeDefined();
    expect(item!.steps).toHaveLength(2);
    expect(item!.phase).toBe('generating');
    expect(item!.progress).toEqual({ current: 1, total: 3 });
    // status was not provided to appendStepUpdate — should still be running
    expect(item!.status).toBe('running');
  });
});

// ---------------------------------------------------------------------------
// Integration: appendStepUpdate — with stream field (reserved word round-trip)
// ---------------------------------------------------------------------------

describe('appendStepUpdate — stream field round-trip (reserved word)', () => {
  it('writes stream.done=false and status running (update must not throw)', async () => {
    await appendStepUpdate({
      sub: SUB_A,
      activityId: '01ACTA',
      phase: 'generating',
      phaseDetail: 'Generating cards',
      status: 'running',
      stream: { s3Key: 'activity/u/a.stream.txt', done: false },
    });

    const item = await getActivity(SUB_A, '01ACTA');
    expect(item).toBeDefined();
    expect(item!.status).toBe('running');
    expect(item!.stream).toEqual({ s3Key: 'activity/u/a.stream.txt', done: false });
  });

  it('flips stream.done to true on a second update', async () => {
    await appendStepUpdate({
      sub: SUB_A,
      activityId: '01ACTA',
      phase: 'generating',
      phaseDetail: 'Streaming complete',
      status: 'running',
      stream: { s3Key: 'activity/u/a.stream.txt', done: true },
    });

    const item = await getActivity(SUB_A, '01ACTA');
    expect(item!.stream!.done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: appendStepUpdate — status transition to ready
// ---------------------------------------------------------------------------

describe('appendStepUpdate — status transition to ready', () => {
  it('transitions status to ready', async () => {
    await appendStepUpdate({
      sub: SUB_A,
      activityId: '01ACTA',
      phase: 'done',
      phaseDetail: 'Ready',
      status: 'ready',
    });

    const item = await getActivity(SUB_A, '01ACTA');
    expect(item!.status).toBe('ready');
    expect(item!.phase).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// Integration: listInFlightActivities — no longer includes ready activity
// ---------------------------------------------------------------------------

describe('listInFlightActivities — excludes ready activity after transition', () => {
  it('does NOT include 01ACTA after it is ready', async () => {
    const items = await listInFlightActivities(SUB_A);
    const found = items.find((a) => a.activityId === '01ACTA');
    expect(found).toBeUndefined();
  });

  it('listActivities DOES still include 01ACTA', async () => {
    const items = await listActivities(SUB_A);
    const found = items.find((a) => a.activityId === '01ACTA');
    expect(found).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Integration: cross-user isolation
// ---------------------------------------------------------------------------

describe('cross-user isolation — SUB_B activity never leaks into SUB_A', () => {
  it('setup: puts a running activity for SUB_B', async () => {
    await putActivity(
      buildActivityItem({
        sub: SUB_B,
        kind: 'tts',
        refId: 'note-b-1',
        title: 'TTS job for SUB_B',
        phase: 'running',
        phaseDetail: 'Synthesizing',
        status: 'running',
        activityId: '01ACTB',
      }),
    );
  });

  it('listActivities for SUB_A does NOT include 01ACTB', async () => {
    const items = await listActivities(SUB_A);
    const found = items.find((a) => a.activityId === '01ACTB');
    expect(found).toBeUndefined();
  });

  it('listInFlightActivities for SUB_A does NOT include 01ACTB', async () => {
    const items = await listInFlightActivities(SUB_A);
    const found = items.find((a) => a.activityId === '01ACTB');
    expect(found).toBeUndefined();
  });

  it('listActivities for SUB_B DOES include 01ACTB', async () => {
    const items = await listActivities(SUB_B);
    const found = items.find((a) => a.activityId === '01ACTB');
    expect(found).toBeDefined();
  });
});
