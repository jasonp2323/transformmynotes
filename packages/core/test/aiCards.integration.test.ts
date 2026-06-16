/**
 * Integration test: AI card creation via `createAiCards`, queried through
 * GSI5 (ByDue), with the M14 auto-prune guard verified via `diffCards`.
 *
 * Uses the shared dynalite instance started by `dynalite-global.ts`
 * (globalSetup) and the production client pointed at it via env vars set
 * in `integration-env.ts` (setupFiles). No AWS access required.
 */

import { describe, it, expect } from 'vitest';
import {
  createAiCards,
  listCardsDue,
  diffCards,
  recordCardReview,
} from '../src/db/cards.js';
import { schedule } from '../src/srs/scheduler.js';
import type { Card } from '../src/db/cards.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUB_A = 'sub-ai-cards-a';
const SUB_B = 'sub-ai-cards-b';
const STUDY_SET_ID = 'studyset-ai-001';

const ACCEPTED_CARDS = [
  { front: 'What is mitosis?', back: 'Cell division producing two identical daughter cells.' },
  { front: 'Define meiosis.', back: 'Cell division producing four genetically diverse gametes.' },
  { front: 'What is a zygote?', back: 'A cell formed by the union of two gametes.' },
];

// Fixed "now" for deterministic due dates.
const NOW = new Date('2025-01-15T12:00:00.000Z');
// A cutoff clearly after our "now" to capture due cards.
const CUTOFF_FUTURE = '2025-01-15T13:00:00.000Z';
// A cutoff before NOW — no cards should appear.
const CUTOFF_PAST = '2025-01-01T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Setup: write AI cards for user A via createAiCards
// ---------------------------------------------------------------------------

describe('createAiCards + listCardsDue — AI card round-trip (GSI5 ByDue)', () => {
  it('setup: writes 3 AI cards for SUB_A via createAiCards', async () => {
    const result = await createAiCards({
      sub: SUB_A,
      studySetId: STUDY_SET_ID,
      sourceNoteId: 'note-ai-001',
      accepted: ACCEPTED_CARDS,
      now: NOW,
    });
    expect(result.created).toBe(3);
  });

  it('all 3 AI cards appear in listCardsDue immediately (due at NOW)', async () => {
    const due = await listCardsDue(SUB_A, CUTOFF_FUTURE);
    // Filter to only our test cards by studySetId to avoid cross-test contamination.
    const aiDue = due.filter(
      (c) => (c as Card & { studySetId?: string }).studySetId === STUDY_SET_ID,
    );
    expect(aiDue).toHaveLength(3);
  });

  it('each AI card has origin:"ai" and studySetId set', async () => {
    const due = await listCardsDue(SUB_A, CUTOFF_FUTURE);
    const aiDue = due.filter(
      (c) => (c as Card & { studySetId?: string }).studySetId === STUDY_SET_ID,
    );
    for (const card of aiDue) {
      const c = card as Card & { origin?: string; studySetId?: string };
      expect(c.origin).toBe('ai');
      expect(c.studySetId).toBe(STUDY_SET_ID);
    }
  });

  it('AI cards do NOT appear in listCardsDue before NOW (cutoff in the past)', async () => {
    const due = await listCardsDue(SUB_A, CUTOFF_PAST);
    const aiDue = due.filter(
      (c) => (c as Card & { studySetId?: string }).studySetId === STUDY_SET_ID,
    );
    expect(aiDue).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// diffCards guard: AI cards must survive the M8 prune loop
// ---------------------------------------------------------------------------

describe('diffCards — AI card auto-prune guard (M14)', () => {
  it('AI cards are in unchanged (not toDelete) when no highlights are extracted', async () => {
    const due = await listCardsDue(SUB_A, CUTOFF_FUTURE);
    const existing = due.filter(
      (c) => (c as Card & { studySetId?: string }).studySetId === STUDY_SET_ID,
    );
    expect(existing.length).toBeGreaterThan(0);

    // Simulate what M8 does on note-save: diff with empty extracted (no highlights).
    const { toDelete, unchanged } = diffCards([], existing);
    expect(toDelete).toHaveLength(0);
    expect(unchanged).toHaveLength(existing.length);
  });
});

// ---------------------------------------------------------------------------
// User isolation: SUB_B's due query must not return SUB_A's AI cards
// ---------------------------------------------------------------------------

describe('listCardsDue — user isolation (AI cards)', () => {
  it('SUB_B sees no AI cards from SUB_A in listCardsDue', async () => {
    const dueB = await listCardsDue(SUB_B, CUTOFF_FUTURE);
    const leaked = dueB.filter(
      (c) => (c as Card & { studySetId?: string }).studySetId === STUDY_SET_ID,
    );
    expect(leaked).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// recordCardReview: graded card moves out of the due window
// ---------------------------------------------------------------------------

describe('recordCardReview — graded AI card moves out of due window', () => {
  it('after grading one card with a future dueAt, it no longer appears in listCardsDue', async () => {
    const due = await listCardsDue(SUB_A, CUTOFF_FUTURE);
    const aiDue = due.filter(
      (c) => (c as Card & { studySetId?: string }).studySetId === STUDY_SET_ID,
    );
    expect(aiDue.length).toBeGreaterThan(0);

    const cardToGrade = aiDue[0];
    const initialState = {
      ease: cardToGrade.ease,
      interval: cardToGrade.interval,
      dueAt: cardToGrade.dueAt,
    };

    // Grade the card with a perfect score (5) — the new dueAt will be in the future.
    const scheduleResult = schedule(initialState, 5, NOW);
    await recordCardReview({
      sub: SUB_A,
      cardId: cardToGrade.cardId,
      result: scheduleResult,
      now: NOW,
    });

    // The graded card's new dueAt is in the future, so it must no longer appear
    // in a due query at CUTOFF_FUTURE (which is close to NOW).
    const dueAfter = await listCardsDue(SUB_A, CUTOFF_FUTURE);
    const gradedCardIds = dueAfter.map((c) => c.cardId);
    expect(gradedCardIds).not.toContain(cardToGrade.cardId);
  });
});
