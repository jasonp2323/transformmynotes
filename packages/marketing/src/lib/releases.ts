/**
 * releases.ts — GitHub Releases helpers for the public changelog page.
 *
 * Structure:
 *   - GitHubRelease type
 *   - Pure helpers (unit-testable, no network): sortReleasesNewestFirst,
 *     formatReleaseDate, releaseTitle, filterPublishedReleases
 *   - Impure: fetchReleases (network, ISR cache — not unit-tested)
 *
 * Build-safety contract:
 *   fetchReleases() NEVER throws — it returns [] on any error so the changelog
 *   page's empty state renders cleanly and the build succeeds even if
 *   api.github.com is unreachable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface GitHubRelease {
  tag_name: string;
  name: string | null;
  published_at: string | null;
  created_at: string;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: GitHubReleaseAsset[];
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Sort releases newest-first by published_at, falling back to created_at.
 * Stable: equal timestamps preserve original order.
 */
export function sortReleasesNewestFirst(releases: GitHubRelease[]): GitHubRelease[] {
  return [...releases].sort((a, b) => {
    const aTime = new Date(a.published_at ?? a.created_at).getTime();
    const bTime = new Date(b.published_at ?? b.created_at).getTime();
    // Stable: if equal, preserve relative order (sort returns 0)
    return bTime - aTime;
  });
}

/**
 * Format an ISO-8601 date string as "Month D, YYYY" (e.g. "June 9, 2026").
 * Uses UTC timezone for determinism across server/client environments.
 * Returns "" for empty or invalid input.
 */
export function formatReleaseDate(iso: string): string {
  if (!iso || iso.trim() === '') return '';
  const ms = Date.parse(iso);
  if (isNaN(ms)) return '';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(ms));
}

/**
 * Return the display title for a release: prefers name, falls back to tag_name.
 */
export function releaseTitle(release: GitHubRelease): string {
  return (release.name && release.name.trim()) ? release.name.trim() : release.tag_name;
}

/**
 * Filter out draft releases — pure, safe to unit-test.
 */
export function filterPublishedReleases(releases: GitHubRelease[]): GitHubRelease[] {
  return releases.filter((r) => !r.draft);
}

/**
 * Find the direct download URL for the APK in the newest `mobile-v*` release.
 * Pure and network-free — safe to unit-test.
 *
 * - Filters to non-draft releases whose tag_name starts with "mobile-v".
 * - Sorts newest-first.
 * - On the newest match, looks for an asset named "app-release.apk".
 * - Returns null when no qualifying release or asset is found.
 */
export function findLatestMobileApkUrl(releases: GitHubRelease[]): string | null {
  const mobileReleases = releases.filter(
    (r) => !r.draft && r.tag_name.startsWith('mobile-v'),
  );
  if (mobileReleases.length === 0) return null;

  const sorted = sortReleasesNewestFirst(mobileReleases);
  const newest = sorted[0];

  const apk = (newest.assets ?? []).find((a) => a.name === 'app-release.apk');
  return apk?.browser_download_url ?? null;
}

// ---------------------------------------------------------------------------
// Impure: network fetch (not unit-tested)
// ---------------------------------------------------------------------------

const RELEASES_URL =
  'https://api.github.com/repos/jasonp2323/transformmynotes/releases?per_page=100';

/**
 * Fetch GitHub releases at build time (ISR hourly revalidation).
 * - Filters out drafts.
 * - Sorts newest-first.
 * - Returns [] on any error or non-ok response — build MUST NOT fail.
 */
export async function fetchReleases(): Promise<GitHubRelease[]> {
  try {
    const res = await fetch(RELEASES_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'transformmynotes-marketing',
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return [];
    }

    const data: unknown = await res.json();

    if (!Array.isArray(data)) {
      return [];
    }

    const releases = data as GitHubRelease[];
    return sortReleasesNewestFirst(filterPublishedReleases(releases));
  } catch {
    // Network failure, parse error, etc. — degrade gracefully.
    return [];
  }
}
