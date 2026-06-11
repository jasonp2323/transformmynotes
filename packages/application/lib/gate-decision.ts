import type { UserStatus } from '@transformmynotes/core';

export type GateDecision = 'allow' | 'provision-admin' | 'pending';

/**
 * Pure function: given a profile status (or null for no profile) and whether the
 * user holds the admin Cognito group, returns the gate action to take.
 *
 * - 'allow'           → profile is active; let the user through.
 * - 'provision-admin' → user is an admin with no active profile; self-provision one.
 * - 'pending'         → non-admin user with a missing or non-active profile; redirect.
 */
export function gateDecision(
  profileStatus: UserStatus | null,
  isAdminUser: boolean,
): GateDecision {
  if (profileStatus === 'active') return 'allow';
  if (isAdminUser) return 'provision-admin';
  return 'pending';
}
