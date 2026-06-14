import { createHash, randomBytes } from 'node:crypto';
import { inviteKeys, type InviteStatus, type InviteType } from '../db/keys.js';

/**
 * Returns the SHA-256 hex digest of the normalised invite code.
 * Normalisation: trim leading/trailing whitespace, strip all non-alphanumeric
 * characters (separators, dashes, internal spaces, etc.), then lowercase.
 * This ensures formatted codes (e.g. `ABCD-EFGH`) hash identically to their
 * raw counterparts (`ABCDEFGH`).
 * This is the canonical way to derive the DynamoDB key from a raw user-supplied code.
 */
export function hashInviteCode(code: string): string {
  return createHash('sha256')
    .update(code.trim().replace(/[^a-z0-9]/gi, '').toLowerCase())
    .digest('hex');
}

/**
 * Minimal shape of an invite record as stored in the Invites table.
 * Fields here are the subset needed for invite evaluation by the post-confirmation handler.
 * The full item shape is `InviteItem`.
 */
export interface InviteRecord {
  codeHash: string;
  type?: InviteType;
  targetEmail?: string;
  label?: string;
  createdBy?: string;
  groupId?: string;
  groupName?: string;
  inviterName?: string;
  /** ISO-8601 datetime after which the invite is no longer valid. */
  expiresAt?: string;
  maxUses?: number;
  usedCount?: number;
  revoked?: boolean;
  status?: InviteStatus;
  role?: 'member' | 'admin';
}

/** The outcome of evaluating an invite record against the current time. */
export interface InviteEvaluation {
  valid: boolean;
  reason?: 'missing' | 'revoked' | 'expired' | 'exhausted';
  groupId?: string;
  groupName?: string;
  role?: 'member' | 'admin';
}

/**
 * Pure function — no AWS imports. Evaluates an invite record and returns
 * whether it is currently valid, and if not, why.
 *
 * Evaluation order:
 *  1. undefined → missing
 *  2. revoked === true OR status === 'revoked' → revoked
 *  3. status === 'used' → exhausted
 *  4. status === 'expired' → expired
 *  5. expiresAt present AND <= now → expired
 *  6. maxUses defined AND usedCount >= maxUses → exhausted
 *  7. otherwise → valid (returns groupId / groupName if present)
 */
export function evaluateInvite(
  invite: InviteRecord | undefined,
  now: Date = new Date(),
): InviteEvaluation {
  if (invite === undefined) {
    return { valid: false, reason: 'missing' };
  }

  if (invite.revoked === true || invite.status === 'revoked') {
    return { valid: false, reason: 'revoked' };
  }

  if (invite.status === 'used') {
    return { valid: false, reason: 'exhausted' };
  }

  if (invite.status === 'expired') {
    return { valid: false, reason: 'expired' };
  }

  if (invite.expiresAt !== undefined && new Date(invite.expiresAt).getTime() <= now.getTime()) {
    return { valid: false, reason: 'expired' };
  }

  if (invite.maxUses !== undefined && (invite.usedCount ?? 0) >= invite.maxUses) {
    return { valid: false, reason: 'exhausted' };
  }

  return {
    valid: true,
    groupId: invite.groupId,
    groupName: invite.groupName,
    role: invite.role,
  };
}

/**
 * The full DynamoDB item shape for an invite record in the Invites table.
 * Includes primary keys, GSI1 keys, and all spec attributes.
 */
export interface InviteItem {
  pk: string;
  sk: string;
  gsi1pk: string;
  gsi1sk: string;
  codeHash: string;
  code?: string;
  type: InviteType;
  targetEmail?: string;
  label?: string;
  groupId?: string;
  groupName?: string;
  inviterName?: string;
  /** ISO-8601 datetime after which the invite is no longer valid. Absent = never expires. */
  expiresAt?: string;
  maxUses: number;
  usedCount: number;
  status: InviteStatus;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  role?: 'member' | 'admin';
}

/** Input to the `buildInviteItem` builder. */
export interface BuildInviteItemInput {
  codeHash: string;
  code?: string;
  type: InviteType;
  targetEmail?: string;
  label?: string;
  groupId?: string;
  groupName?: string;
  inviterName?: string;
  /** ISO-8601 datetime after which the invite expires. Absent = never expires. */
  expiresAt?: string;
  /** Maximum number of times this invite can be claimed. Defaults to 1. */
  maxUses?: number;
  createdBy?: string;
  status?: InviteStatus;
  /** ISO-8601 datetime to use as createdAt. Defaults to now. */
  createdAt?: string;
  /** ISO-8601 datetime to use as the current time (for updatedAt). Defaults to `new Date().toISOString()`. */
  now?: string;
  role?: 'member' | 'admin';
}

/**
 * Builds the full DynamoDB item for an invite record in the Invites table.
 *
 * Key attributes are derived from `inviteKeys.invite` and `inviteKeys.statusIndex`
 * so the item is correctly indexed by GSI1.
 * Defaults: status → 'pending', usedCount → 0, maxUses → 1.
 */
export function buildInviteItem(input: BuildInviteItemInput): InviteItem {
  const ts = input.now ?? new Date().toISOString();
  const createdAt = input.createdAt ?? ts;
  const status = input.status ?? 'pending';
  const maxUses = input.maxUses ?? 1;

  return {
    ...inviteKeys.invite(input.codeHash),
    ...inviteKeys.statusIndex(status, createdAt),
    codeHash: input.codeHash,
    type: input.type,
    ...(input.targetEmail !== undefined ? { targetEmail: input.targetEmail } : {}),
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
    ...(input.groupName !== undefined ? { groupName: input.groupName } : {}),
    ...(input.inviterName !== undefined ? { inviterName: input.inviterName } : {}),
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    maxUses,
    usedCount: 0,
    status,
    ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
    createdAt,
    updatedAt: ts,
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(input.code !== undefined ? { code: input.code } : {}),
  };
}

/**
 * Alphabet for generated invite codes — uppercase alphanumeric, excluding
 * ambiguous characters O, 0, I, 1 to reduce transcription errors.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generates a cryptographically random invite code.
 * Returns an 8-character uppercase alphanumeric string (ambiguous chars excluded).
 */
export function generateInviteCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes)
    .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    .join('');
}

// Re-export the key types so consumers can use them without importing from db/keys.
export type { InviteStatus, InviteType };
