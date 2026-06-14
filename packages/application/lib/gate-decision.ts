import type { UserStatus } from '@transformmynotes/core';

export type GateDecision = 'allow' | 'provision' | 'blocked';

/**
 * Pure gate decision based on the user's stored profile status.
 *
 * The Cognito pool is invite/admin-only, so any user who can authenticate was
 * deliberately created by an admin ⇒ grant access. A profile that is missing or
 * still 'pending' is provisioned/activated on the fly; an explicitly 'disabled'
 * profile is blocked (though Cognito also blocks disabled users at sign-in).
 *
 * - 'allow'     → profile is active; let the user through.
 * - 'provision' → profile missing or 'pending'; self-provision an active profile.
 * - 'blocked'   → profile explicitly 'disabled'.
 */
export function gateDecision(profileStatus: UserStatus | null): GateDecision {
  if (profileStatus === 'active') return 'allow';
  if (profileStatus === 'disabled') return 'blocked';
  return 'provision';
}
