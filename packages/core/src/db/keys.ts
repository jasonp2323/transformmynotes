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
