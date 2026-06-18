/**
 * safe-fetch.ts — SSRF-hardened server-side HTTP fetch utility.
 *
 * NOTE ON LAMBDA EGRESS:
 * The `from-url` route runs inside a Next.js Lambda provisioned by SST. By default the
 * Lambda has no VPC attachment and egresses to the public internet — not through a NAT
 * that could reach internal VPC services. Nevertheless, assertUrlSafe's IP blocklist is
 * still required: the EC2 Instance Metadata Service (IMDS) endpoint 169.254.169.254 is
 * reachable from any AWS compute regardless of VPC attachment, and an SSRF to that address
 * would leak the Lambda execution-role's temporary credentials.
 *
 * VPC-ATTACHMENT CAVEAT:
 * If the app is ever moved into a VPC, add a security-group egress rule that explicitly
 * blocks traffic to RFC-1918 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) as an
 * additional defense-in-depth measure — the software IP blocklist in this file alone is
 * not sufficient to protect internal VPC services from a server-side request forgery.
 */

import * as dns from 'node:dns/promises';
import * as net from 'node:net';
import * as http from 'node:http';
import * as https from 'node:https';
import * as tls from 'node:tls';
import { URL } from 'node:url';
import ipRangeCheck from 'ip-range-check';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UrlBlockReason =
  | 'disallowed-scheme'
  | 'private-ip'
  | 'loopback-ip'
  | 'link-local-ip'
  | 'ipv6-loopback'
  | 'ipv6-ula'
  | 'ipv6-link-local'
  | 'metadata-hostname'
  | 'localhost-hostname'
  | 'dns-resolution-failure'
  | 'redirect-limit-exceeded'
  | 'redirect-to-blocked-ip'
  | 'response-too-large'
  | 'disallowed-content-type'
  | 'timeout'
  | 'unspecified-ip'
  | 'invalid-url';

export class UrlSafetyError extends Error {
  constructor(
    public readonly reason: UrlBlockReason,
    message: string,
  ) {
    super(message);
    this.name = 'UrlSafetyError';
  }
}

