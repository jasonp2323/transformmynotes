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
