/** @type {import('next').NextConfig} */

// Content-Security-Policy for the marketing package.
//
// IMPORTANT: This header is intentionally set as Content-Security-Policy-Report-Only
// (not enforcing). The spec mandates starting in report-only mode and monitoring
// the browser console / CSP violation reports on a pr-<N> deploy before switching
// to enforcing mode.
//
// Follow-up (CSP tuning / switch-to-enforcing phase — see M11.md Risks):
//   1. Monitor a pr-<N> deploy for CSP violation messages in the browser console.
//   2. Once confirmed clean, rename this header to Content-Security-Policy.
//   3. Replace 'unsafe-inline' in script-src with a per-request nonce if needed.
//
// Note on fonts: all fonts are self-hosted under public/fonts/ (@font-face rules in
// src/styles/fonts.css), so font-src 'self' is sufficient — no Google Fonts CDN.
const marketingCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

const nextConfig = {
  reactStrictMode: true,
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
            value: marketingCsp,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