export interface SafeFetchOptions {
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Internal: blocked IP ranges
// ---------------------------------------------------------------------------

/** Check whether an IP address falls in a blocked range. Returns the block reason or null. */
export function checkBlockedIp(ip: string): UrlBlockReason | null {
  // Normalise IPv6 brackets (WHATWG URL wraps IPv6 in brackets; strip them)
  const stripped = ip.startsWith('[') && ip.endsWith(']') ? ip.slice(1, -1) : ip;

  // Handle IPv4-mapped IPv6 (e.g. ::ffff:169.254.169.254 → extract the IPv4 part)
  const mappedV4 = extractMappedIPv4(stripped);
  if (mappedV4 !== null) {
    return checkBlockedIp(mappedV4);
  }

  // Unspecified addresses
  if (stripped === '0.0.0.0' || stripped === '::') {
    return 'unspecified-ip';
  }

  // IPv4 checks
  if (net.isIPv4(stripped)) {
    if (ipRangeCheck(stripped, '127.0.0.0/8')) return 'loopback-ip';
    if (ipRangeCheck(stripped, ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'])) return 'private-ip';
    if (ipRangeCheck(stripped, '169.254.0.0/16')) return 'link-local-ip';
    if (ipRangeCheck(stripped, '0.0.0.0/8')) return 'unspecified-ip';
    return null;
  }

  // IPv6 checks
  if (net.isIPv6(stripped)) {
    if (stripped === '::1' || ipRangeCheck(stripped, '::1/128')) return 'ipv6-loopback';
    if (ipRangeCheck(stripped, 'fe80::/10')) return 'ipv6-link-local';
    if (ipRangeCheck(stripped, 'fc00::/7')) return 'ipv6-ula';
    return null;
  }

  return null;
}

/**
 * If the given string is an IPv4-mapped IPv6 address (::ffff:x.x.x.x or ::ffff:hex:hex),
 * return the embedded IPv4 string. Otherwise return null.
 */
function extractMappedIPv4(ip: string): string | null {
  // Full textual form: ::ffff:d.d.d.d
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(ip);
  if (dotted) return dotted[1];

  // Hex form: ::ffff:HHHH:HHHH
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// assertUrlSafe
// ---------------------------------------------------------------------------

/**
 * Validates a URL for safety before a server-side fetch.
 *
 * Throws `UrlSafetyError` for any blocked condition (scheme, hostname, IP range, DNS).
 * Returns `{ resolvedIp }` — the first validated public IP — which callers MUST use to
 * pin the TCP connection (DNS-rebinding mitigation).
 */
export async function assertUrlSafe(url: string): Promise<{ resolvedIp: string }> {
  // 1. Parse
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UrlSafetyError('invalid-url', `Invalid URL: ${url}`);
  }

  // 2. Scheme
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UrlSafetyError(
      'disallowed-scheme',
      `Disallowed URL scheme: ${parsed.protocol}`,
    );
  }

  // 3. Hostname string checks (before DNS)
  const hostname = parsed.hostname.replace(/\.$/, '').toLowerCase();

  if (hostname === 'localhost') {
    throw new UrlSafetyError('localhost-hostname', 'Hostname "localhost" is not allowed');
  }

  const metadataHostnames = ['metadata.google.internal'];
  if (metadataHostnames.includes(hostname)) {
    throw new UrlSafetyError(
      'metadata-hostname',
      `Metadata hostname blocked: ${hostname}`,
    );
  }

  // 4. If hostname is an IP literal, validate directly (no DNS)
  // WHATWG URL wraps IPv6 in brackets; net.isIP needs them stripped
  const hostForIpCheck = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  if (net.isIP(hostForIpCheck) !== 0) {
    const reason = checkBlockedIp(hostForIpCheck);
    if (reason) {
      throw new UrlSafetyError(reason, `Blocked IP address: ${hostForIpCheck}`);
    }
    return { resolvedIp: hostForIpCheck };
  }

  // 5. DNS resolution
  let resolvedIps: string[] = [];
  try {
    const v4 = await dns.resolve4(hostname);
    if (v4 && v4.length > 0) resolvedIps = v4;
  } catch {
    // fall through to try IPv6
  }

  if (resolvedIps.length === 0) {
    try {
      const v6 = await dns.resolve6(hostname);
      if (v6 && v6.length > 0) resolvedIps = v6;
    } catch {
      // fall through
    }
  }

  if (resolvedIps.length === 0) {
    throw new UrlSafetyError('dns-resolution-failure', `DNS resolution failed for: ${hostname}`);
  }

  // 6. Check each resolved IP
  for (const ip of resolvedIps) {
    const reason = checkBlockedIp(ip);
    if (reason) {
      throw new UrlSafetyError(reason, `Resolved IP ${ip} is blocked: ${reason}`);
    }
  }

  // 7. Return the first validated IP
  return { resolvedIp: resolvedIps[0] };
}

// ---------------------------------------------------------------------------
// safeFetch
// ---------------------------------------------------------------------------

/**
 * Fetch a URL safely, with SSRF protection and resource limits.
 *
 * - Calls `assertUrlSafe` to validate the URL before connecting.
 * - Pins the TCP connection to the pre-resolved IP (DNS-rebinding mitigation).
 * - Validates each 3xx redirect target via `assertUrlSafe` before following.
 * - Enforces a redirect cap (default 3), a body size cap (default 5 MB), and a
 *   timeout (default 20 seconds via AbortSignal.timeout).
 * - Accepts only `text/html` and `text/plain` Content-Type responses.
 *
 * Throws `UrlSafetyError` for any blocked condition; throws other errors for
 * unexpected network/parse failures.
 */
export async function safeFetch(
  url: string,
  opts?: SafeFetchOptions,
): Promise<{ body: string; contentType: string }> {
  const maxRedirects = opts?.maxRedirects ?? 3;
  const maxBytes = opts?.maxBytes ?? 5_242_880;
  const timeoutMs = opts?.timeoutMs ?? 20_000;

  return fetchInner(url, maxRedirects, maxBytes, timeoutMs);
}

async function fetchInner(
  url: string,
  redirectsLeft: number,
  maxBytes: number,
  timeoutMs: number,
): Promise<{ body: string; contentType: string }> {
  const { resolvedIp } = await assertUrlSafe(url);
  const parsed = new URL(url);
  const hostname = parsed.hostname.replace(/\.$/, '');
  const isHttps = parsed.protocol === 'https:';

  return new Promise((resolve, reject) => {
    const signal = AbortSignal.timeout(timeoutMs);

    // Build a custom agent that pins the connection to resolvedIp
    // while preserving the Host header and TLS SNI.
    let agent: http.Agent | https.Agent;
    if (isHttps) {
      agent = new https.Agent({
        // Override createConnection to pin the IP
      });
      (agent as unknown as { createConnection: (options: tls.ConnectionOptions, callback: () => void) => tls.TLSSocket }).createConnection = (options: tls.ConnectionOptions, callback: () => void) => {
        return tls.connect({
          ...options,
          host: resolvedIp,
          servername: hostname,
        }, callback);
      };
    } else {
      agent = new http.Agent({});
      (agent as unknown as { createConnection: (options: net.TcpNetConnectOpts, callback: () => void) => net.Socket }).createConnection = (options: net.TcpNetConnectOpts, callback: () => void) => {
        return net.createConnection({
          ...options,
          host: resolvedIp,
        }, callback);
      };
    }

    const reqOptions: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        Host: parsed.host,
        'User-Agent': 'TransformMyNotes/1.0 (safe-fetch)',
      },
      agent,
    };

    const onAbort = () => {
      req.destroy();
      reject(new UrlSafetyError('timeout', `Request timed out after ${timeoutMs}ms: ${url}`));
    };

    signal.addEventListener('abort', onAbort, { once: true });

    const lib = isHttps ? https : http;
    const req = lib.request(reqOptions, (res) => {
      signal.removeEventListener('abort', onAbort);

      const statusCode = res.statusCode ?? 0;

      // Handle redirects
      if (statusCode >= 300 && statusCode < 400) {
        res.resume(); // drain response
        const location = res.headers['location'];
        if (!location) {
          reject(new Error(`Redirect with no Location header from: ${url}`));
          return;
        }

        if (redirectsLeft <= 0) {
          reject(new UrlSafetyError('redirect-limit-exceeded', 'Too many redirects'));
          return;
        }

        // Resolve relative redirects
        let nextUrl: string;
        try {
          nextUrl = new URL(location, url).href;
        } catch {
          reject(new Error(`Invalid redirect Location: ${location}`));
          return;
        }

        // Validate redirect target — catch blocked redirect
        fetchInner(nextUrl, redirectsLeft - 1, maxBytes, timeoutMs)
          .then(resolve)
          .catch((err: unknown) => {
            // Wrap UrlSafetyError from redirect target as redirect-to-blocked-ip
            if (err instanceof UrlSafetyError && err.reason !== 'redirect-limit-exceeded') {
              reject(new UrlSafetyError('redirect-to-blocked-ip', `Redirect target is blocked: ${nextUrl}`));
            } else {
              reject(err);
            }
          });
        return;
      }

      // Check Content-Type before reading body
      const rawContentType = res.headers['content-type'] ?? '';
      const mediaType = rawContentType.split(';')[0].trim().toLowerCase();
      if (mediaType !== 'text/html' && mediaType !== 'text/plain') {
        res.resume();
        reject(new UrlSafetyError('disallowed-content-type', `Disallowed Content-Type: ${rawContentType}`));
        return;
      }

      // Stream body with size limit
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      res.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          res.destroy();
          reject(new UrlSafetyError('response-too-large', `Response exceeds ${maxBytes} bytes`));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve({ body, contentType: rawContentType });
      });

      res.on('error', (err) => reject(err));
    });

    req.on('error', (err) => {
      signal.removeEventListener('abort', onAbort);
      if (signal.aborted) {
        reject(new UrlSafetyError('timeout', `Request timed out after ${timeoutMs}ms: ${url}`));
      } else {
        reject(err);
      }
    });

    req.end();
  });
}
