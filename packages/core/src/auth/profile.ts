import { userDataKeys, type UserStatus } from '../db/keys.js';

export const PREFERRED_LANGUAGES = ['auto', 'pt-BR', 'bilingual'] as const;
export type PreferredLanguage = (typeof PREFERRED_LANGUAGES)[number];

/**
 * Per-user AI study profile (M24). Stored as a map attribute on the PROFILE item.
 * All content fields are optional; `updatedAt` is always set on write.
 */
export interface AiProfile {
  focus?: string;
  level?: string;
  goals?: string;
  preferredLanguage?: PreferredLanguage;
  customInstructions?: string;
  /** ISO-8601 UTC datetime of the last aiProfile write. */
  updatedAt: string;
}

/** Input to the `buildUserProfileItem` builder. */
export interface BuildUserProfileInput {
  sub: string;
  email: string;
  name?: string;
  status: UserStatus;
  role: 'admin' | 'member';
  groupIds?: string[];
  /** ISO-8601 datetime to use as createdAt. Defaults to `now`. */
  createdAt?: string;
  /** ISO-8601 datetime to use as the current time (for updatedAt). Defaults to `new Date().toISOString()`. */
  now?: string;
}

/**
 * The full DynamoDB item shape for a user profile record in the UserData table.
 * Includes primary keys, GSI1 keys, and all M2 spec attributes.
 */
export interface UserProfileItem {
  pk: string;
  sk: string;
  gsi1pk: string;
  gsi1sk: string;
  sub: string;
  email: string;
  name: string;
  status: UserStatus;
  role: 'admin' | 'member';
  groupIds: string[];
  noteCount: number;
  createdAt: string;
  updatedAt: string;
  /** Optional notes set during admin actions (e.g. rejection or revocation reason). */
  auditNotes?: string;
  /** Per-user AI study profile (M24); absent on profiles created before M24. */
  aiProfile?: AiProfile;
}

/**
 * Builds the full DynamoDB item for a user profile record.
 *
 * Key attributes are derived from `userDataKeys.profile` and
 * `userDataKeys.statusIndex` so the item is correctly indexed by GSI1.
 * Defaults: name → '', groupIds → [], noteCount → 0.
 */
export function buildUserProfileItem(input: BuildUserProfileInput): UserProfileItem {
  const ts = input.now ?? new Date().toISOString();
  const createdAt = input.createdAt ?? ts;

  return {
    ...userDataKeys.profile(input.sub),
    ...userDataKeys.statusIndex(input.status, createdAt),
    sub: input.sub,
    email: input.email,
    name: input.name ?? '',
    status: input.status,
    role: input.role,
    groupIds: input.groupIds ?? [],
    noteCount: 0,
    createdAt,
    updatedAt: ts,
  };
}
