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
 *   images/users/<sub>/<id>.jpg       — original photo (presigned PUT)
 *   markdown/users/<sub>/<id>.md      — transcription output (written server-side)
 *   study/users/<sub>/<id>.json       — generated study-set body (M13)
 */
export const storageKeys = {
  originalImage: (sub: string, id: string) => `images/users/${sub}/${id}.jpg`,
  noteMarkdown: (sub: string, id: string) => `markdown/users/${sub}/${id}.md`,
  studySetBody: (sub: string, studySetId: string) => `study/users/${sub}/${studySetId}.json`,
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

/**
 * `Notes` table keys for CARD items (spaced-repetition flashcards).
 *
 * CARD items live in the same Notes table as note metadata, tag-index items,
 * token-index items, and share items. They are distinguished by an SK prefix
 * of `CARD#`, which keeps them out of the note-recency query (`begins_with(sk,
 * 'NOTE#')`) and all other existing note/tag/token/share index queries.
 *
 * Item shape:
 *   PK  = `USER#<cognitoSub>`   — owner's partition (same as note items)
 *   SK  = `CARD#<cardId>`       — cardId is a ULID generated at extraction time
 *   attrs:
 *     cardId          string   — ULID identifier
 *     sourceNoteId    string   — ULID of the parent note the card was extracted from
 *     front           string   — question / prompt side of the card
 *     back            string   — answer / explanation side of the card
 *     ease            number   — SM-2 ease factor (default 2.5)
 *     interval        number   — SM-2 inter-repetition interval in days (default 1)
 *     dueAt           string   — ISO-8601 UTC datetime; when this card is next due
 *     lastReviewedAt  string?  — ISO-8601 UTC datetime; omitted until first review
 *     createdAt       string   — ISO-8601 UTC datetime
 *     updatedAt       string   — ISO-8601 UTC datetime
 *
 * GSI5 (`ByDue`, projection ALL):
 *   gsi5pk = `USER#<cognitoSub>`, gsi5sk = `DUE#<ISO-8601 dueAt>`
 *   — list a user's due cards oldest-due-first. ISO-8601 UTC strings are
 *     lexicographically sortable, so `ScanIndexForward: true` returns the
 *     most-overdue cards first. Projection ALL means the full card attributes
 *     are returned without a follow-up BatchGetItem.
 *
 * CARD items carry ONLY the gsi5 keys — they deliberately omit gsi1/gsi2/gsi3/gsi4
 * keys so they stay out of the note-recency, tag, token, and share indexes
 * (sparse index pattern). Because SK begins with `CARD#` (not `NOTE#`), they
 * also never appear in `noteListRecentQuery`.
 */
export const cardKeys = {
  /**
   * Full primary key for a card item.
   * PK = `USER#<cognitoSub>`, SK = `CARD#<cardId>`.
   */
  cardItemKey: (userSub: string, cardId: string) => ({
    pk: `USER#${userSub}`,
    sk: `CARD#${cardId}`,
  }),

  /**
   * GSI5 partition key for a card item (`USER#<cognitoSub>`).
   * Scopes the due-date index to a single user's cards.
   */
  gsi5pk: (userSub: string) => `USER#${userSub}`,

  /**
   * GSI5 sort key for a card item (`DUE#<ISO-8601 dueAt>`).
   * ISO-8601 UTC strings are lexicographically sortable, so the GSI range
   * key encodes the due datetime with a `DUE#` prefix for namespace safety.
   */
  gsi5sk: (dueAt: string) => `DUE#${dueAt}`,

  /**
   * Query parameters for listing all cards due at or before `beforeOrAt` via
   * GSI5 (`ByDue`). Returns items in ascending due-date order (oldest-due
   * first = most-overdue worked first), capped at 100.
   *
   * GSI5 is projection ALL — full card attributes are returned without an
   * extra BatchGetItem. Pass the returned object directly as additional
   * params to QueryCommand.
   */
  cardsByDueQuery: (userSub: string, beforeOrAt: string) => ({
    IndexName: 'GSI5',
    KeyConditionExpression: 'gsi5pk = :pk AND gsi5sk <= :hi',
    ExpressionAttributeValues: {
      ':pk': `USER#${userSub}`,
      ':hi': `DUE#${beforeOrAt}`,
    },
    ScanIndexForward: true,
    Limit: 100,
  }),

  /**
   * Base-table query parameters for listing all cards for a given note for a
   * given user. Queries the primary index: `pk = USER#<sub>` AND
   * `begins_with(sk, 'CARD#')`, then applies a FilterExpression on
   * `sourceNoteId` to narrow to cards extracted from the specific note.
   *
   * Note: the FilterExpression is evaluated after the key condition — it does
   * not reduce RCU consumption but does keep the API surface simple for the
   * expected low cardinality of cards-per-user. Pass the returned object
   * directly as additional params to QueryCommand.
   */
  cardsByNoteQuery: (userSub: string, noteId: string) => ({
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    FilterExpression: 'sourceNoteId = :nid',
    ExpressionAttributeValues: {
      ':pk': `USER#${userSub}`,
      ':sk': 'CARD#',
      ':nid': noteId,
    },
  }),
};

/**
 * `Notes` table keys for ATTEMPT items (auto-graded quiz attempts, M15).
 *
 * A quiz in M15 is an existing `STUDYSET` item of `type: "quiz"`, so the
 * `quizId` is the `studySetId` and the quiz body already lives in S3 under
 * `storageKeys.studySetBody(sub, studySetId)`. ATTEMPT items record a user's
 * graded answers for a quiz and live in the same Notes table alongside note
 * metadata, tag/token/share/card/studyset items. They are distinguished by an
 * SK prefix of `ATTEMPT#`, which keeps them out of every other existing index
 * query.
 *
 * Item shape:
 *   PK  = `USER#<cognitoSub>`              — owner's partition (same as note items)
 *   SK  = `ATTEMPT#<quizId>#<attemptId>`   — scoped to quiz + attempt (both ULIDs)
 *   attrs:
 *     attemptId   string                   — ULID identifier for the attempt
 *     quizId      string                   — the source studySetId of type 'quiz'
 *     answers     Record<string,string>    — questionId -> submitted answer
 *     results     Record<string,AttemptResult> — per-question grading result
 *     score       number                   — overall score in [0,1]
 *     gradedAt    string                   — ISO-8601 UTC datetime grading completed
 *     durationMs  number?                  — wall-clock time spent on the attempt
 *
 * GSI8 (`ByQuizAttempt`, projection ALL):
 *   gsi8pk = `QUIZ#<quizId>`, gsi8sk = `GRADEDAT#<ISO-8601 gradedAt>`
 *   — list ALL attempts for a quiz (across every user) newest-first. ISO-8601
 *     UTC strings are lexicographically sortable, so `ScanIndexForward: false`
 *     returns the most-recent attempts first. Projection ALL means full attempt
 *     attributes are returned without a follow-up GetItem. Because the GSI8
 *     partition is keyed by quiz (not user), the query returns every user's
 *     attempts — callers MUST filter by ownership (`pk === USER#<sub>`).
 *
 * ATTEMPT items carry ONLY the gsi8 keys — they deliberately omit
 * gsi1..gsi7 keys so they stay out of every other index (sparse index pattern).
 * Because SK begins with `ATTEMPT#` (not `NOTE#`), they also never appear in
 * `noteListRecentQuery`.
 */
export const attemptKeys = {
  /**
   * Full primary key for an attempt item.
   * PK = `USER#<cognitoSub>`, SK = `ATTEMPT#<quizId>#<attemptId>`.
   */
  attemptItemKey: (
    userSub: string,
    quizId: string,
    attemptId: string,
  ): { pk: string; sk: string } => ({
    pk: `USER#${userSub}`,
    sk: `ATTEMPT#${quizId}#${attemptId}`,
  }),

  /**
   * GSI8 partition key for an attempt item (`QUIZ#<quizId>`).
   * Groups all attempts for a quiz regardless of owner — callers must filter
   * by ownership after querying.
   */
  gsi8pk: (quizId: string): string => `QUIZ#${quizId}`,

  /**
   * GSI8 sort key for an attempt item (`GRADEDAT#<ISO-8601 gradedAt>`).
   * ISO-8601 UTC strings are lexicographically sortable, so the GSI range key
   * encodes the graded datetime with a `GRADEDAT#` prefix for namespace safety.
   */
  gsi8sk: (gradedAt: string): string => `GRADEDAT#${gradedAt}`,

  /**
   * Query parameters for listing all attempts for a quiz via GSI8
   * (`ByQuizAttempt`), newest-first (ScanIndexForward: false so descending
   * `GRADEDAT#<ISO>` order = most-recent first), capped at 20.
   *
   * NOTE: GSI8 is partitioned by quiz, so this returns EVERY user's attempts
   * for the quiz — callers must filter by ownership (`pk === USER#<sub>`).
   * GSI8 is projection ALL — full attributes are returned without a follow-up
   * GetItem. Pass the returned object directly as additional params to QueryCommand.
   */
  listAttemptsByQuizQuery: (quizId: string) => ({
    IndexName: 'GSI8',
    KeyConditionExpression: 'gsi8pk = :pk',
    ExpressionAttributeValues: { ':pk': `QUIZ#${quizId}` },
    ScanIndexForward: false,
    Limit: 20,
  }),

  /**
   * Base-table query parameters for listing a single user's attempts for a
   * given quiz. Queries the primary index: `pk = USER#<sub>` AND
   * `begins_with(sk, 'ATTEMPT#<quizId>#')`, so only that user's attempts for
   * the quiz are returned.
   * Pass the returned object directly as additional params to QueryCommand.
   */
  listAttemptsForUserQuizQuery: (userSub: string, quizId: string) => ({
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userSub}`,
      ':sk': `ATTEMPT#${quizId}#`,
    },
  }),
};

