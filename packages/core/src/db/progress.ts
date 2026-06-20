import { ulid } from 'ulid';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { progressKeys } from './keys.js';
import type { Grade } from '../srs/scheduler.js';
import type { StudyMaterialType } from '../study/types.js';

// ---------------------------------------------------------------------------
// TTL constant
// ---------------------------------------------------------------------------

/**
 * Number of days a raw EVENT# item is retained before DynamoDB TTL deletes it.
 * Daily snapshots (DAY# items) are the durable record and never carry a TTL.
 */
export const STUDY_EVENT_TTL_DAYS = 400;

// ---------------------------------------------------------------------------
// Discriminated union: StudyEvent
// ---------------------------------------------------------------------------

/** The four study-event kinds recorded in the event log. */
export type StudyEventKind = 'REVIEW' | 'QUIZATTEMPT' | 'NOTE_CREATED' | 'STUDYSET_CREATED';

/** A card-review event (SM-2 grade + pre/post scheduling state). */
export interface ReviewEvent {
  kind: 'REVIEW';
  cardId: string;
  /** SM-2 numeric grade: 0–2 = failed (reset), 3–5 = passed. */
  grade: Grade;
  prevEase: number;
  newEase: number;
  prevIntervalDays: number;
  newIntervalDays: number;
  /** ISO-8601 UTC timestamp of the review. */
  reviewedAt: string;
}

/** A quiz-attempt event (auto-graded quiz score). */
export interface QuizAttemptEvent {
  kind: 'QUIZATTEMPT';
  quizId: string;
  /** Overall score in [0, 1]. */
  score: number;
  /** Optional wall-clock time spent on the attempt. */
  durationMs?: number;
  /** ISO-8601 UTC timestamp grading completed. */
  gradedAt: string;
}

/** A note-created event. */
export interface NoteCreatedEvent {
  kind: 'NOTE_CREATED';
  noteId: string;
  tags: string[];
}

/** A study-set-created event. */
export interface StudySetCreatedEvent {
  kind: 'STUDYSET_CREATED';
  studySetId: string;
  type: StudyMaterialType;
}

/** Discriminated union over all study-event shapes. */
export type StudyEvent =
  | ReviewEvent
  | QuizAttemptEvent
  | NoteCreatedEvent
  | StudySetCreatedEvent;

// ---------------------------------------------------------------------------
// Persisted item type
// ---------------------------------------------------------------------------

/**
 * Full DynamoDB item for a raw study-event (EVENT# sort key).
 * Extends the StudyEvent payload with primary-key attributes and a TTL.
 */
export type StudyEventItem = StudyEvent & {
  pk: string;
  sk: string;
  /**
   * Unix epoch seconds at which DynamoDB TTL will delete this item.
   * Set to approximately `STUDY_EVENT_TTL_DAYS` (400) days from the event time.
   * DAY# snapshot items never carry this attribute.
   */
  expiresAt: number;
};

// ---------------------------------------------------------------------------
// Daily snapshot shape (consumed by M25.2 aggregator / cron)
// ---------------------------------------------------------------------------

/**
 * DynamoDB item shape for a per-user daily snapshot (DAY# sort key).
 *
 * Raw counters are incremented atomically by the stream aggregator (`ADD` in
 * `UpdateCommand`). Derived fields (`retentionRate`, `avgQuizScore`) are
 * computed by the nightly finalize cron and written back as plain `SET`s.
 *
 * NOTE: day boundaries are UTC (MVP). A future improvement can respect the
 * user's local timezone by reading `tz` from the user profile.
 *
 * DAY# items never carry an `expiresAt` — they are the permanent record.
 */
