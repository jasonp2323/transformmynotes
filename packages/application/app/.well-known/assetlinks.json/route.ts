/**
 * Digital Asset Links endpoint — Android Verified App Links.
 *
 * Android verifies App Links by fetching this document at startup and after
 * package updates. It must be served at exactly:
 *   https://<host>/.well-known/assetlinks.json
 * with Content-Type: application/json.
 *
 * The SHA-256 certificate fingerprint(s) in this document must match the
 * signing certificate(s) of the installed APK. The `ANDROID_SIGNING_FINGERPRINT`
 * value supports comma-separated values so both the Play App Signing certificate
 * (managed by Google) and the upload key fingerprint can be listed — Android
 * accepts the APK if ANY listed fingerprint matches.
 *
 * Ref: https://developer.android.com/training/app-links/verify-android-applinks
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const raw = process.env.ANDROID_SIGNING_FINGERPRINT;
  if (!raw) {
    throw new Error('ANDROID_SIGNING_FINGERPRINT is not set');
  }

  // Support comma-separated list for multiple signing keys (e.g. Play App
  // Signing cert + upload key). Trim whitespace and drop empty segments.
  const fingerprints = raw
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

  const doc = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.transformmynotes.app',
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return new NextResponse(JSON.stringify(doc), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
