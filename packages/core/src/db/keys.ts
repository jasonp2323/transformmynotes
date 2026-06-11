/**
 * Canonical PK/SK/GSI key builders for the DynamoDB single-table design.
 * Every access pattern lives here — never inline `pk`/`sk` strings in route
 * handlers or jobs. Future domains (notebooks, notes, invites, groups, …) add
 * their builders to this file as they are introduced.
 */

/** Possible user lifecycle statuses stored in the GSI1 partition key. */
export type UserStatus = 'pending' | 'active' | 'disabled';

/** `UserData` table keys. PK = `USER#<userId>`, SK = `PROFILE`. */
export const userDataKeys = {
  /** Profile record for a single user (one per Cognito sub). */
  profile: (userId: string) => ({ pk: `USER#${userId}`, sk: 'PROFILE' as const }),

  /**
   * GSI1 key attributes for a user profile item.
   * gsi1pk = `STATUS#<status>`, gsi1sk = ISO-8601 createdAt.
   * Attach these alongside the primary keys when writing/updating a profile.
   */
  statusIndex: (status: UserStatus, createdAt: string) => ({
    gsi1pk: `STATUS#${status}`,
    gsi1sk: createdAt,
  }),

  /**
   * Query parameters for listing all users with a given status via GSI1,
   * in ascending chronological order (oldest → newest).
   * Pass the returned object directly as additional params to QueryCommand.
   */
  listByStatus: (status: UserStatus) => ({
    IndexName: 'GSI1',
    KeyConditionExpression: 'gsi1pk = :gsi1pk',
    ExpressionAttributeValues: { ':gsi1pk': `STATUS#${status}` },
  }),

  /** Audit record left behind when a user is removed. Same partition as the (now deleted) profile. */
  deletedAudit: (userId: string) => ({ pk: `USER#${userId}`, sk: 'DELETED' as const }),
};

/** Possible access request statuses stored in the GSI1 partition key. */
export type AccessRequestStatus = 'new' | 'approved' | 'dismissed';

/** `UserData` table keys for access request items. PK = `ACCESSREQ#<id>`, SK = `REQUEST`. */
export const accessRequestKeys = {
  /** Primary key for a single access request (one per submitted request). */
  request: (id: string) => ({ pk: `ACCESSREQ#${id}`, sk: 'REQUEST' as const }),

  /**
   * GSI1 key attributes for an access request item.
   * gsi1pk = `ACCESSREQ_STATUS#<status>`, gsi1sk = ISO-8601 createdAt.
   * Attach these alongside the primary keys when writing/updating a request.
   */
  statusIndex: (status: AccessRequestStatus, createdAt: string) => ({
    gsi1pk: `ACCESSREQ_STATUS#${status}`,
    gsi1sk: createdAt,
  }),

  /**
   * Query parameters for listing all access requests with a given status via GSI1,
   * in ascending chronological order (oldest → newest).
   * Pass the returned object directly as additional params to QueryCommand.
   */
  listByStatus: (status: AccessRequestStatus) => ({
    IndexName: 'GSI1',
    KeyConditionExpression: 'gsi1pk = :gsi1pk',
    ExpressionAttributeValues: { ':gsi1pk': `ACCESSREQ_STATUS#${status}` },
  }),
};

/** Possible invite statuses stored in the GSI1 sort key prefix. */
export type InviteStatus = 'pending' | 'used' | 'expired' | 'revoked';

/** Possible invite types. */
export type InviteType = 'email' | 'code';

