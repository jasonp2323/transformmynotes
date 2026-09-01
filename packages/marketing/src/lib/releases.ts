/**
 * releases.ts — GitHub Releases helpers for the public changelog page and
 * the /download/android redirect route.
 *
 * Structure:
 *   - GitHubRelease type
 *   - Pure helpers (unit-testable, no network): sortReleasesNewestFirst,
 *     formatReleaseDate, releaseTitle, filterPublishedReleases,
 *     findLatestMobileApkUrl, parseMobileTagRefs, findApkAssetUrl
 *   - Impure: fetchReleases, fetchMobileTags, fetchReleaseByTag,
 *     fetchLatestMobileApkUrl (network, ISR cache — not unit-tested)
 *
 * Build-safety contract:
 *   fetchReleases(), fetchMobileTags(), fetchReleaseByTag(), and
 *   fetchLatestMobileApkUrl() all NEVER throw — each returns an empty/null
 *   value on any error so pages render cleanly and the build succeeds even
 *   if api.github.com is unreachable.
 *
 * Why the tag-driven path exists (see /download/android):
 *   fetchReleases() only fetches page 1 of the releases list (100 items).
 *   Once the repo has >100 releases, an older `mobile-v*` release can fall
 *   off page 1 entirely, and findLatestMobileApkUrl() silently returns null.
 *   fetchLatestMobileApkUrl() instead resolves via GitHub's prefix-filtered
 *   matching-refs endpoint (cheap, no pagination) and fetches the specific
 *   release by tag — immune to total release count.
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

const MOBILE_TAG_REF_RE = /^refs\/tags\/(mobile-v(\d+)\.(\d+)\.(\d+))$/;

/**
 * Parse the raw payload from GitHub's `git/matching-refs/tags/mobile-v`
 * endpoint into tag names, sorted newest-first by numeric semver.
 *
 * - Keeps only refs of the exact form `refs/tags/mobile-v<major>.<minor>.<patch>`;
 *   malformed or non-matching refs are ignored.
 * - Sorts numerically (not lexicographically) so `mobile-v1.0.10` sorts
 *   above `mobile-v1.0.9`.
 * - Pure and network-free — safe to unit-test.
 */
export function parseMobileTagRefs(refs: { ref: string }[]): string[] {
  if (!Array.isArray(refs)) return [];

  const parsed = refs
    .map((r) => MOBILE_TAG_REF_RE.exec(r?.ref ?? ''))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({
      tag: m[1],
      major: Number(m[2]),
      minor: Number(m[3]),
      patch: Number(m[4]),
    }));

  parsed.sort((a, b) => {
    if (a.major !== b.major) return b.major - a.major;
    if (a.minor !== b.minor) return b.minor - a.minor;
    return b.patch - a.patch;
  });

  return parsed.map((p) => p.tag);
}

/**
 * Find the direct download URL for a release's APK asset.
 *
 * - Prefers an asset named exactly "app-release.apk".
 * - Otherwise falls back to the first asset whose name ends with ".apk"
 *   (case-insensitive).
 * - Returns null for a null release, a draft release, or one with
 *   missing/empty assets.
 * - Pure and network-free — safe to unit-test.
 */
export function findApkAssetUrl(release: GitHubRelease | null): string | null {
  if (!release || release.draft) return null;

  const assets = release.assets ?? [];
  if (assets.length === 0) return null;

  const exact = assets.find((a) => a.name === 'app-release.apk');
  if (exact) return exact.browser_download_url;

  const anyApk = assets.find((a) => a.name.toLowerCase().endsWith('.apk'));
  return anyApk?.browser_download_url ?? null;
}

// ---------------------------------------------------------------------------
// Impure: network fetch (not unit-tested)
// ---------------------------------------------------------------------------

const RELEASES_URL =
  'https://api.github.com/repos/jasonp2323/transformmynotes/releases?per_page=100';
const MATCHING_MOBILE_TAGS_URL =
  'https://api.github.com/repos/jasonp2323/transformmynotes/git/matching-refs/tags/mobile-v';
const RELEASE_BY_TAG_URL = (tag: string) =>
  `https://api.github.com/repos/jasonp2323/transformmynotes/releases/tags/${encodeURIComponent(tag)}`;

/** Shared GitHub API request options (headers + ISR revalidation window). */
function githubRequestInit(): RequestInit {
  return {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'transformmynotes-marketing',
    },
    next: { revalidate: 3600 },
  };
}

/**
 * Fetch GitHub releases at build time (ISR hourly revalidation).
 * - Filters out drafts.
 * - Sorts newest-first.
 * - Returns [] on any error or non-ok response — build MUST NOT fail.
 */
export async function fetchReleases(): Promise<GitHubRelease[]> {
  try {
    const res = await fetch(RELEASES_URL, githubRequestInit());

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

/**
 * Fetch every `mobile-v*` tag ref via GitHub's prefix-filtered
 * matching-refs endpoint (cheap, no pagination — unlike the releases list).
 * Returns tag names newest-first by numeric semver.
 * NEVER throws — returns [] on any error or non-ok/non-array response.
 */
export async function fetchMobileTags(): Promise<string[]> {
  try {
    const res = await fetch(MATCHING_MOBILE_TAGS_URL, githubRequestInit());

    if (!res.ok) {
      return [];
    }

    const data: unknown = await res.json();

    if (!Array.isArray(data)) {
      return [];
    }

    return parseMobileTagRefs(data as { ref: string }[]);
  } catch {
    return [];
  }
}

/**
 * Fetch a single release by its exact tag name.
 * NEVER throws — returns null on any error or non-ok response.
 */
export async function fetchReleaseByTag(tag: string): Promise<GitHubRelease | null> {
  try {
    const res = await fetch(RELEASE_BY_TAG_URL(tag), githubRequestInit());

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as GitHubRelease;
  } catch {
    return null;
  }
}

/** Cap on how many newest mobile-v* tags fetchLatestMobileApkUrl will walk. */
const MAX_MOBILE_TAGS_TO_CHECK = 3;

/**
 * Resolve the direct download URL for the latest Android APK by walking
 * `mobile-v*` tags newest-first (immune to release-list pagination — see
 * the module doc comment above).
 *
 * Walks at most the 3 newest tags: a tag whose release is a draft, or whose
 * APK build failed to attach an asset, degrades to the previous good
 * version instead of dead-ending.
 *
 * NEVER throws — returns null if no qualifying release/asset is found.
 */
export async function fetchLatestMobileApkUrl(): Promise<string | null> {
  const tags = await fetchMobileTags();

  for (const tag of tags.slice(0, MAX_MOBILE_TAGS_TO_CHECK)) {
    const release = await fetchReleaseByTag(tag);
    const url = findApkAssetUrl(release);
    if (url) return url;
  }

  return null;
}
