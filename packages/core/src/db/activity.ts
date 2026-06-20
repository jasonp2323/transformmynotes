import { QueryCommand, GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { ddb, TableNames } from './client.js';
import { activityKeys } from './keys.js';

// ---------------------------------------------------------------------------
// Item type definitions
// ---------------------------------------------------------------------------

/** Discriminates which background job produced the activity. */
export type ActivityKind = 'study' | 'transcription' | 'tts';

/** Lifecycle status of an activity. */
export type ActivityStatus = 'queued' | 'running' | 'ready' | 'failed';

/** A single phase-transition step recorded in the activity history. */
export interface ActivityStep {
  phase: string;
  detail: string;
  /** ISO-8601 timestamp of the transition. */
  at: string;
}

/** Fractional progress for activities that report incremental work. */
export interface ActivityProgress {
  current: number;
  total: number;
}

/** Full DynamoDB item shape for an ACTIVITY (includes pk/sk; NO gsi keys — sparse). */
export interface ActivityItem {
  pk: string;
  sk: string;
  activityId: string;
  kind: ActivityKind;
  /** ID of the resource produced by this activity (e.g. studySetId, noteId). */
  refId: string;
  status: ActivityStatus;
  phase: string;
  phaseDetail: string;
  progress?: ActivityProgress;
  steps: ActivityStep[];
  title: string;
  error?: string;
  stream?: { s3Key: string; done: boolean };
  /** TTL in epoch SECONDS (~24 h from creation). */
  ttl: number;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-updated timestamp. */
  updatedAt: string;
}

/** Lightweight summary for activity lists (drawer/list views). */
export interface ActivitySummary {
  activityId: string;
  kind: ActivityKind;
  status: ActivityStatus;
  phase: string;
  phaseDetail: string;
  progress?: ActivityProgress;
  title: string;
  updatedAt: string;
}

/** Full activity detail (summary + history + stream/error/refId/createdAt). */
export interface ActivityDetail extends ActivitySummary {
  steps: ActivityStep[];
  stream?: { s3Key: string; done: boolean };
  error?: string;
  refId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Pure item builder
// ---------------------------------------------------------------------------

/** Input for `buildActivityItem`. */
export interface BuildActivityItemInput {
  sub: string;
  kind: ActivityKind;
  refId: string;
  title: string;
  phase: string;
  phaseDetail: string;
  /** Defaults to `'queued'`. */
  status?: ActivityStatus;
  progress?: ActivityProgress;
  stream?: { s3Key: string; done: boolean };
  /** Injectable for deterministic tests. Defaults to `new Date().toISOString()`. */
  now?: string;
  /** Defaults to `ulid()`. */
  activityId?: string;
}

/**
 * Builds an `ActivityItem` with all DynamoDB keys populated.
 *
 * Defaults:
 *   - `status`     → `'queued'` when not provided
 *   - `activityId` → `ulid()` when not provided
 *   - `now`        → `new Date().toISOString()` when not provided
 *
 * `progress` and `stream` are omitted from the returned item when not supplied
 * so the attributes are absent in DynamoDB (rather than stored as `undefined`).
 * No gsi* attributes are set — ACTIVITY items are sparse (base-table only).
 */
export function buildActivityItem(input: BuildActivityItemInput): ActivityItem {
  const activityId = input.activityId ?? ulid();
  const now = input.now ?? new Date().toISOString();
  const keys = activityKeys.activityItemKey(input.sub, activityId);

  const item: ActivityItem = {
    pk: keys.pk,
    sk: keys.sk,
    activityId,
    kind: input.kind,
    refId: input.refId,
    status: input.status ?? 'queued',
    phase: input.phase,
    phaseDetail: input.phaseDetail,
    steps: [{ phase: input.phase, detail: input.phaseDetail, at: now }],
    title: input.title,
    ttl: Math.floor(new Date(now).getTime() / 1000) + 24 * 60 * 60,
    createdAt: now,
    updatedAt: now,
  };

  if (input.progress !== undefined) {
    item.progress = input.progress;
  }

  if (input.stream !== undefined) {
    item.stream = input.stream;
  }

  return item;
}

// ---------------------------------------------------------------------------
// Pure expression builder (exported for unit tests)
// ---------------------------------------------------------------------------

/** Return value of `buildAppendStepUpdate` — pure expression parts, no ddb call. */
export interface AppendStepUpdateExpressionResult {
  UpdateExpression: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
  at: string;
}

/** Input for `appendStepUpdate` and `buildAppendStepUpdate`. */
export interface AppendStepUpdateInput {
  sub: string;
  activityId: string;
  phase: string;
  phaseDetail: string;
  progress?: ActivityProgress;
  status?: ActivityStatus;
  stream?: { s3Key: string; done: boolean };
  error?: string;
  /** ISO-8601; defaults to `new Date().toISOString()`. */
  at?: string;
}

/**
 * Builds the DynamoDB UpdateExpression parts for a phase transition — pure,
 * no I/O.  Exported so unit tests can assert on the generated expressions
 * without touching DynamoDB.
 *
 * Always sets: `phase`, `phaseDetail`, `updatedAt`, and appends to `steps`
 * via `list_append(if_not_exists(steps, :empty), :newstep)`.
 * Conditionally sets: `progress`, `#status` (reserved word), `stream`,
 * `#error` (reserved word) — only when the corresponding input field is
 * provided. ExpressionAttributeNames is `undefined` when no reserved-word
 * aliases are used.
 */
export function buildAppendStepUpdate(
  input: AppendStepUpdateInput,
): AppendStepUpdateExpressionResult {
  const at = input.at ?? new Date().toISOString();

  const setClauses: string[] = [
    'phase = :phase',
    'phaseDetail = :phaseDetail',
    'updatedAt = :updatedAt',
    'steps = list_append(if_not_exists(steps, :empty), :newstep)',
  ];

  const values: Record<string, unknown> = {
    ':phase': input.phase,
    ':phaseDetail': input.phaseDetail,
    ':updatedAt': at,
    ':empty': [],
    ':newstep': [{ phase: input.phase, detail: input.phaseDetail, at }],
  };

  const names: Record<string, string> = {};

  if (input.progress !== undefined) {
    setClauses.push('progress = :progress');
    values[':progress'] = input.progress;
  }

  if (input.status !== undefined) {
    setClauses.push('#status = :status');
    values[':status'] = input.status;
    names['#status'] = 'status';
  }

  if (input.stream !== undefined) {
    setClauses.push('stream = :stream');
    values[':stream'] = input.stream;
  }

  if (input.error !== undefined) {
    setClauses.push('#error = :error');
    values[':error'] = input.error;
    names['#error'] = 'error';
  }

  const UpdateExpression = `SET ${setClauses.join(', ')}`;
  const ExpressionAttributeNames = Object.keys(names).length > 0 ? names : undefined;

  return {
    UpdateExpression,
    ExpressionAttributeNames,
    ExpressionAttributeValues: values,
    at,
  };
}

// ---------------------------------------------------------------------------
// DynamoDB access functions
// ---------------------------------------------------------------------------

/** Writes an ACTIVITY item to the Notes table. */
export async function putActivity(item: ActivityItem): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TableNames.Notes,
      Item: item,
    }),
  );
}

