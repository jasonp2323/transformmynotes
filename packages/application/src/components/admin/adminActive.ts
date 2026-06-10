/**
 * Derives the active sidebar nav item id from the current pathname.
 * Pure function — no React import.
 */
export function adminActiveFromPath(
  pathname: string,
): 'pending' | 'members' | 'invites' | undefined {
  if (pathname.startsWith('/admin/pending')) return 'pending';
  if (pathname.startsWith('/admin/members') || pathname.startsWith('/admin/users')) return 'members';
  if (pathname.startsWith('/admin/invites')) return 'invites';
  return undefined;
}