/**
 * `UserData` table keys for upload session items (multipart upload tracker).
 * PK = `USER#<sub>`, SK = `UPLOAD#<uploadToken>`.
 * Stores S3 multipart UploadId + job metadata for resume/idempotency.
 */
export const uploadKeys = {
  /** Full primary key for an upload session item. */
  uploadSession: (sub: string, uploadToken: string) => ({
    pk: `USER#${sub}`,
    sk: `UPLOAD#${uploadToken}`,
  }),
};

/**
 * Fixed-window rate-limit counter keys (stored in the UserData table, M11.2.2).
 * One item per (route, ip, window). PK groups by route; SK pins the ip + window
 * start (epoch seconds). Items carry an `expiresAt` TTL attribute so exhausted
 * windows are auto-removed by DynamoDB without an explicit delete.
 */
export const rateLimitKeys = {
  counter: (route: string, ip: string, windowStart: string) => ({
    pk: `RATELIMIT#${route}`,
    sk: `IP#${ip}#WIN#${windowStart}`,
  }),
};

/**
 * `Notes` table keys for STUDYSET items (AI-generated study material, M13).
 *
 * STUDYSET items live in the same Notes table alongside note metadata, tag-index
 * items, token-index items, share items, and card items. They are distinguished
 * by an SK prefix of `STUDYSET#`, which keeps them out of every other existing
 * index query.
 *
 * Item shape:
 *   PK  = `USER#<cognitoSub>`           — owner's partition (same as note items)
 *   SK  = `STUDYSET#<studySetId>`       — studySetId is a ULID generated at request time
 *   attrs:
 *     studySetId      string            — ULID identifier
 *     sourceNoteIds   string[]          — source note(s) (single-element in M13; multi-note M17)
 *     type            StudyMaterialType — 'flashcards' | 'quiz' | 'assignment' | 'summary'
 *     title           string            — display title (from caller)
 *     status          StudySetStatus    — 'queued' | 'running' | 'ready' | 'failed'
 *     language        StudyLanguage     — 'pt-BR' | 'bilingual'
 *     model           string            — Bedrock model id snapshot at generation time
 *     promptVersion   string            — prompt version; empty string at queue time
 *     error?          string            — reason for failure; only when status='failed'
 *     bodyS3Key?      string            — S3 key for generated payload; only when status='ready'
 *     createdAt       string            — ISO-8601 UTC datetime
 *     updatedAt       string            — ISO-8601 UTC datetime
 *
 * GSI6 (`StudySetsByUser`, projection ALL):
 *   gsi6pk = `USER#<cognitoSub>`, gsi6sk = `STUDYSET#<studySetId>`
 *   — list a user's study sets newest-first. ULID sort keys are
 *     lexicographically sortable; `ScanIndexForward: false` gives newest first.
 *     Projection ALL means full attributes are returned without a follow-up GetItem.
 *
 * GSI7 (`StudySetsByNote`, projection ALL):
 *   gsi7pk = `NOTE#<sourceNoteId>`, gsi7sk = `USER#<sub>#STUDYSET#<studySetId>`
 *   — find all study sets derived from a given note. The gsi7sk begins with
 *     `USER#<sub>#STUDYSET#` so a per-user filter can be applied with
 *     `begins_with(gsi7sk, 'USER#<sub>#STUDYSET#')`, preventing cross-user
 *     leakage through the shared GSI7 partition.
 *
 * STUDYSET items carry ONLY the gsi6/gsi7 keys — they deliberately omit
 * gsi1/gsi2/gsi3/gsi4/gsi5 keys so they stay out of the note-recency, tag,
 * token, share, and due-date indexes (sparse index pattern).
 */
