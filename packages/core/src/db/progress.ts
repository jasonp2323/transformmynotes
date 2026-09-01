import { ulid } from 'ulid';
import { PutCommand, UpdateCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { progressKeys } from './keys.js';
import { type DayCounters, foldEventsToDay, computeRetentionRate, computeAvgQuizScore } from './progress-aggregate.js';
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
  /** Number of cards that crossed the mastery threshold (prevInterval < 21 → newInterval >= 21) on this day. */
  cardsMastered: number;
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

/**
 * Atomically increments one or more counters on a DAY# snapshot item via a
 * single `UpdateCommand` with `ADD` expressions.
 *
 * NOTE: `ADD` is not idempotent — if the stream delivers the same event twice,
 * the counter will be over-counted. The nightly `rederiveDaySnapshot` cron
 * corrects this by recomputing the snapshot from the raw EVENT# items.
 *
 * Day boundaries are UTC calendar days (MVP). Per-user timezone support is
 * deferred to a future iteration (store `tz` on the user profile and derive
 * the local day from it).
 */
export async function incrementDaySnapshot(
  sub: string,
  day: string,
  delta: Partial<DayCounters>,
): Promise<void> {
  const entries = Object.entries(delta).filter(([, v]) => v !== undefined) as [string, number][];
  if (entries.length === 0) return;

  const addClauses: string[] = [];
  const ean: Record<string, string> = {};
  const eav: Record<string, number> = {};

  entries.forEach(([key, value], i) => {
    const nameAlias = `#c${i}`;
    const valAlias = `:v${i}`;
    ean[nameAlias] = key;
    eav[valAlias] = value;
    addClauses.push(`${nameAlias} ${valAlias}`);
  });

  await ddb.send(
    new UpdateCommand({
      TableName: TableNames.StudyEvents,
      Key: progressKeys.dayItem(sub, day),
      UpdateExpression: `ADD ${addClauses.join(', ')}`,
      ExpressionAttributeNames: ean,
      ExpressionAttributeValues: eav,
    }),
  );
}

/** Returns the DAY# snapshot item for a given user+day, or null if absent. */
export async function getDaySnapshot(sub: string, day: string): Promise<DaySnapshotItem | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TableNames.StudyEvents,
      Key: progressKeys.dayItem(sub, day),
    }),
  );
  return (res.Item as DaySnapshotItem | undefined) ?? null;
}

/**
 * Returns all DAY# snapshot items for a user within an inclusive date range
 * [fromDate, toDate], in chronological order (ascending). Paginates via
 * LastEvaluatedKey.
 */
export async function listDaySnapshots(
  sub: string,
  fromDate: string,
  toDate: string,
): Promise<DaySnapshotItem[]> {
  const items: DaySnapshotItem[] = [];
  let lastKey: Record<string, unknown> | undefined = undefined;

  while (true) {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TableNames.StudyEvents,
        ...progressKeys.dayRangeQuery(sub, fromDate, toDate),
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }),
    );
    if (res.Items) {
      items.push(...(res.Items as DaySnapshotItem[]));
    }
    if (!res.LastEvaluatedKey) break;
    lastKey = res.LastEvaluatedKey as Record<string, unknown>;
  }

  return items;
}

/**
 * Self-heal: re-derives a day's snapshot from its raw EVENT# items and
 * overwrites the DAY# snapshot with the recomputed counters + derived fields.
 *
 * Steps:
 * 1. Query all EVENT# items for the day via `progressKeys.eventScanForDay`,
 *    paginating with LastEvaluatedKey.
 * 2. Treat each item as a `StudyEvent` (the persisted item is a superset of
 *    the union — the extra pk/sk/expiresAt attributes are ignored by
 *    `foldEventsToDay`).
 * 3. Compute `retentionRate` via `computeRetentionRate` and `avgQuizScore`
 *    via `computeAvgQuizScore`.
 * 4. Overwrite the DAY# snapshot with a `PutCommand`.
 * 5. Return the written snapshot.
 */
export async function rederiveDaySnapshot(sub: string, day: string): Promise<DaySnapshotItem> {
  const events: StudyEvent[] = [];
  let lastKey: Record<string, unknown> | undefined = undefined;

  while (true) {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TableNames.StudyEvents,
        ...progressKeys.eventScanForDay(sub, day),
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }),
    );
    if (res.Items) {
      events.push(...(res.Items as StudyEvent[]));
    }
    if (!res.LastEvaluatedKey) break;
    lastKey = res.LastEvaluatedKey as Record<string, unknown>;
  }

  const counters = foldEventsToDay(events);
  const retentionRate = computeRetentionRate(counters.correctReviews, counters.reviews);
  const avgQuizScore = computeAvgQuizScore(counters.quizScoreSum, counters.quizAttempts);

  const snapshot: DaySnapshotItem = {
    ...progressKeys.dayItem(sub, day),
    ...counters,
    ...(retentionRate !== undefined ? { retentionRate } : {}),
    ...(avgQuizScore !== undefined ? { avgQuizScore } : {}),
    updatedAt: new Date().toISOString(),
  };

  await ddb.send(
    new PutCommand({
      TableName: TableNames.StudyEvents,
      Item: snapshot,
    }),
  );

  return snapshot;
}

/**
 * Reads the current snapshot for `day`, recomputes `retentionRate` and
 * `avgQuizScore` from its stored counters, then writes those two derived
 * fields back with a `SET` `UpdateCommand`.
 *
 * Cheaper than a full `rederiveDaySnapshot` when the raw counters are trusted
 * (e.g. after a normal stream flush with no missed events). Use
 * `rederiveDaySnapshot` for full correction; use this for routine derived-field
 * refresh.
 *
 * No-ops silently if no snapshot exists for the day yet.
 */
export async function finalizeDaySnapshotDerived(sub: string, day: string): Promise<void> {
  const snapshot = await getDaySnapshot(sub, day);
  if (snapshot === null) return;

  const retentionRate = computeRetentionRate(snapshot.correctReviews, snapshot.reviews);
  const avgQuizScore = computeAvgQuizScore(snapshot.quizScoreSum, snapshot.quizAttempts);

  const now = new Date().toISOString();
  const setClauses = ['updatedAt = :now'];
  const eav: Record<string, unknown> = { ':now': now };

  if (retentionRate !== undefined) {
    setClauses.push('retentionRate = :rr');
    eav[':rr'] = retentionRate;
  }
  if (avgQuizScore !== undefined) {
    setClauses.push('avgQuizScore = :aqs');
    eav[':aqs'] = avgQuizScore;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: TableNames.StudyEvents,
      Key: progressKeys.dayItem(sub, day),
      UpdateExpression: `SET ${setClauses.join(', ')}`,
      ExpressionAttributeValues: eav,
    }),
  );
}
