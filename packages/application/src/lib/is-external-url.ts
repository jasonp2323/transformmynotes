/**
 * Returns true if the given href is an http(s) URL whose host is NOT
 * `allowedHost` or any subdomain of it. Relative hrefs (starting with `/`,
 * `#`, or carrying no scheme) and non-http(s) schemes always return false so
 * they fall through to the default browser behaviour.
 */
export function isExternalUrl(
  href: string,
  allowedHost = 'transformmynotes.com',
): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    // Relative or unparseable href — not external.
    return false;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return false;
  }

  const host = url.hostname.toLowerCase();
  const allowed = allowedHost.toLowerCase();

  // Exact match or subdomain (e.g. app.transformmynotes.com).
  return host !== allowed && !host.endsWith(`.${allowed}`);
}
