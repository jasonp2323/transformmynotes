/** Verified-JWT claims (shape we care about). */
export type Claims = Record<string, unknown>;

/** Cognito puts group membership in the `cognito:groups` claim (string[] or absent). */
export function extractGroups(claims: Claims): string[] {
  const g = claims['cognito:groups'];
  return Array.isArray(g) ? g.filter((x): x is string => typeof x === 'string') : [];
}

/** True iff the verified claims include the `admin` Cognito group. */
export function isAdmin(claims: Claims): boolean {
  return extractGroups(claims).includes('admin');
}

/** True iff the path is under the admin area (/admin or /admin/...). */
export function isAdminRoute(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}