/**
 * Appends a phase-transition step to an ACTIVITY item and updates the top-level
 * phase/status/progress/stream/error fields in a single UpdateCommand.
 *
 * Returns the full updated item. Always appends a step to the `steps` list and
 * bumps `updatedAt`; conditional fields (`progress`, `#status`, `stream`,
 * `#error`) are only written when provided in the input.
 */
export async function appendStepUpdate(input: AppendStepUpdateInput): Promise<ActivityItem> {
  const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
    buildAppendStepUpdate(input);

  const result = await ddb.send(
    new UpdateCommand({
      TableName: TableNames.Notes,
      Key: activityKeys.activityItemKey(input.sub, input.activityId),
      UpdateExpression,
      ...(ExpressionAttributeNames !== undefined ? { ExpressionAttributeNames } : {}),
      ExpressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    }),
  );

  return result.Attributes as ActivityItem;
}

/**
 * Fetches a single activity item by user sub and activityId.
 *
 * Returns `undefined` when the activity does not exist.
 */
export async function getActivity(
  sub: string,
  activityId: string,
): Promise<ActivityItem | undefined> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TableNames.Notes,
      Key: activityKeys.activityItemKey(sub, activityId),
    }),
  );
  return result.Item as ActivityItem | undefined;
}

/**
 * Lists all activities for the given user on the base table, newest-first
 * (descending ULID order), capped at `limit` (default 25).
 *
 * Returns an empty array when the user has no activities.
 */
export async function listActivities(sub: string, limit = 25): Promise<ActivityItem[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...activityKeys.activityListQuery(sub),
      Limit: limit,
    }),
  );
  return (Items ?? []) as ActivityItem[];
}

/**
 * Lists a user's in-flight activities (status 'queued' or 'running') via a
 * base-table query with FilterExpression, capped at `limit` (default 25).
 *
 * Returns an empty array when the user has no in-flight activities.
 */
export async function listInFlightActivities(sub: string, limit = 25): Promise<ActivityItem[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...activityKeys.activityInFlightQuery(sub),
      Limit: limit,
    }),
  );
  return (Items ?? []) as ActivityItem[];
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/** Maps a full ActivityItem to the lightweight ActivitySummary shape. */
export function toSummary(item: ActivityItem): ActivitySummary {
  return {
    activityId: item.activityId,
    kind: item.kind,
    status: item.status,
    phase: item.phase,
    phaseDetail: item.phaseDetail,
    progress: item.progress,
    title: item.title,
    updatedAt: item.updatedAt,
  };
}

/** Maps a full ActivityItem to the ActivityDetail shape (summary + history + extras). */
export function toDetail(item: ActivityItem): ActivityDetail {
  return {
    activityId: item.activityId,
    kind: item.kind,
    status: item.status,
    phase: item.phase,
    phaseDetail: item.phaseDetail,
    progress: item.progress,
    title: item.title,
    updatedAt: item.updatedAt,
    steps: item.steps,
    stream: item.stream,
    error: item.error,
    refId: item.refId,
    createdAt: item.createdAt,
  };
}
