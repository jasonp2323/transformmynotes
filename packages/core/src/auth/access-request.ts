import { accessRequestKeys, type AccessRequestStatus } from '../db/keys.js';

/** Input to the `buildAccessRequestItem` builder. */
export interface BuildAccessRequestInput {
  id: string;
  email: string;
  name?: string;
  note?: string;
  status?: AccessRequestStatus;
  /** ISO-8601 datetime to use as createdAt. Defaults to `now`. */
  createdAt?: string;
  /** ISO-8601 datetime to use as the current time (for updatedAt). Defaults to `new Date().toISOString()`. */
  now?: string;
}

/**
 * The full DynamoDB item shape for an access request record in the UserData table.
 * Includes primary keys, GSI1 keys, and all M2.5 spec attributes.
 */
export interface AccessRequestItem {
  pk: string;
  sk: string;
  gsi1pk: string;
  gsi1sk: string;
  id: string;
  email: string;
  name: string;
  note?: string;
  status: AccessRequestStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Builds the full DynamoDB item for an access request record.
 *
 * Key attributes are derived from `accessRequestKeys.request` and
 * `accessRequestKeys.statusIndex` so the item is correctly indexed by GSI1.
 * Defaults: status → 'new', name → ''. note is optional and omitted when
 * undefined (the DocumentClient is configured with removeUndefinedValues:true).
 */
export function buildAccessRequestItem(input: BuildAccessRequestInput): AccessRequestItem {
  const ts = input.now ?? new Date().toISOString();
  const createdAt = input.createdAt ?? ts;
  const status = input.status ?? 'new';

  return {
    ...accessRequestKeys.request(input.id),
    ...accessRequestKeys.statusIndex(status, createdAt),
    id: input.id,
    email: input.email,
    name: input.name ?? '',
    ...(input.note !== undefined ? { note: input.note } : {}),
    status,
    createdAt,
    updatedAt: ts,
  };
}
