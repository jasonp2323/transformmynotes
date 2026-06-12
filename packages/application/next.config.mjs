/** @type {import('next').NextConfig} */

// Content-Security-Policy for the application package.
//
// IMPORTANT: This header is intentionally set as Content-Security-Policy-Report-Only
// (not enforcing). The spec mandates starting in report-only mode and monitoring
// the browser console / CSP violation reports on a pr-<N> deploy before switching
// to enforcing mode.
//
// Follow-up (CSP tuning / switch-to-enforcing phase — see M11.md Risks):
//   1. Monitor a pr-<N> deploy for CSP violation messages in the browser console.
//   2. Once confirmed clean, rename this header to Content-Security-Policy.
//   3. Replace 'unsafe-inline' in script-src with a per-request nonce. The nonce
//      approach (generated per request in a Server Component layout via
//      `crypto.randomUUID()` + `next/headers`) handles Next.js hydration inline
//      scripts without requiring 'unsafe-inline', satisfying ASVS V1.6.
//   4. Re-add 'upgrade-insecure-requests' — intentionally omitted here because
//      browsers ignore it in a report-only policy and emit a console warning,
//      which would surface during CSP monitoring. It belongs in the enforcing
//      policy only.
const applicationCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.cloudfront.net https://*.amazonaws.com",
  "frame-src https://challenges.cloudflare.com",
  "connect-src 'self' https://cognito-idp.us-east-1.amazonaws.com https://*.auth.us-east-1.amazoncognito.com https://challenges.cloudflare.com",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@transformmynotes/core'],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      ...(config.resolve.extensionAlias || {}),
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), microphone=()',
          },
          {
            // Report-only CSP — see comment at top of file.
            // Switch to Content-Security-Policy after monitoring a clean pr-<N> deploy.
            key: 'Content-Security-Policy-Report-Only',
            value: applicationCsp,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