/** `Invites` table keys. PK = `INVITE#<codeHash>`, SK = `INVITE`. */
export const inviteKeys = {
  /** Primary key for a single invite record (one per unique code hash). */
  invite: (codeHash: string) => ({ pk: `INVITE#${codeHash}`, sk: 'INVITE' as const }),

  /**
   * GSI1 key attributes for an invite item.
   * gsi1pk = `INVITES` (all invites in one partition), gsi1sk = `<status>#<ISO-8601 createdAt>`.
   * Attach these alongside the primary keys when writing/updating an invite.
   */
  statusIndex: (status: InviteStatus, createdAt: string) => ({
    gsi1pk: 'INVITES',
    gsi1sk: `${status}#${createdAt}`,
  }),

  /**
   * Query parameters for listing all invites with a given status via GSI1,
   * in ascending chronological order (oldest → newest).
   * Pass the returned object directly as additional params to QueryCommand.
   */
  listByStatus: (status: InviteStatus) => ({
    IndexName: 'GSI1',
    KeyConditionExpression: 'gsi1pk = :gsi1pk AND begins_with(gsi1sk, :prefix)',
    ExpressionAttributeValues: { ':gsi1pk': 'INVITES', ':prefix': `${status}#` },
  }),

  /**
   * Query parameters for listing all invites via GSI1 (all statuses).
   * Pass the returned object directly as additional params to QueryCommand.
   */
  listAll: () => ({
    IndexName: 'GSI1',
    KeyConditionExpression: 'gsi1pk = :gsi1pk',
    ExpressionAttributeValues: { ':gsi1pk': 'INVITES' },
  }),
};

/** Possible roles a user can hold within a group. */
export type GroupRole = 'member' | 'admin';

/**
 * `Groups` table keys.
 *
 * Two item shapes live in this table:
 *   - Group metadata: PK = `GROUP#<groupId>`, SK = `META`
 *   - Group membership: PK = `GROUP#<groupId>`, SK = `MEMBER#<userSub>`
 *
 * The membership item also carries GSI1 keys for the inverted user→groups index:
 *   gsi1pk = `USER#<userSub>`, gsi1sk = `GROUP#<groupId>`
 */
export const groupKeys = {
  /**
   * Primary key for a group metadata item (one per group).
   * PK = `GROUP#<groupId>`, SK = `META`.
   */
  groupMetaKey: (groupId: string) => ({ pk: `GROUP#${groupId}`, sk: 'META' as const }),

  /**
   * Primary key for a group membership item (one per group+user pair).
   * PK = `GROUP#<groupId>`, SK = `MEMBER#<userSub>`.
   */
  groupMemberKey: (groupId: string, userSub: string) => ({
    pk: `GROUP#${groupId}`,
    sk: `MEMBER#${userSub}`,
  }),

  /**
   * GSI1 key attributes for a membership item.
   * gsi1pk = `USER#<userSub>`, gsi1sk = `GROUP#<groupId>`.
   * Attach these alongside the primary keys when writing a membership item.
   */
  userGroupsIndexKey: (userSub: string, groupId: string) => ({
    gsi1pk: `USER#${userSub}`,
    gsi1sk: `GROUP#${groupId}`,
  }),

  /**
   * Query parameters for listing all membership items in a group via the primary index.
   * Matches SK values with prefix `MEMBER#`, so the META item is excluded.
   * Pass the returned object directly as additional params to QueryCommand.
   */
  listGroupMembers: (groupId: string) => ({
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: { ':pk': `GROUP#${groupId}`, ':prefix': 'MEMBER#' },
  }),

  /**
   * Query parameters for listing all groups a user belongs to via GSI1.
   * Matches gsi1sk values with prefix `GROUP#`, so only group membership items
   * are returned (not any other USER# indexed items that might exist).
   * Pass the returned object directly as additional params to QueryCommand.
   */
  listUserGroups: (userSub: string) => ({
    IndexName: 'GSI1',
    KeyConditionExpression: 'gsi1pk = :gsi1pk AND begins_with(gsi1sk, :prefix)',
    ExpressionAttributeValues: { ':gsi1pk': `USER#${userSub}`, ':prefix': 'GROUP#' },
  }),
};

/** Possible transcription job statuses. */
export type TranscriptionJobStatus = 'pending' | 'processing' | 'done' | 'error';

/**
 * `TranscriptionJob` item keys, stored in the `UserData` table under the
 * user's own partition. PK = `USER#<cognitoSub>`, SK = `JOB#<jobId>`.
 * Ephemeral OCR job tracker (M4); fetched by PK+SK only — no GSI.
 */
export const jobKeys = {
  /** Partition key for all of a user's items (shared with their profile). */
  pk: (sub: string) => `USER#${sub}`,
  /** Sort key for a single transcription job. */
  sk: (jobId: string) => `JOB#${jobId}`,
  /** Convenience: the full primary key for a job item. */
  job: (sub: string, jobId: string) => ({ pk: `USER#${sub}`, sk: `JOB#${jobId}` }),
  /** No GSI for transcription jobs in M4 — fetched by PK+SK only. */
  gsi: undefined,
};

