import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import type * as DnsPromises from 'node:dns/promises';

// ---------------------------------------------------------------------------
// Mock node:dns/promises BEFORE importing the module under test
// ---------------------------------------------------------------------------
vi.mock('node:dns/promises', () => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks are set up)
// ---------------------------------------------------------------------------
import { assertUrlSafe, safeFetch, UrlSafetyError } from '../src/sources/safe-fetch.js';
import * as dnsModule from 'node:dns/promises';

const resolve4 = vi.mocked(dnsModule.resolve4) as MockedFunction<typeof DnsPromises.resolve4>;
const resolve6 = vi.mocked(dnsModule.resolve6) as MockedFunction<typeof DnsPromises.resolve6>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set up DNS mocks to simulate a public hostname resolving to a given IP */
function mockDns4(ip: string) {
  resolve4.mockResolvedValue([ip] as string[] & { ttl: number }[]);
  resolve6.mockRejectedValue(new Error('no AAAA records'));
}

function mockDnsFail() {
  resolve4.mockRejectedValue(new Error('ENOTFOUND'));
  resolve6.mockRejectedValue(new Error('ENOTFOUND'));
}

/** Assert that assertUrlSafe throws UrlSafetyError with the given reason */
async function expectBlocked(url: string, reason: string) {
  await expect(assertUrlSafe(url)).rejects.toSatisfy((err: unknown) => {
    if (!(err instanceof UrlSafetyError)) return false;
    if (err.reason !== reason) {
      throw new Error(`Expected reason '${reason}' but got '${err.reason}' for URL ${url}`);
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Helper to create a fake http/https response for safeFetch tests
// ---------------------------------------------------------------------------
import { EventEmitter } from 'node:events';

interface FakeResponse extends EventEmitter {
  statusCode: number;
  headers: Record<string, string>;
  resume(): void;
  destroy(): void;
}

function makeFakeResponse(opts: {
  statusCode?: number;
  contentType?: string;
  body?: string;
  location?: string;
}): FakeResponse {
  const emitter = new EventEmitter() as FakeResponse;
  emitter.statusCode = opts.statusCode ?? 200;
  emitter.headers = {};
  if (opts.contentType) emitter.headers['content-type'] = opts.contentType;
  if (opts.location) emitter.headers['location'] = opts.location;
  emitter.resume = () => {};
  emitter.destroy = () => {};
  return emitter;
}

// ---------------------------------------------------------------------------
// Mock http/https for safeFetch tests
// ---------------------------------------------------------------------------
const mockRequest = vi.fn();

vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return {
    ...actual,
    Agent: class MockHttpAgent {
      createConnection = vi.fn();
    },
    request: (...args: unknown[]) => mockRequest(...args),
  };
});

vi.mock('node:https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:https')>();
  return {
    ...actual,
    Agent: class MockHttpsAgent {
      createConnection = vi.fn();
    },
    request: (...args: unknown[]) => mockRequest(...args),
  };
});

vi.mock('node:tls', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:tls')>();
  return {
    ...actual,
    connect: vi.fn(),
  };
});

vi.mock('node:net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:net')>();
  return {
    ...actual,
    isIP: actual.isIP,
    isIPv4: actual.isIPv4,
    isIPv6: actual.isIPv6,
    createConnection: vi.fn(),
  };
});

/** Simulate a successful HTTP request */
function setupHttpSuccess(opts: {
  statusCode?: number;
  contentType?: string;
  body?: string;
  location?: string;
}) {
  const fakeReq = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
  fakeReq.end = vi.fn() as () => void;
  fakeReq.destroy = vi.fn() as () => void;

  const fakeRes = makeFakeResponse(opts);

  mockRequest.mockImplementation((_options: unknown, callback: (res: FakeResponse) => void) => {
    setTimeout(() => {
      callback(fakeRes);
      if (opts.body !== undefined && opts.statusCode !== 302 && opts.statusCode !== 301) {
        setTimeout(() => {
          fakeRes.emit('data', Buffer.from(opts.body!));
          fakeRes.emit('end');
        }, 0);
      }
    }, 0);
    return fakeReq;
  });

  return { fakeReq, fakeRes };
}

// ---------------------------------------------------------------------------
// Tests: assertUrlSafe — scheme checks
// ---------------------------------------------------------------------------

describe('assertUrlSafe — scheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks file:///etc/passwd', async () => {
    await expectBlocked('file:///etc/passwd', 'disallowed-scheme');
  });

  it('blocks gopher://internal/', async () => {
    await expectBlocked('gopher://internal/', 'disallowed-scheme');
  });
});

