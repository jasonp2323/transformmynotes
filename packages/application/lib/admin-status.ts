import type { BadgeProps } from '@/src/components/ui';

/** All known admin-domain statuses. */
export type AdminStatus =
  | 'pending'
  | 'used'
  | 'expired'
  | 'revoked'
  | 'active'
  | 'disabled';

/** Maps each AdminStatus to the Badge tone used in the design. */
export const STATUS_TONE: Record<AdminStatus, BadgeProps['tone']> = {
  pending:  'warning',
  used:     'success',
  expired:  'neutral',
  revoked:  'danger',
  active:   'success',
  disabled: 'neutral',
};

/**
 * Returns the Badge tone for a given status string.
 * Falls back to `'neutral'` for unknown values.
 */
export function statusTone(status: string): BadgeProps['tone'] {
  return STATUS_TONE[status as AdminStatus] ?? 'neutral';
}

/**
 * Returns a display label for a status string with the first letter capitalised.
 * e.g. 'pending' → 'Pending'
 */
export function statusLabel(status: string): string {
  if (!status) return '';
  return status.charAt(0).toUpperCase() + status.slice(1);
}