/**
 * S3 object key builders for note assets. User-scoped prefixes keep IAM
 * conditions simple and prevent cross-user reads.
 *   images/users/<sub>/<id>.jpg     — original photo (presigned PUT)
 *   markdown/users/<sub>/<id>.md    — transcription output (written server-side)
 */
export const storageKeys = {
  originalImage: (sub: string, id: string) => `images/users/${sub}/${id}.jpg`,
  noteMarkdown: (sub: string, id: string) => `markdown/users/${sub}/${id}.md`,
};

/** Possible note processing statuses. */
export type NoteStatus = 'original' | 'clean';

/**
 * `Notes` table keys.
 *
 * Three item shapes live in this table:
 *   - Main note item:    PK = `USER#<cognitoSub>`, SK = `NOTE#<ulid>`
 *   - Tag-index item:    PK = `TAG#<tag>`,          SK = `USER#<sub>#NOTE#<ulid>`
 *   - Token-index item:  PK = `USER#<sub>`,          SK = `TOKEN#<token>#NOTE#<noteId>`
 *
 * GSI1 (`UserNotesByTime`): gsi1pk = `USER#<sub>`, gsi1sk = `NOTE#<ulid>`
 *   — on main note items only; ULID lexicographic order = time order.
 * GSI2 (`NotesByTag`): gsi2pk = `TAG#<tag>`, gsi2sk = `USER#<sub>#NOTE#<ulid>`
 *   — on tag-index items only; KEYS_ONLY projection.
 * GSI3 (`ByToken`): gsi3pk = `USER#<sub>`, gsi3sk = `TOKEN#<token>#NOTE#<noteId>`
 *   — on token-index items only; KEYS_ONLY projection. Supports prefix search
 *     (begins_with on gsi3sk = `TOKEN#<term>`) for full-text search lookups.
 *
 * Tags are NOT stored as GSI2 keys on the main note. Each tag gets its own
 * separate tag-index item so multiple tags per note can be indexed. Similarly,
 * each (token, noteId) pair gets its own token-index item for the inverted index.
 */
