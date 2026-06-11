import { PutCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { shareKeys } from './keys.js';

// ---------------------------------------------------------------------------
// Item type definitions
// ---------------------------------------------------------------------------

/**
 * A share item in the Notes table.
 *
 * PK = `USER#<ownerSub>`, SK = `SHARE#<noteId>#RECIPIENT#<recipientSub>`.
 * GSI4 (`ByRecipient`, projection ALL): gsi4pk = `USER#<recipientSub>`,
 * gsi4sk = `SHARED_AT#<ISO-8601>`.
 *
 * `revokedAt` and `ttl` are set together on soft-delete (revoke). The GSI4
 * query filters with `attribute_not_exists(revokedAt)` so revoked items are
 * excluded from the Shared tab. Hard-delete is handled by DynamoDB TTL.
 */
export interface ShareItem {
  pk: string;
  sk: string;
  gsi4pk: string;
  gsi4sk: string;
  ownerSub: string;
  ownerName: string;
  recipientSub: string;
  noteId: string;
  noteTitle: string;
  groupId: string;
  permission: 'read';
  sharedAt: string;
  revokedAt?: string;
  ttl?: number;
}

// ---------------------------------------------------------------------------
// Pure item builders
// ---------------------------------------------------------------------------

/** Input for building a share item. */
export interface BuildShareItemInput {
  ownerSub: string;
  /** Denormalised display name of the note owner. Accepted to drift on rename. */
  ownerName: string;
  recipientSub: string;
  noteId: string;
  /** Denormalised note title for Shared-tab display. */
  noteTitle: string;
  /** The group this share is scoped to. */
  groupId: string;
  /** ISO-8601. Defaults to `new Date().toISOString()` if omitted. */
  sharedAt?: string;
  /** Defaults to `'read'` — only value supported in M7. */
  permission?: 'read';
}

/**
 * Builds a `ShareItem` with all DynamoDB keys populated from `shareKeys`.
 *
 * Returns an ACTIVE share (no `revokedAt` or `ttl`). To soft-delete a share,
 * Put the item again with `revokedAt` set to an ISO-8601 string and `ttl` set
 * to a Unix epoch timestamp 30 days in the future.
 */
export function buildShareItem(input: BuildShareItemInput): ShareItem {
  const sharedAt = input.sharedAt ?? new Date().toISOString();
  const permission = input.permission ?? 'read';
  const keys = shareKeys.shareItemKey(input.ownerSub, input.noteId, input.recipientSub);

  return {
    pk: keys.pk,
    sk: keys.sk,
    gsi4pk: shareKeys.gsi4pk(input.recipientSub),
    gsi4sk: shareKeys.gsi4sk(sharedAt),
    ownerSub: input.ownerSub,
    ownerName: input.ownerName,
    recipientSub: input.recipientSub,
    noteId: input.noteId,
    noteTitle: input.noteTitle,
    groupId: input.groupId,
    permission,
    sharedAt,
  };
}

// ---------------------------------------------------------------------------
// DynamoDB access functions
// ---------------------------------------------------------------------------

/**
 * Builds a share item and writes it to the Notes table with `PutCommand`.
 *
 * Returns the built `ShareItem`. An existing share for the same
 * (ownerSub, noteId, recipientSub) triple is overwritten — callers that need
 * idempotent behaviour should check with `getShareItem` first.
 */
export async function putShareItem(input: BuildShareItemInput): Promise<ShareItem> {
  const item = buildShareItem(input);

  await ddb.send(
    new PutCommand({
      TableName: TableNames.Notes,
      Item: item,
    }),
  );

  return item;
}

/**
 * Retrieves a share item by ownerSub, noteId, and recipientSub.
 *
 * Returns `undefined` if no matching item is found (no share exists, or the
 * item was hard-deleted by TTL). Does NOT filter on `revokedAt` — callers must
 * inspect the returned item's `revokedAt` field if they need to distinguish
 * active from revoked shares.
 */
export async function getShareItem(
  ownerSub: string,
  noteId: string,
  recipientSub: string,
): Promise<ShareItem | undefined> {
  const { Item } = await ddb.send(
    new GetCommand({
      TableName: TableNames.Notes,
      Key: shareKeys.shareItemKey(ownerSub, noteId, recipientSub),
    }),
  );

  return Item as ShareItem | undefined;
}

/**
 * Lists all active shares for a recipient by querying GSI4 (`ByRecipient`),
 * newest-first, capped at 50.
 *
 * Soft-deleted shares (those with a `revokedAt` attribute) are excluded by the
 * `FilterExpression` in `sharesByRecipientQuery`. Because GSI4 is projection
 * ALL, the full share item — including denormalised display attributes
 * (`ownerName`, `noteTitle`, `groupId`) — is returned without an extra GetItem.
 *
 * Returns an empty array if the recipient has no active shares.
 */
export async function listSharesForRecipient(recipientSub: string): Promise<ShareItem[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...shareKeys.sharesByRecipientQuery(recipientSub),
    }),
  );

  return (Items ?? []) as ShareItem[];
}

/**
 * Lists all share items (active and revoked) for a given note by querying the
 * base-table primary index.
 *
 * Uses `sharesByNoteQuery` (a `begins_with(sk, 'SHARE#<noteId>#')` filter on
 * `pk = USER#<ownerSub>`). No FilterExpression is applied — both active and
 * revoked items are returned. This is the correct view for the share sheet
 * (who a note is currently shared with) and for cascade-delete on note removal.
 *
 * Returns an empty array if the note has no share items.
 */
export async function listSharesForNote(ownerSub: string, noteId: string): Promise<ShareItem[]> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.Notes,
      ...shareKeys.sharesByNoteQuery(ownerSub, noteId),
    }),
  );

  return (Items ?? []) as ShareItem[];
}

// ---------------------------------------------------------------------------
// Authorisation helper
// ---------------------------------------------------------------------------

/**
 * Returns `true` if `callerSub` is authorised to read the note identified by
 * `(ownerSub, noteId)`; `false` otherwise.
 *
 * Authorisation model (owner-or-valid-recipient):
 *   1. If `callerSub === ownerSub` the caller is the note owner → authorised
 *      immediately, no DB call required.
 *   2. Otherwise, fetch the share item at
 *      `shareKeys.shareItemKey(ownerSub, noteId, callerSub)` using `client`.
 *      The caller is authorised iff the item exists AND `revokedAt` is absent
 *      (i.e. an active share, not a soft-deleted one).
 *
 * The `client` parameter defaults to the module-level `ddb` singleton so the
 * function works in production with zero configuration, but can accept a mocked
 * `DynamoDBDocumentClient` in unit tests — enabling full branch coverage without
 * a running DynamoDB.
 *
 * IMPORTANT: this helper is the single source of truth for note read
 * authorisation. It must be called in every route handler that returns note
 * content (metadata or Markdown body) before any S3 fetch. The client is never
 * trusted to assert ownership or recipient status.
 */
export async function authoriseNoteRead(
  callerSub: string,
  ownerSub: string,
  noteId: string,
  client: DynamoDBDocumentClient = ddb,
): Promise<boolean> {
  // Fast path: the caller is the owner — no DB call needed.
  if (callerSub === ownerSub) {
    return true;
  }

  // Slow path: check for a valid (non-revoked) share item.
  const { Item } = await client.send(
    new GetCommand({
      TableName: TableNames.Notes,
      Key: shareKeys.shareItemKey(ownerSub, noteId, callerSub),
    }),
  );

  const share = Item as ShareItem | undefined;
  return share !== undefined && !share.revokedAt;
}
