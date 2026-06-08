import { createHash } from 'node:crypto';

/**
 * Returns the SHA-256 hex digest of the trimmed, lowercased invite code.
 * This is the canonical way to derive the DynamoDB key from a raw user-supplied code.
 */
export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code.trim().toLowerCase()).digest('hex');
}

/**
 * Minimal shape of an invite record as stored in the M3 Invites table.
 * This file only reads the record — the Invites table and its full key builder
 * are owned by M3. Fields here are the subset needed for invite evaluation.
 */
export interface InviteRecord {
  codeHash: string;
  groupId?: string;
  groupName?: string;
  inviterName?: string;
  /** ISO-8601 datetime after which the invite is no longer valid. */
  expiresAt?: string;
  maxUses?: number;
  usedCount?: number;
  revoked?: boolean;
}

/** The outcome of evaluating an invite record against the current time. */
export interface InviteEvaluation {
  valid: boolean;
  reason?: 'missing' | 'revoked' | 'expired' | 'exhausted';
  groupId?: string;
  groupName?: string;
}

/**
 * Pure function — no AWS imports. Evaluates an invite record and returns
 * whether it is currently valid, and if not, why.
 *
 * Evaluation order:
 *  1. undefined → missing
 *  2. revoked === true → revoked
 *  3. expiresAt present AND <= now → expired
 *  4. maxUses defined AND usedCount >= maxUses → exhausted
 *  5. otherwise → valid (returns groupId / groupName if present)
 */
export function evaluateInvite(
  invite: InviteRecord | undefined,
  now: Date = new Date(),
): InviteEvaluation {
  if (invite === undefined) {
    return { valid: false, reason: 'missing' };
  }

  if (invite.revoked === true) {
    return { valid: false, reason: 'revoked' };
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
  };
}
