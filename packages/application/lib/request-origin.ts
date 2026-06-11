/**
 * Pure helper — derives the app origin from request headers.
 *
 * Uses `x-forwarded-proto` (defaults to 'https') and `host` (or
 * `x-forwarded-host`) to build `${proto}://${host}`. Falls back to
 * `fallback` when no host header is present.
 */
export function originFromHeaders(headers: Headers, fallback: string): string {
  const proto = headers.get('x-forwarded-proto') ?? 'https';
  const host = headers.get('host') ?? headers.get('x-forwarded-host');
  if (!host) return fallback;
  return `${proto}://${host}`;
}