export const noteKeys = {
  /** Partition key for a user's notes. */
  pk: (sub: string) => `USER#${sub}`,

  /** Sort key for a single note. */
  sk: (noteId: string) => `NOTE#${noteId}`,

  /** Full primary key for a main note item. */
  note: (sub: string, noteId: string) => ({ pk: `USER#${sub}`, sk: `NOTE#${noteId}` }),

  /** GSI1 partition key for a note item (user-recency GSI). */
  gsi1pk: (sub: string) => `USER#${sub}`,

  /** GSI1 sort key for a note item (ULID = time-ordered). */
  gsi1sk: (noteId: string) => `NOTE#${noteId}`,

  /**
   * Full primary key for a tag-index item.
   * PK = `TAG#<tag>`, SK = `USER#<sub>#NOTE#<ulid>`.
   */
  tagItem: (tag: string, sub: string, noteId: string) => ({
    pk: `TAG#${tag}`,
    sk: `USER#${sub}#NOTE#${noteId}`,
  }),

  /** GSI2 partition key for a tag-index item. */
  gsi2pk: (tag: string) => `TAG#${tag}`,

  /** GSI2 sort key for a tag-index item. */
  gsi2sk: (sub: string, noteId: string) => `USER#${sub}#NOTE#${noteId}`,

  /**
   * Parses a tag-index sort key (`USER#<sub>#NOTE#<ulid>`) back into its parts.
   * GSI2 is KEYS_ONLY, so a tag query projects only the key attributes — the
   * `sub`/`noteId` must be recovered from the key, never read from a stored
   * attribute (which is not projected). Throws on a malformed key.
   */
  parseTagItemSk: (sk: string): { sub: string; noteId: string } => {
    const match = /^USER#(.+?)#NOTE#(.+)$/.exec(sk);
    if (!match) {
      throw new Error(`noteKeys.parseTagItemSk: malformed tag-index sort key "${sk}"`);
    }
    return { sub: match[1], noteId: match[2] };
  },

  /**
   * Query parameters for listing all notes for a user via GSI1, newest-first
   * (ScanIndexForward: false so descending ULID order = newest first).
   * Pass the returned object directly as additional params to QueryCommand.
   */
  listUserNotes: (sub: string) => ({
    IndexName: 'GSI1',
    KeyConditionExpression: 'gsi1pk = :pk AND begins_with(gsi1sk, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${sub}`, ':sk': 'NOTE#' },
    ScanIndexForward: false,
  }),

  /**
   * Query parameters for listing all tag-index items for a given tag via GSI2.
   * Returns KEYS_ONLY items (pk, sk, gsi2pk, gsi2sk, noteId).
   * Pass the returned object directly as additional params to QueryCommand.
   */
  listNotesByTag: (tag: string) => ({
    IndexName: 'GSI2',
    KeyConditionExpression: 'gsi2pk = :pk',
    ExpressionAttributeValues: { ':pk': `TAG#${tag}` },
  }),

  /**
   * Base-table query parameters for listing a user's recent notes, newest-first.
   * Queries the primary index directly: pk = `USER#<sub>` AND begins_with(sk, 'NOTE#').
   * ScanIndexForward: false gives descending ULID order (newest first); Limit: 20
   * caps the result set for the library view.
   * Pass the returned object directly as additional params to QueryCommand.
   */
  noteListRecentQuery: (sub: string) => ({
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: { ':pk': noteKeys.pk(sub), ':sk': 'NOTE#' },
    ScanIndexForward: false,
    Limit: 20,
  }),

  /** GSI3 partition key for a token-index item (`USER#<sub>`). */
  gsi3pk: (sub: string) => `USER#${sub}`,

  /** GSI3 sort key for a token-index item (`TOKEN#<token>#NOTE#<noteId>`). */
  gsi3sk: (token: string, noteId: string) => `TOKEN#${token}#NOTE#${noteId}`,

  /**
   * Base primary key for a token-index item.
   * PK = `USER#<sub>`, SK = `TOKEN#<token>#NOTE#<noteId>`.
   */
  tokenItemKey: (sub: string, token: string, noteId: string) => ({
    pk: `USER#${sub}`,
    sk: `TOKEN#${token}#NOTE#${noteId}`,
  }),

  /**
   * Query parameters for finding note ids that contain a given search term via
   * GSI3 (`ByToken`). Uses begins_with on gsi3sk so a prefix of `TOKEN#<term>`
   * matches all tokens that start with `term` (prefix search).
   * GSI3 is KEYS_ONLY — recover `noteId` from the sk via `parseTokenItemSk`.
   * Pass the returned object directly as additional params to QueryCommand.
   */
  tokenQueryKey: (sub: string, term: string) => ({
    IndexName: 'GSI3',
    KeyConditionExpression: 'gsi3pk = :pk AND begins_with(gsi3sk, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${sub}`, ':sk': `TOKEN#${term}` },
  }),

  /**
   * Parses a token-index sort key (`TOKEN#<token>#NOTE#<noteId>`) back into its parts.
   * GSI3 is KEYS_ONLY, so a token query projects only the key attributes — the
   * `token`/`noteId` must be recovered from the key, never read from a stored
   * attribute (which is not projected). Throws on a malformed key.
   */
  parseTokenItemSk: (sk: string): { token: string; noteId: string } => {
    const match = /^TOKEN#(.+?)#NOTE#(.+)$/.exec(sk);
    if (!match) {
      throw new Error(`noteKeys.parseTokenItemSk: malformed token-index sort key "${sk}"`);
    }
    return { token: match[1], noteId: match[2] };
  },
};

