/**
 * Integration test: STUDYSET whole-assignment completion toggle (M16.2.2) —
 * `setStudySetCompleted`.
 *
 * Exercises the real `ddb` DocumentClient, `studySetKeys` builders,
 * `buildStudySetItem`, `putStudySet`, and `getStudySet` — no mocks. The dynalite
 * server is started by `dynalite-global.ts` (globalSetup) and the production
 * client is pointed at it via env vars set in `integration-env.ts` (setupFiles).
 */

import { describe, it, expect } from 'vitest';
import {
  buildStudySetItem,
  getStudySet,
  putStudySet,
  setStudySetCompleted,
} from '../src/db/study.js';

describe('setStudySetCompleted — whole-assignment completion toggle', () => {
  const SUB = 'sub-study-complete';

  const ASSIGNMENT_SET = {
    studySetId: 'aaa-complete-001',
    sourceNoteIds: ['note-complete-001'],
    type: 'assignment' as const,
    title: 'Complete test assignment',
    status: 'ready' as const,
    language: 'pt-BR' as const,
    model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    promptVersion: 'v1',
    createdAt: '2024-08-01T00:00:00.000Z',
  };

  it('setup: writes a ready assignment study set via putStudySet', async () => {
    await putStudySet(buildStudySetItem({ sub: SUB, ...ASSIGNMENT_SET }));
  });

  it('setStudySetCompleted(true) persists completed === true', async () => {
    await setStudySetCompleted(SUB, ASSIGNMENT_SET.studySetId, true);
    const item = await getStudySet(SUB, ASSIGNMENT_SET.studySetId);
    expect(item).toBeDefined();
    expect(item!.completed).toBe(true);
  });

  it('setStudySetCompleted(false) persists completed === false', async () => {
    await setStudySetCompleted(SUB, ASSIGNMENT_SET.studySetId, false);
    const item = await getStudySet(SUB, ASSIGNMENT_SET.studySetId);
    expect(item).toBeDefined();
    expect(item!.completed).toBe(false);
  });

  it('setStudySetCompleted rejects for a non-existent studySetId (ConditionalCheckFailedException)', async () => {
    await expect(
      setStudySetCompleted(SUB, 'does-not-exist-complete', true),
    ).rejects.toThrow();
  });
});