export const studySetKeys = {
  /**
   * Full primary key for a study-set item.
   * PK = `USER#<cognitoSub>`, SK = `STUDYSET#<studySetId>`.
   */
  item: (sub: string, studySetId: string) => ({
    pk: `USER#${sub}`,
    sk: `STUDYSET#${studySetId}`,
  }),

  /**
   * GSI6 partition key for a study-set item (`USER#<cognitoSub>`).
   * Scopes the recency index to a single user's study sets.
   */
  gsi6pk: (sub: string) => `USER#${sub}`,

  /**
   * GSI6 sort key for a study-set item (`STUDYSET#<studySetId>`).
   * ULID sort keys are lexicographically sortable so `ScanIndexForward: false`
   * returns newest-first.
   */
  gsi6sk: (studySetId: string) => `STUDYSET#${studySetId}`,

  /**
   * GSI7 partition key for a study-set item (`NOTE#<sourceNoteId>`).
   * Groups all study sets derived from the same source note regardless of owner.
   */
  gsi7pk: (sourceNoteId: string) => `NOTE#${sourceNoteId}`,

  /**
   * GSI7 sort key for a study-set item (`USER#<sub>#STUDYSET#<studySetId>`).
   * Encodes the owner sub so a `begins_with(gsi7sk, 'USER#<sub>#STUDYSET#')`
   * filter restricts results to the requesting user and prevents cross-user leakage.
   */
  gsi7sk: (sub: string, studySetId: string) => `USER#${sub}#STUDYSET#${studySetId}`,

  /**
   * Query parameters for listing all study sets for a user via GSI6
   * (`StudySetsByUser`), newest-first (ScanIndexForward: false so descending
   * ULID order = newest first), capped at `limit` (default 50).
   * Pass the returned object directly as additional params to QueryCommand.
   */
  listByUser: (sub: string, limit = 50) => ({
    IndexName: 'GSI6',
    KeyConditionExpression: 'gsi6pk = :pk AND begins_with(gsi6sk, :prefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${sub}`,
      ':prefix': 'STUDYSET#',
    },
    ScanIndexForward: false,
    Limit: limit,
  }),

  /**
   * Query parameters for listing all study sets derived from a source note for
   * a given user via GSI7 (`StudySetsByNote`). The begins_with on gsi7sk
   * `USER#<sub>#STUDYSET#` scopes results to the requesting user only, preventing
   * cross-user leakage through the shared GSI7 partition.
   * Pass the returned object directly as additional params to QueryCommand.
   */
  listByNote: (sourceNoteId: string, sub: string) => ({
    IndexName: 'GSI7',
    KeyConditionExpression: 'gsi7pk = :pk AND begins_with(gsi7sk, :prefix)',
    ExpressionAttributeValues: {
      ':pk': `NOTE#${sourceNoteId}`,
      ':prefix': `USER#${sub}#STUDYSET#`,
    },
  }),

  /**
   * Query parameters for counting/listing a user's in-flight study sets (status
   * 'queued' or 'running') via GSI6. Uses a FilterExpression on the (non-key)
   * status attribute; '#status' aliases the DynamoDB reserved word.
   * Pass the returned object directly as additional params to QueryCommand.
   */
  inFlightByUser: (sub: string) => ({
    IndexName: 'GSI6',
    KeyConditionExpression: 'gsi6pk = :pk AND begins_with(gsi6sk, :prefix)',
    FilterExpression: '#status = :queued OR #status = :running',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':pk': `USER#${sub}`,
      ':prefix': 'STUDYSET#',
      ':queued': 'queued',
      ':running': 'running',
    },
  }),

  /**
   * Parses a study-set sort key (`STUDYSET#<studySetId>`) back into its parts.
   * Useful for downstream waves that recover the studySetId from a key-only
   * projection. Throws on a malformed key.
   */
  parseStudySetSk: (sk: string): { studySetId: string } => {
    const match = /^STUDYSET#(.+)$/.exec(sk);
    if (!match) {
      throw new Error(`studySetKeys.parseStudySetSk: malformed study-set sort key "${sk}"`);
    }
    return { studySetId: match[1] };
  },
};

