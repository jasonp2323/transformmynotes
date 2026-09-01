import { NextResponse } from 'next/server';
import {
  fetchLatestMobileApkUrl,
  fetchReleases,
  findLatestMobileApkUrl,
} from '../../../src/lib/releases';

export const revalidate = 3600;

const FALLBACK_URL = 'https://github.com/jasonp2323/transformmynotes/releases';

export async function GET() {
  try {
    // Primary: tag-driven resolution, immune to releases-list pagination
    // (the repo has 200+ releases, so the plain releases list only covers
    // page 1 and can miss an older mobile-v* release entirely).
    const tagDrivenUrl = await fetchLatestMobileApkUrl();
    if (tagDrivenUrl) {
      return NextResponse.redirect(tagDrivenUrl, { status: 302 });
    }

    // Fallback: the old page-1 releases-list path, still correct whenever
    // a mobile release happens to be on page 1 — cheap belt-and-braces.
    const releases = await fetchReleases();
    const listUrl = findLatestMobileApkUrl(releases);
    return NextResponse.redirect(listUrl ?? FALLBACK_URL, { status: 302 });
  } catch {
    return NextResponse.redirect(FALLBACK_URL, { status: 302 });
  }
}