// ---------------------------------------------------------------------------
// Tests: assertUrlSafe — hostname checks
// ---------------------------------------------------------------------------

describe('assertUrlSafe — hostname', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks http://localhost/', async () => {
    await expectBlocked('http://localhost/', 'localhost-hostname');
  });

  it('blocks http://metadata.google.internal/', async () => {
    await expectBlocked('http://metadata.google.internal/', 'metadata-hostname');
  });
});

// ---------------------------------------------------------------------------
// Tests: assertUrlSafe — IPv4 literal addresses
// ---------------------------------------------------------------------------

describe('assertUrlSafe — IPv4 literals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks http://127.0.0.1/ (loopback)', async () => {
    await expectBlocked('http://127.0.0.1/', 'loopback-ip');
  });

  it('blocks http://127.1.2.3/ (loopback — full /8)', async () => {
    await expectBlocked('http://127.1.2.3/', 'loopback-ip');
  });

  it('blocks http://10.0.0.1/ (private)', async () => {
    await expectBlocked('http://10.0.0.1/', 'private-ip');
  });

  it('blocks http://172.16.0.1/ (private)', async () => {
    await expectBlocked('http://172.16.0.1/', 'private-ip');
  });

  it('blocks http://172.31.255.255/ (private)', async () => {
    await expectBlocked('http://172.31.255.255/', 'private-ip');
  });

  it('blocks http://192.168.1.1/ (private)', async () => {
    await expectBlocked('http://192.168.1.1/', 'private-ip');
  });

  it('blocks http://169.254.169.254/ (link-local / IMDS)', async () => {
    await expectBlocked('http://169.254.169.254/', 'link-local-ip');
  });

  it('blocks http://169.254.0.1/ (link-local — entire /16)', async () => {
    await expectBlocked('http://169.254.0.1/', 'link-local-ip');
  });
});

// ---------------------------------------------------------------------------
// Tests: assertUrlSafe — IPv6 literal addresses
// ---------------------------------------------------------------------------

describe('assertUrlSafe — IPv6 literals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks http://[::1]/ (IPv6 loopback)', async () => {
    await expectBlocked('http://[::1]/', 'ipv6-loopback');
  });

  it('blocks http://[fd12:3456::1]/ (IPv6 ULA)', async () => {
    await expectBlocked('http://[fd12:3456::1]/', 'ipv6-ula');
  });

  it('blocks http://[fe80::1]/ (IPv6 link-local)', async () => {
    await expectBlocked('http://[fe80::1]/', 'ipv6-link-local');
  });

  it('blocks http://[::ffff:169.254.169.254]/ (IPv4-mapped link-local)', async () => {
    await expectBlocked('http://[::ffff:169.254.169.254]/', 'link-local-ip');
  });
});

// ---------------------------------------------------------------------------
// Tests: assertUrlSafe — DNS resolution path
// ---------------------------------------------------------------------------

describe('assertUrlSafe — DNS resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks hostname resolving to 169.254.169.254 (link-local via DNS)', async () => {
    mockDns4('169.254.169.254');
    await expectBlocked('http://evil.example.com/', 'link-local-ip');
  });

  it('blocks hostname resolving to 10.0.0.1 (private via DNS)', async () => {
    mockDns4('10.0.0.1');
    await expectBlocked('http://evil2.example.com/', 'private-ip');
  });

  it('throws dns-resolution-failure when DNS fails entirely', async () => {
    mockDnsFail();
    await expectBlocked('http://nonexistent.invalid/', 'dns-resolution-failure');
  });

  it('resolves successfully for a public IP', async () => {
    mockDns4('93.184.216.34');
    const result = await assertUrlSafe('http://example.com/');
    expect(result.resolvedIp).toBe('93.184.216.34');
  });
});

// ---------------------------------------------------------------------------
// Tests: safeFetch — HTTP-layer blocked cases
// ---------------------------------------------------------------------------