export interface DaySnapshotItem {
  pk: string;
  sk: string;
  /** Total REVIEW events recorded for this day. */
  reviews: number;
  /** Number of distinct cards reviewed (same as `reviews` in M25; future: de-duped). */
  cardsReviewed: number;
  /** Number of reviews with a passing grade (grade >= 3). */
  correctReviews: number;
  /** Running sum of `newEase` values for computing average ease. */
  easeSum: number;
  /** Count of ease samples (denominator for average ease). */
  easeCount: number;
  /** Total QUIZATTEMPT events recorded for this day. */
  quizAttempts: number;
  /** Running sum of quiz scores in [0, 1] (for average-score computation). */
  quizScoreSum: number;
  /** Total NOTE_CREATED events recorded for this day. */
  notesCreated: number;
  /** Total STUDYSET_CREATED events recorded for this day. */
  studySetsCreated: number;
  /** Derived: `correctReviews / reviews`. Written by the nightly finalize cron. */
  retentionRate?: number;
  /** Derived: `quizScoreSum / quizAttempts`. Written by the nightly finalize cron. */
  avgQuizScore?: number;
  /** ISO-8601 timestamp of the last cron finalize run for this day. */
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Computes the `expiresAt` Unix epoch seconds for a raw event item. */
function computeExpiresAt(now: Date): number {
  return Math.floor(now.getTime() / 1000) + STUDY_EVENT_TTL_DAYS * 24 * 60 * 60;
}

// ---------------------------------------------------------------------------
// Per-kind event item builders (pure — no I/O, fully unit-testable)
// ---------------------------------------------------------------------------

/**
 * Builds a persisted `StudyEventItem` for a REVIEW event.
 *
 * @param sub   - Cognito sub of the user (for the pk `USER#<sub>`).
 * @param input - The review-event fields (grade, ease, intervals, cardId, reviewedAt).
 * @param ts    - ISO-8601 timestamp used in the sort key (`EVENT#<ts>#<id>`).
 * @param id    - ULID used as the sort-key suffix (unique within same second).
 * @param now   - Optional base time for TTL computation; defaults to `new Date()`.
 */
export function buildReviewEventItem(
  sub: string,
  input: Omit<ReviewEvent, 'kind'>,
  ts: string,
  id: string,
  now: Date = new Date(),
): StudyEventItem {
  return {
    ...progressKeys.eventItem(sub, ts, id),
    kind: 'REVIEW',
    ...input,
    expiresAt: computeExpiresAt(now),
  };
}

/**
 * Builds a persisted `StudyEventItem` for a QUIZATTEMPT event.
 *
 * @param sub   - Cognito sub of the user.
 * @param input - The quiz-attempt fields (quizId, score, durationMs?, gradedAt).
 * @param ts    - ISO-8601 timestamp used in the sort key.
 * @param id    - ULID used as the sort-key suffix.
 * @param now   - Optional base time for TTL computation; defaults to `new Date()`.
 */
export function buildQuizAttemptEventItem(
  sub: string,
  input: Omit<QuizAttemptEvent, 'kind'>,
  ts: string,
  id: string,
  now: Date = new Date(),
): StudyEventItem {
  return {
    ...progressKeys.eventItem(sub, ts, id),
    kind: 'QUIZATTEMPT',
    ...input,
    expiresAt: computeExpiresAt(now),
  };
}

/**
 * Builds a persisted `StudyEventItem` for a NOTE_CREATED event.
 *
 * @param sub   - Cognito sub of the user.
 * @param input - The note-created fields (noteId, tags).
 * @param ts    - ISO-8601 timestamp used in the sort key.
 * @param id    - ULID used as the sort-key suffix.
 * @param now   - Optional base time for TTL computation; defaults to `new Date()`.
 */
export function buildNoteCreatedEventItem(
  sub: string,
  input: Omit<NoteCreatedEvent, 'kind'>,
  ts: string,
  id: string,
  now: Date = new Date(),
): StudyEventItem {
  return {
    ...progressKeys.eventItem(sub, ts, id),
    kind: 'NOTE_CREATED',
    ...input,
    expiresAt: computeExpiresAt(now),
  };
}

/**
 * Builds a persisted `StudyEventItem` for a STUDYSET_CREATED event.
 *
 * @param sub   - Cognito sub of the user.
 * @param input - The study-set-created fields (studySetId, type).
 * @param ts    - ISO-8601 timestamp used in the sort key.
 * @param id    - ULID used as the sort-key suffix.
 * @param now   - Optional base time for TTL computation; defaults to `new Date()`.
 */
export function buildStudySetCreatedEventItem(
  sub: string,
  input: Omit<StudySetCreatedEvent, 'kind'>,
  ts: string,
  id: string,
  now: Date = new Date(),
): StudyEventItem {
  return {
    ...progressKeys.eventItem(sub, ts, id),
    kind: 'STUDYSET_CREATED',
    ...input,
    expiresAt: computeExpiresAt(now),
  };
}

// ---------------------------------------------------------------------------
// ULID convenience
// ---------------------------------------------------------------------------

/**
 * Generates a new ULID string. Re-exported so callers building event items
 * can obtain an id without adding a direct `ulid` dependency.
 */
export { ulid as newEventId };

// ---------------------------------------------------------------------------
// DynamoDB write
// ---------------------------------------------------------------------------

/**
 * Appends a single study-event item to the `StudyEvents` table.
 *
 * This is a simple `PutCommand` — raw events are immutable and never updated.
 * Callers in the hot-path (card review, note write, etc.) must wrap this in
 * try/catch and fail-soft so a failed event append never aborts the underlying
 * study action.
 *
 * @param item - A fully-built `StudyEventItem` (from one of the per-kind builders).
 */
export async function appendStudyEvent(item: StudyEventItem): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TableNames.StudyEvents,
      Item: item,
    }),
  );
}
