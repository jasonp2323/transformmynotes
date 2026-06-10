import type { UserProfileItem } from '@transformmynotes/core';

/**
 * Filters a list of users by a search query, case-insensitively matching
 * against `name` and `email`. An empty or whitespace-only query returns
 * all users unchanged.
 */
export function filterMembers(
  users: UserProfileItem[],
  query: string,
): UserProfileItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  return users.filter(
    (u) =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
  );
}