describe('safeFetch — redirect and resource limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks redirect to http://169.254.169.254/ (redirect-to-blocked-ip)', async () => {
    // Public hostname resolves OK
    resolve4.mockImplementation(async (hostname: string) => {
      if (hostname === 'public.example.com') return ['93.184.216.34'] as string[] & { ttl: number }[];
      throw new Error('ENOTFOUND');
    });
    resolve6.mockRejectedValue(new Error('ENOTFOUND'));

    // First request returns a redirect to the metadata IP
    const fakeReq = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    fakeReq.end = vi.fn() as () => void;
    fakeReq.destroy = vi.fn() as () => void;

    const fakeRes = makeFakeResponse({ statusCode: 302, location: 'http://169.254.169.254/latest/meta-data/' });

    mockRequest.mockImplementation((_options: unknown, callback: (res: FakeResponse) => void) => {
      setTimeout(() => callback(fakeRes), 0);
      return fakeReq;
    });

    await expect(safeFetch('http://public.example.com/')).rejects.toSatisfy((err: unknown) => {
      if (!(err instanceof UrlSafetyError)) return false;
      expect(err.reason).toBe('redirect-to-blocked-ip');
      return true;
    });
  });

  it('blocks a 4-redirect chain (redirect-limit-exceeded)', async () => {
    // All hostnames resolve to a safe IP
    resolve4.mockImplementation(async () => ['93.184.216.34'] as string[] & { ttl: number }[]);
    resolve6.mockRejectedValue(new Error('ENOTFOUND'));

    let callCount = 0;
    mockRequest.mockImplementation((_options: unknown, callback: (res: FakeResponse) => void) => {
      callCount++;
      const fakeReq = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
      fakeReq.end = vi.fn() as () => void;
      fakeReq.destroy = vi.fn() as () => void;

      // Always redirect to the next hop
      const fakeRes = makeFakeResponse({
        statusCode: 302,
        location: `http://hop${callCount}.example.com/`,
      });
      setTimeout(() => callback(fakeRes), 0);
      return fakeReq;
    });

    await expect(safeFetch('http://start.example.com/')).rejects.toSatisfy((err: unknown) => {
      if (!(err instanceof UrlSafetyError)) return false;
      expect(err.reason).toBe('redirect-limit-exceeded');
      return true;
    });
  });

  it('blocks response > 5 MB (response-too-large)', async () => {
    mockDns4('93.184.216.34');

    const fakeReq = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    fakeReq.end = vi.fn() as () => void;
    fakeReq.destroy = vi.fn() as () => void;

    const fakeRes = makeFakeResponse({ statusCode: 200, contentType: 'text/html' });

    mockRequest.mockImplementation((_options: unknown, callback: (res: FakeResponse) => void) => {
      setTimeout(() => {
        callback(fakeRes);
        // Send a chunk just over 5 MB
        setTimeout(() => {
          fakeRes.emit('data', Buffer.alloc(5_242_881, 'x'));
          fakeRes.emit('end');
        }, 0);
      }, 0);
      return fakeReq;
    });

    await expect(safeFetch('http://bigpage.example.com/')).rejects.toSatisfy((err: unknown) => {
      if (!(err instanceof UrlSafetyError)) return false;
      expect(err.reason).toBe('response-too-large');
      return true;
    });
  });

  it('blocks Content-Type: application/pdf (disallowed-content-type)', async () => {
    mockDns4('93.184.216.34');

    const fakeReq = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    fakeReq.end = vi.fn() as () => void;
    fakeReq.destroy = vi.fn() as () => void;

    const fakeRes = makeFakeResponse({ statusCode: 200, contentType: 'application/pdf' });

    mockRequest.mockImplementation((_options: unknown, callback: (res: FakeResponse) => void) => {
      setTimeout(() => callback(fakeRes), 0);
      return fakeReq;
    });

    await expect(safeFetch('http://example.com/doc.pdf')).rejects.toSatisfy((err: unknown) => {
      if (!(err instanceof UrlSafetyError)) return false;
      expect(err.reason).toBe('disallowed-content-type');
      return true;
    });
  });

  it('returns body for a valid public URL', async () => {
    mockDns4('93.184.216.34');

    const fakeReq = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    fakeReq.end = vi.fn() as () => void;
    fakeReq.destroy = vi.fn() as () => void;

    const fakeRes = makeFakeResponse({ statusCode: 200, contentType: 'text/html', body: '<html><body>Hello</body></html>' });

    mockRequest.mockImplementation((_options: unknown, callback: (res: FakeResponse) => void) => {
      setTimeout(() => {
        callback(fakeRes);
        setTimeout(() => {
          fakeRes.emit('data', Buffer.from('<html><body>Hello</body></html>'));
          fakeRes.emit('end');
        }, 0);
      }, 0);
      return fakeReq;
    });

    const result = await safeFetch('http://example.com/');
    expect(result.body).toBe('<html><body>Hello</body></html>');
    expect(result.contentType).toBe('text/html');
  });
});
