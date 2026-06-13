/**
 * Pure, DynamoDB-free helpers for the admin invite-creation route.
 *
 * These are extracted here so they can be unit-tested without any AWS deps.
 */

/** Basic email regex — validates structure without being overly strict. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Code formatting
// ---------------------------------------------------------------------------

/**
 * Inserts a dash in the middle of an 8-character invite code → `ABCD-EFGH`.
 *
 * If the code is not exactly 8 characters, groups into chunks of 4 separated
 * by dashes, or returns the code as-is if it's too short to chunk.
 */
export function formatInviteCode(raw: string): string {
  if (raw.length === 8) {
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  }
  // Fallback: group into 4s.
  const chunks: string[] = [];
  for (let i = 0; i < raw.length; i += 4) {
    chunks.push(raw.slice(i, i + 4));
  }
  return chunks.length > 1 ? chunks.join('-') : raw;
}

// ---------------------------------------------------------------------------
// Expiry defaults
// ---------------------------------------------------------------------------

export const DEFAULT_EXPIRY_DAYS = 30;

/**
 * Returns the ISO-8601 string for `now + DEFAULT_EXPIRY_DAYS` days.
 */
export function defaultExpiresAt(now: Date): string {
  const d = new Date(now.getTime());
  d.setDate(d.getDate() + DEFAULT_EXPIRY_DAYS);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------

/** Parsed invite for `type === 'email'`. `maxUses` is always 1. */
export interface ParsedEmailInvite {
  type: 'email';
  email: string;
  groupId?: string;
  expiresAt?: string;
  maxUses: 1;
  role: 'member' | 'admin';
}

/** Parsed invite for `type === 'code'`. */
export interface ParsedCodeInvite {
  type: 'code';
  label: string;
  groupId?: string;
  expiresAt?: string;
  maxUses: number;
  role: 'member' | 'admin';
}

export type ParsedInvite = ParsedEmailInvite | ParsedCodeInvite;

export type ParseCreateInviteResult =
  | { ok: true; value: ParsedInvite }
  | { ok: false; error: string };

/**
 * Parses and validates the JSON body for the create-invite endpoint.
 *
 * Returns `{ ok: true, value }` on success or `{ ok: false, error }` on validation failure.
 */
export function parseCreateInviteBody(body: unknown): ParseCreateInviteResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const type = b.type;

  if (type === 'email') {
    const rawEmail = typeof b.email === 'string' ? b.email.trim() : '';
    if (!rawEmail || !EMAIL_RE.test(rawEmail)) {
      return { ok: false, error: 'A valid email address is required for type=email invites.' };
    }

    const groupId = typeof b.groupId === 'string' && b.groupId.trim() ? b.groupId.trim() : undefined;

    let expiresAt: string | undefined;
    if (b.expiresAt !== undefined) {
      if (typeof b.expiresAt !== 'string') {
        return { ok: false, error: 'expiresAt must be an ISO-8601 date string.' };
      }
      const ts = Date.parse(b.expiresAt);
      if (Number.isNaN(ts)) {
        return { ok: false, error: 'expiresAt is not a parseable ISO date.' };
      }
      expiresAt = b.expiresAt;
    }

    const rawRole = typeof b.role === 'string' ? b.role.trim() : '';
    if (rawRole && rawRole !== 'member' && rawRole !== 'admin') {
      return { ok: false, error: 'role must be "member" or "admin".' };
    }
    const role: 'member' | 'admin' = rawRole === 'admin' ? 'admin' : 'member';

    return {
      ok: true,
      value: { type: 'email', email: rawEmail, groupId, expiresAt, maxUses: 1, role },
    };
  }

  if (type === 'code') {
    const rawLabel = typeof b.label === 'string' ? b.label.trim() : '';
    if (!rawLabel) {
      return { ok: false, error: 'A non-empty label is required for type=code invites.' };
    }

    const groupId = typeof b.groupId === 'string' && b.groupId.trim() ? b.groupId.trim() : undefined;

    let expiresAt: string | undefined;
    if (b.expiresAt !== undefined) {
      if (typeof b.expiresAt !== 'string') {
        return { ok: false, error: 'expiresAt must be an ISO-8601 date string.' };
      }
      const ts = Date.parse(b.expiresAt);
      if (Number.isNaN(ts)) {
        return { ok: false, error: 'expiresAt is not a parseable ISO date.' };
      }
      expiresAt = b.expiresAt;
    }

    // maxUses: default 1 if absent; reject non-integers or values < 1.
    let maxUses = 1;
    if (b.maxUses !== undefined) {
      if (typeof b.maxUses !== 'number' || !Number.isInteger(b.maxUses) || b.maxUses < 1) {
        return { ok: false, error: 'maxUses must be a positive integer.' };
      }
      maxUses = b.maxUses;
    }

    const rawRole = typeof b.role === 'string' ? b.role.trim() : '';
    if (rawRole && rawRole !== 'member' && rawRole !== 'admin') {
      return { ok: false, error: 'role must be "member" or "admin".' };
    }
    const role: 'member' | 'admin' = rawRole === 'admin' ? 'admin' : 'member';

    return {
      ok: true,
      value: { type: 'code', label: rawLabel, groupId, expiresAt, maxUses, role },
    };
  }

  return { ok: false, error: `Invalid type "${String(type)}". Must be "email" or "code".` };
}

// ---------------------------------------------------------------------------
// Invite URL builder
// ---------------------------------------------------------------------------

/**
 * Builds the invite redemption URL for the given origin, raw code, and email.
 *
 * Format: `${origin}/invite?code=<rawCode>&email=<encodedEmail>`
 *
 * `rawCode` is the un-formatted, un-dashed code that is hashed at redemption
 * time — do NOT pass a formatted/dashed code here.
 * `email` is percent-encoded via `encodeURIComponent` so special characters
 * (e.g. `+`, `@`) survive as URL query-parameter values.
 */
export function buildInviteUrl(origin: string, rawCode: string, email: string): string {
  return `${origin}/invite?code=${rawCode}&email=${encodeURIComponent(email)}`;
}