/**
 * `UserData` table keys for the admin-tunable AI generation config (M19).
 *
 * Two item shapes live under a single dedicated partition `CONFIG#AI`, which is
 * outside the `USER#<sub>` namespace so there is no collision with user data:
 *   - Active config:    PK = `CONFIG#AI`, SK = `CURRENT`
 *   - History snapshot: PK = `CONFIG#AI`, SK = `VERSION#<zero-padded seq>`
 *
 * The `VERSION#` sort key is zero-padded to 12 digits so a lexicographic scan
 * returns version snapshots in ascending integer order. No GSI is needed — all
 * lookups use the known PK + SK (or SK prefix).
 */
export const aiConfigKeys = {
  /** Active config item. PK = `CONFIG#AI`, SK = `CURRENT`. */
  current: () => ({ pk: 'CONFIG#AI', sk: 'CURRENT' as const }),

  /**
   * Immutable history snapshot. SK is zero-padded to 12 digits so a
   * lexicographic scan returns versions in ascending integer order.
   *   SK = VERSION#000000000001, VERSION#000000000002, …
   */
  version: (seq: number) => ({
    pk: 'CONFIG#AI',
    sk: `VERSION#${String(seq).padStart(12, '0')}` as const,
  }),

  /**
   * Query parameters for listing all history snapshots in ascending order.
   * Pass the returned object directly as additional params to QueryCommand.
   */
  listVersions: () => ({
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: { ':pk': 'CONFIG#AI', ':prefix': 'VERSION#' },
    ScanIndexForward: true,
  }),

  /**
   * Parses a `VERSION#<padded>` sort key back to its integer seq. The padded
   * digits are interpreted as a base-10 integer (leading zeros stripped).
   * Throws on a malformed key.
   */
  parseVersionSk: (sk: string): { seq: number } => {
    const match = /^VERSION#(\d+)$/.exec(sk);
    if (!match) {
      throw new Error(`aiConfigKeys.parseVersionSk: malformed version sort key "${sk}"`);
    }
    return { seq: Number(match[1]) };
  },
};
