import type { InviteItem } from '@transformmynotes/core';

// ---------------------------------------------------------------------------
// Short UTC month names used for deterministic formatting across timezones.
// ---------------------------------------------------------------------------

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * Formats an ISO-8601 date string as a short human-readable date,
 * e.g. `"Jun 5"` or `"Dec 31"`. Uses UTC parts so the output is
 * deterministic across timezones (important for unit tests).
 */
export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// ---------------------------------------------------------------------------
// Invite display helpers
// ---------------------------------------------------------------------------

/**
 * Returns the recipient label for an invite row.
 * - Email invites: the target email address.
 * - Code invites: the label, or `'—'` if absent.
 */
export function inviteRecipientLabel(invite: Pick<InviteItem, 'type' | 'targetEmail' | 'label'>): string {
  if (invite.type === 'email') {
    return invite.targetEmail ?? '—';
  }
  return invite.label ?? '—';
}

/**
 * Returns a short, non-sensitive reference string for the invite.
 * Since the raw code is never stored, we expose the first 8 hex chars of the hash.
 */
export function inviteCodeRef(invite: Pick<InviteItem, 'codeHash'>): string {
  return invite.codeHash.slice(0, 8);
}

/**
 * Returns a human-readable detail string for an invite row.
 * - Code invites: `"N/M used"` (usage count).
 * - Email invites: `"Expires MMM D"` if `expiresAt` is set, else `"No expiry"`.
 */
export function inviteDetail(invite: Pick<InviteItem, 'type' | 'usedCount' | 'maxUses' | 'expiresAt'>): string {
  if (invite.type === 'code') {
    return `${invite.usedCount}/${invite.maxUses} used`;
  }
  // email invite
  if (invite.expiresAt) {
    return `Expires ${formatShortDate(invite.expiresAt)}`;
  }
  return 'No expiry';
}

// ---------------------------------------------------------------------------
// Expiry helpers
// ---------------------------------------------------------------------------

export type ExpiryOption = 'In 7 days' | 'In 30 days';

/**
 * Returns the ISO-8601 datetime string for `now + N days`, where N is
 * determined by the chosen expiry option.
 */
export function expiresAtForOption(option: ExpiryOption, now: Date): string {
  const d = new Date(now.getTime());
  if (option === 'In 7 days') {
    d.setDate(d.getDate() + 7);
  } else {
    d.setDate(d.getDate() + 30);
  }
  return d.toISOString();
}
