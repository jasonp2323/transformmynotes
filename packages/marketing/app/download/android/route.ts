import { NextResponse } from 'next/server';
import { fetchReleases, findLatestMobileApkUrl } from '../../../src/lib/releases';

export const revalidate = 3600;

const FALLBACK_URL = 'https://github.com/jasonp2323/transformmynotes/releases';

export async function GET() {
  try {
    const releases = await fetchReleases();
    const url = findLatestMobileApkUrl(releases);
    return NextResponse.redirect(url ?? FALLBACK_URL, { status: 302 });
  } catch {
    return NextResponse.redirect(FALLBACK_URL, { status: 302 });
  }
}
