import { describe, it, expect } from 'vitest';
import {
  sortReleasesNewestFirst,
  formatReleaseDate,
  releaseTitle,
  filterPublishedReleases,
  findLatestMobileApkUrl,
  parseMobileTagRefs,
  findApkAssetUrl,
  type GitHubRelease,
} from './releases';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRelease(overrides: Partial<GitHubRelease> = {}): GitHubRelease {
  return {
    tag_name: 'v0.0.0',
    name: null,
    published_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    body: null,
    html_url: 'https://github.com/jasonp2323/transformmynotes/releases/tag/v0.0.0',
    draft: false,
    prerelease: false,
    assets: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// sortReleasesNewestFirst
// ---------------------------------------------------------------------------

describe('sortReleasesNewestFirst', () => {
  it('returns an empty array unchanged', () => {
    expect(sortReleasesNewestFirst([])).toEqual([]);
  });

  it('returns a single-element array unchanged', () => {
    const r = makeRelease({ tag_name: 'v1.0.0' });
    expect(sortReleasesNewestFirst([r])).toEqual([r]);
  });

  it('sorts out-of-order releases newest first by published_at', () => {
    const older = makeRelease({ tag_name: 'v1.0.0', published_at: '2025-01-01T00:00:00Z' });
    const newer = makeRelease({ tag_name: 'v2.0.0', published_at: '2026-06-01T00:00:00Z' });
    const middle = makeRelease({ tag_name: 'v1.5.0', published_at: '2025-07-01T00:00:00Z' });

    const result = sortReleasesNewestFirst([older, newer, middle]);
    expect(result[0].tag_name).toBe('v2.0.0');
    expect(result[1].tag_name).toBe('v1.5.0');
    expect(result[2].tag_name).toBe('v1.0.0');
  });

  it('falls back to created_at when published_at is null', () => {
    const withPublished = makeRelease({
      tag_name: 'v2.0.0',
      published_at: null,
      created_at: '2026-06-01T00:00:00Z',
    });
    const withOlderCreated = makeRelease({
      tag_name: 'v1.0.0',
      published_at: null,
      created_at: '2025-01-01T00:00:00Z',
    });

    const result = sortReleasesNewestFirst([withOlderCreated, withPublished]);
    expect(result[0].tag_name).toBe('v2.0.0');
    expect(result[1].tag_name).toBe('v1.0.0');
  });

  it('is stable — equal timestamps preserve original order', () => {
    const a = makeRelease({ tag_name: 'v1.0.0', published_at: '2026-01-01T00:00:00Z' });
    const b = makeRelease({ tag_name: 'v1.0.1', published_at: '2026-01-01T00:00:00Z' });

    const result = sortReleasesNewestFirst([a, b]);
    // Both have the same timestamp — original order is preserved (stable sort)
    expect(result[0].tag_name).toBe('v1.0.0');
    expect(result[1].tag_name).toBe('v1.0.1');
  });

  it('does not mutate the original array', () => {
    const releases = [
      makeRelease({ tag_name: 'v1.0.0', published_at: '2025-01-01T00:00:00Z' }),
      makeRelease({ tag_name: 'v2.0.0', published_at: '2026-01-01T00:00:00Z' }),
    ];
    const original = [...releases];
    sortReleasesNewestFirst(releases);
    expect(releases).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// formatReleaseDate
// ---------------------------------------------------------------------------

describe('formatReleaseDate', () => {
  it('formats a known date as "Month D, YYYY"', () => {
    expect(formatReleaseDate('2026-06-09T12:00:00Z')).toBe('June 9, 2026');
  });

  it('formats another known date correctly', () => {
    expect(formatReleaseDate('2025-12-31T00:00:00Z')).toBe('December 31, 2025');
  });

  it('returns "" for an empty string', () => {
    expect(formatReleaseDate('')).toBe('');
  });

  it('returns "" for a whitespace-only string', () => {
    expect(formatReleaseDate('   ')).toBe('');
  });

  it('returns "" for an invalid date string', () => {
    expect(formatReleaseDate('not-a-date')).toBe('');
  });

  it('uses UTC timezone — a UTC midnight date stays on the correct calendar day', () => {
    // 2026-01-01T00:00:00Z is Jan 1 in UTC, not Dec 31 of previous year
    expect(formatReleaseDate('2026-01-01T00:00:00Z')).toBe('January 1, 2026');
  });
});

// ---------------------------------------------------------------------------
// releaseTitle
// ---------------------------------------------------------------------------

describe('releaseTitle', () => {
  it('prefers name over tag_name when name is set', () => {
    const r = makeRelease({ name: 'Version 2.0 — Dark Mode', tag_name: 'v2.0.0' });
    expect(releaseTitle(r)).toBe('Version 2.0 — Dark Mode');
  });

  it('falls back to tag_name when name is null', () => {
    const r = makeRelease({ name: null, tag_name: 'v1.2.3' });
    expect(releaseTitle(r)).toBe('v1.2.3');
  });

  it('falls back to tag_name when name is an empty string', () => {
    const r = makeRelease({ name: '', tag_name: 'v1.2.3' });
    expect(releaseTitle(r)).toBe('v1.2.3');
  });

  it('falls back to tag_name when name is whitespace-only', () => {
    const r = makeRelease({ name: '   ', tag_name: 'v1.2.3' });
    expect(releaseTitle(r)).toBe('v1.2.3');
  });
});

// ---------------------------------------------------------------------------
// filterPublishedReleases
// ---------------------------------------------------------------------------

describe('filterPublishedReleases', () => {
  it('removes draft releases', () => {
    const published = makeRelease({ tag_name: 'v1.0.0', draft: false });
    const draft = makeRelease({ tag_name: 'v1.1.0-draft', draft: true });

    const result = filterPublishedReleases([published, draft]);
    expect(result).toHaveLength(1);
    expect(result[0].tag_name).toBe('v1.0.0');
  });

  it('keeps prerelease releases (only drafts are filtered)', () => {
    const prerelease = makeRelease({ tag_name: 'v1.0.0-rc.1', draft: false, prerelease: true });
    const result = filterPublishedReleases([prerelease]);
    expect(result).toHaveLength(1);
  });

  it('returns empty array when all releases are drafts', () => {
    const drafts = [
      makeRelease({ tag_name: 'v1.0.0', draft: true }),
      makeRelease({ tag_name: 'v2.0.0', draft: true }),
    ];
    expect(filterPublishedReleases(drafts)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(filterPublishedReleases([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findLatestMobileApkUrl
// ---------------------------------------------------------------------------

describe('findLatestMobileApkUrl', () => {
  it('returns the APK URL from the newest mobile-v* release', () => {
    const older = makeRelease({
      tag_name: 'mobile-v1.0.0',
      published_at: '2026-01-01T00:00:00Z',
      assets: [{ name: 'app-release.apk', browser_download_url: 'https://example.com/old.apk' }],
    });
    const newer = makeRelease({
      tag_name: 'mobile-v2.0.0',
      published_at: '2026-06-01T00:00:00Z',
      assets: [{ name: 'app-release.apk', browser_download_url: 'https://example.com/new.apk' }],
    });
    expect(findLatestMobileApkUrl([older, newer])).toBe('https://example.com/new.apk');
  });

  it('ignores non-mobile-v releases even if newer', () => {
    const webRelease = makeRelease({
      tag_name: 'v3.0.0',
      published_at: '2026-07-01T00:00:00Z',
      assets: [{ name: 'app-release.apk', browser_download_url: 'https://example.com/web.apk' }],
    });
    const mobileRelease = makeRelease({
      tag_name: 'mobile-v1.0.0',
      published_at: '2026-01-01T00:00:00Z',
      assets: [{ name: 'app-release.apk', browser_download_url: 'https://example.com/mobile.apk' }],
    });
    expect(findLatestMobileApkUrl([webRelease, mobileRelease])).toBe('https://example.com/mobile.apk');
  });

  it('returns null when there are no mobile-v releases', () => {
    const webRelease = makeRelease({ tag_name: 'v1.0.0' });
    expect(findLatestMobileApkUrl([webRelease])).toBeNull();
  });

  it('returns null when the mobile release has no app-release.apk asset', () => {
    const mobileRelease = makeRelease({
      tag_name: 'mobile-v1.0.0',
      assets: [{ name: 'some-other-file.zip', browser_download_url: 'https://example.com/other.zip' }],
    });
    expect(findLatestMobileApkUrl([mobileRelease])).toBeNull();
  });

  it('returns null when the mobile release has empty assets', () => {
    const mobileRelease = makeRelease({
      tag_name: 'mobile-v1.0.0',
      assets: [],
    });
    expect(findLatestMobileApkUrl([mobileRelease])).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(findLatestMobileApkUrl([])).toBeNull();
  });

  it('returns null when assets is undefined on the release (defensive)', () => {
    const mobileRelease = makeRelease({ tag_name: 'mobile-v1.0.0' });
    delete (mobileRelease as unknown as Record<string, unknown>).assets;
    expect(findLatestMobileApkUrl([mobileRelease])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseMobileTagRefs
// ---------------------------------------------------------------------------

describe('parseMobileTagRefs', () => {
  it('returns [] for an empty array', () => {
    expect(parseMobileTagRefs([])).toEqual([]);
  });

  it('strips the refs/tags/ prefix', () => {
    expect(parseMobileTagRefs([{ ref: 'refs/tags/mobile-v1.0.0' }])).toEqual(['mobile-v1.0.0']);
  });

  it('sorts newest-first by numeric patch — double digit beats single digit', () => {
    const refs = [
      { ref: 'refs/tags/mobile-v1.0.9' },
      { ref: 'refs/tags/mobile-v1.0.10' },
      { ref: 'refs/tags/mobile-v1.0.2' },
    ];
    expect(parseMobileTagRefs(refs)).toEqual(['mobile-v1.0.10', 'mobile-v1.0.9', 'mobile-v1.0.2']);
  });

  it('sorts newest-first by numeric minor — double digit beats single digit', () => {
    const refs = [
      { ref: 'refs/tags/mobile-v1.9.0' },
      { ref: 'refs/tags/mobile-v1.10.0' },
      { ref: 'refs/tags/mobile-v1.2.0' },
    ];
    expect(parseMobileTagRefs(refs)).toEqual(['mobile-v1.10.0', 'mobile-v1.9.0', 'mobile-v1.2.0']);
  });

  it('sorts newest-first by major version', () => {
    const refs = [
      { ref: 'refs/tags/mobile-v1.0.0' },
      { ref: 'refs/tags/mobile-v2.0.0' },
    ];
    expect(parseMobileTagRefs(refs)).toEqual(['mobile-v2.0.0', 'mobile-v1.0.0']);
  });

  it('filters out refs that do not match the mobile-v prefix', () => {
    const refs = [
      { ref: 'refs/tags/v1.0.0' },
      { ref: 'refs/tags/transformmynotes-v1.0.0' },
      { ref: 'refs/tags/mobile-v1.0.0' },
    ];
    expect(parseMobileTagRefs(refs)).toEqual(['mobile-v1.0.0']);
  });

  it('filters out malformed mobile-v refs', () => {
    const refs = [
      { ref: 'refs/tags/mobile-v1.0' },
      { ref: 'refs/tags/mobile-vabc' },
      { ref: 'refs/tags/mobile-v1.0.0-rc1' },
      { ref: 'refs/tags/mobile-v1.0.0' },
    ];
    expect(parseMobileTagRefs(refs)).toEqual(['mobile-v1.0.0']);
  });

  it('handles a missing/non-array input by returning []', () => {
    expect(parseMobileTagRefs(undefined as unknown as { ref: string }[])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findApkAssetUrl
// ---------------------------------------------------------------------------

describe('findApkAssetUrl', () => {
  it('returns null for a null release', () => {
    expect(findApkAssetUrl(null)).toBeNull();
  });

  it('returns null for a draft release', () => {
    const release = makeRelease({
      draft: true,
      assets: [{ name: 'app-release.apk', browser_download_url: 'https://example.com/a.apk' }],
    });
    expect(findApkAssetUrl(release)).toBeNull();
  });

  it('returns null for empty assets', () => {
    const release = makeRelease({ assets: [] });
    expect(findApkAssetUrl(release)).toBeNull();
  });

  it('returns null when assets is missing (defensive)', () => {
    const release = makeRelease();
    delete (release as unknown as Record<string, unknown>).assets;
    expect(findApkAssetUrl(release)).toBeNull();
  });

  it('returns null when only non-APK assets are present', () => {
    const release = makeRelease({
      assets: [{ name: 'source.zip', browser_download_url: 'https://example.com/source.zip' }],
    });
    expect(findApkAssetUrl(release)).toBeNull();
  });

  it('prefers an exact app-release.apk match over another .apk asset', () => {
    const release = makeRelease({
      assets: [
        { name: 'debug.apk', browser_download_url: 'https://example.com/debug.apk' },
        { name: 'app-release.apk', browser_download_url: 'https://example.com/release.apk' },
      ],
    });
    expect(findApkAssetUrl(release)).toBe('https://example.com/release.apk');
  });

  it('falls back to the first .apk asset case-insensitively when no exact match exists', () => {
    const release = makeRelease({
      assets: [
        { name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt' },
        { name: 'App-Release-Debug.APK', browser_download_url: 'https://example.com/debug.APK' },
      ],
    });
    expect(findApkAssetUrl(release)).toBe('https://example.com/debug.APK');
  });
});
