import {
  PutCommand,
  QueryCommand,
  GetCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { attemptKeys } from './keys.js';

// ---------------------------------------------------------------------------
// Item type definitions
// ---------------------------------------------------------------------------

/** Per-question grading result within a quiz attempt. */
export interface AttemptResult {
  correct: boolean;
  score: number;
  feedback?: string;
}

/** Public attempt shape returned by db query functions. */
export interface Attempt {
  attemptId: string;
  quizId: string;
  /** questionId -> answer (index string for MCQ, free text for short-answer). */
  answers: Record<string, string>;
  results: Record<string, AttemptResult>;
  /** Overall score in [0,1]. */
  score: number;
  /** ISO-8601 UTC datetime grading completed. */
  gradedAt: string;
  durationMs?: number;
}

/** Full DynamoDB item shape for an ATTEMPT (includes PK/SK and GSI8 keys). */
export interface AttemptItem extends Attempt {
  pk: string;
  sk: string;
  gsi8pk: string;
  gsi8sk: string;
}

// ---------------------------------------------------------------------------
// Pure item builder
// ---------------------------------------------------------------------------

/** Input for `buildAttemptItem`. */
export interface BuildAttemptItemInput {
  sub: string;
  quizId: string;
  attemptId: string;
  answers: Record<string, string>;
  results: Record<string, AttemptResult>;
  score: number;
  gradedAt: string;
  durationMs?: number;
}

/**
 * Builds an `AttemptItem` with all DynamoDB keys populated.
 *
 * `durationMs` is omitted from the returned item when not supplied so the
 * attribute is absent in DynamoDB (rather than stored as `undefined`).
 */
export function buildAttemptItem(input: BuildAttemptItemInput): AttemptItem {
  const keys = attemptKeys.attemptItemKey(input.sub, input.quizId, input.attemptId);

  const item: AttemptItem = {
    pk: keys.pk,
    sk: keys.sk,
    gsi8pk: attemptKeys.gsi8pk(input.quizId),
    gsi8sk: attemptKeys.gsi8sk(input.gradedAt),
    attemptId: input.attemptId,
    quizId: input.quizId,
    answers: input.answers,
    results: input.results,
    score: input.score,
    gradedAt: input.gradedAt,
  };

  if (input.durationMs !== undefined) {
    item.durationMs = input.durationMs;
  }

  return item;
}

// ---------------------------------------------------------------------------
// DynamoDB access functions
// ---------------------------------------------------------------------------

/**
 * Writes a single attempt item to the Notes table.
 */
export async function putAttempt(item: AttemptItem): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TableNames.Notes,
      Item: item,
    }),
  );
}

/**
 * Lists all attempts for a quiz via GSI8 (`ByQuizAttempt`), newest-first,
 * capped at 20.
 *
 * NOTE: GSI8 is partitioned by quiz, so this returns EVERY user's attempts for
 * the quiz — callers MUST filter by ownership (`pk === 'USER#'+sub`).
 */
export async function listAttemptsByQuiz(quizId: string): Promise<AttemptItem[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...attemptKeys.listAttemptsByQuizQuery(quizId),
    }),
  );

  return (Items ?? []) as AttemptItem[];
}

/**
 * Lists a single user's attempts for a given quiz by querying the base-table
 * primary index. Returns an empty array when the user has no attempts.
 */
export async function listAttemptsForUserQuiz(
  sub: string,
  quizId: string,
): Promise<AttemptItem[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...attemptKeys.listAttemptsForUserQuizQuery(sub, quizId),
    }),
  );

  return (Items ?? []) as AttemptItem[];
}

/**
 * Fetches a single attempt item by user sub, quizId, and attemptId.
 *
 * Returns `undefined` when the attempt does not exist.
 */
export async function getAttempt(
  sub: string,
  quizId: string,
  attemptId: string,
): Promise<AttemptItem | undefined> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TableNames.Notes,
      Key: attemptKeys.attemptItemKey(sub, quizId, attemptId),
    }),
  );
  return result.Item as AttemptItem | undefined;
}

/**
 * Deletes a single attempt item by user sub, quizId, and attemptId.
 */
export async function deleteAttempt(
  sub: string,
  quizId: string,
  attemptId: string,
): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TableNames.Notes,
      Key: attemptKeys.attemptItemKey(sub, quizId, attemptId),
    }),
  );
}