/**
 * `Notes` table keys for SHARE items.
 *
 * A `SHARE` item records that a note owner has shared a specific note with a
 * specific recipient. Share items live in the same Notes table as note metadata
 * and token-index items, enabling a note delete to cascade share removal in a
 * single `TransactWrite`.
 *
 * Item shape:
 *   PK  = `USER#<ownerSub>`                         — owner's partition
 *   SK  = `SHARE#<noteId>#RECIPIENT#<recipientSub>` — scoped to note + recipient
 *   attrs:
 *     ownerSub      string   — Cognito sub of the note owner
 *     ownerName     string   — denormalised display name (accepted drift on rename)
 *     recipientSub  string   — Cognito sub of the share recipient
 *     noteId        string   — ULID note identifier
 *     noteTitle     string   — denormalised for Shared-tab display
 *     groupId       string   — the group this share is scoped to
 *     permission    "read"   — only "read" in M7; extensible later
 *     sharedAt      string   — ISO-8601 timestamp
 *     revokedAt?    string   — set on soft-delete; TTL cleanup removes after 30 days
 *     ttl?          number   — Unix epoch seconds; set alongside revokedAt
 *
 * GSI4 (`ByRecipient`, projection ALL):
 *   gsi4pk = `USER#<recipientSub>`, gsi4sk = `SHARED_AT#<ISO-8601>`
 *   — list all notes shared with a recipient, newest-first. Projection ALL means
 *     denormalised display attributes (ownerName, noteTitle, groupId) are returned
 *     directly from the index without an extra GetItem.
 *
 * Soft-delete pattern:
 *   On revoke, set `revokedAt` + `ttl` on the item. The GSI4 query filters with
 *   `FilterExpression: attribute_not_exists(revokedAt)` so revoked items are
 *   excluded from the Shared tab. Hard-delete is handled by DynamoDB TTL after 30 days.
 */
export const shareKeys = {
  /**
   * Full primary key for a share item.
   * PK = `USER#<ownerSub>`, SK = `SHARE#<noteId>#RECIPIENT#<recipientSub>`.
   */
  shareItemKey: (ownerSub: string, noteId: string, recipientSub: string) => ({
    pk: `USER#${ownerSub}`,
    sk: `SHARE#${noteId}#RECIPIENT#${recipientSub}`,
  }),

  /**
   * GSI4 partition key for a share item (`USER#<recipientSub>`).
   * Scopes the recipient-facing index to a single user's received shares.
   */
  gsi4pk: (recipientSub: string) => `USER#${recipientSub}`,

  /**
   * GSI4 sort key for a share item (`SHARED_AT#<ISO-8601>`).
   * ISO-8601 UTC strings are lexicographically sortable, so
   * `ScanIndexForward: false` gives newest-first ordering.
   */
  gsi4sk: (sharedAt: string) => `SHARED_AT#${sharedAt}`,

  /**
   * Query parameters for listing all active shares for a recipient via GSI4
   * (`ByRecipient`). Returns items newest-first (ScanIndexForward: false),
   * capped at 50, filtering out soft-deleted shares via
   * `FilterExpression: attribute_not_exists(revokedAt)`.
   *
   * GSI4 is projection ALL — denormalised display attributes (ownerName,
   * noteTitle, groupId) are returned directly without an extra GetItem.
   * Pass the returned object directly as additional params to QueryCommand.
   */
  sharesByRecipientQuery: (recipientSub: string) => ({
    IndexName: 'GSI4',
    KeyConditionExpression: 'gsi4pk = :pk',
    ExpressionAttributeValues: { ':pk': `USER#${recipientSub}` },
    FilterExpression: 'attribute_not_exists(revokedAt)',
    ScanIndexForward: false,
    Limit: 50,
  }),

  /**
   * Base-table query parameters for listing all share items for a given note,
   * including both active and revoked shares (no FilterExpression applied here).
   * Queries the primary index: `pk = USER#<ownerSub>` AND
   * `begins_with(sk, 'SHARE#<noteId>#')`.
   *
   * Useful for displaying the share sheet (who a note is currently shared with)
   * and for cascade-deleting shares when a note is deleted.
   * Pass the returned object directly as additional params to QueryCommand.
   */
  sharesByNoteQuery: (ownerSub: string, noteId: string) => ({
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${ownerSub}`, ':sk': `SHARE#${noteId}#` },
  }),

  /**
   * Parses a share sort key (`SHARE#<noteId>#RECIPIENT#<recipientSub>`) back
   * into its parts. Used after a `sharesByNoteQuery` to recover the `noteId`
   * and `recipientSub` from the key without relying on stored attributes.
   * Throws on a malformed key.
   */
  parseShareSk: (sk: string): { noteId: string; recipientSub: string } => {
    const match = /^SHARE#(.+?)#RECIPIENT#(.+)$/.exec(sk);
    if (!match) {
      throw new Error(`shareKeys.parseShareSk: malformed share sort key "${sk}"`);
    }
    return { noteId: match[1], recipientSub: match[2] };
  },
};
