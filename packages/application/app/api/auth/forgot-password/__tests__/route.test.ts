import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const forgotPasswordMock = vi.hoisted(() => vi.fn());
const verifyTurnstileMock = vi.hoisted(() => vi.fn());
const enforceRateLimitMock = vi.hoisted(() => vi.fn());
const clientIpMock = vi.hoisted(() => vi.fn(() => '1.2.3.4'));

vi.mock('@/lib/cognito', () => ({
  forgotPassword: forgotPasswordMock,
}));

vi.mock('@/lib/turnstile', () => {
  class TurnstileError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TurnstileError';
    }
  }
  return {
    verifyTurnstile: verifyTurnstileMock,
    TurnstileError,
  };
});

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: enforceRateLimitMock,
  clientIp: clientIpMock,
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import { POST } from '../route';
import { TurnstileError } from '@/lib/turnstile';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  email: 'user@example.com',
  turnstileToken: 'tok',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  enforceRateLimitMock.mockResolvedValue({ ok: true, retryAfterSeconds: 0 });
  verifyTurnstileMock.mockResolvedValue(undefined);
  forgotPasswordMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/forgot-password', () => {
  describe('body validation', () => {
    it('returns 400 when email is missing', async () => {
      const res = await POST(makeRequest({ turnstileToken: 'tok' }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request.');
    });

    it('returns 400 when email is invalid', async () => {
      const res = await POST(makeRequest({ email: 'bad-email', turnstileToken: 'tok' }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request.');
    });
  });

  describe('rate-limit', () => {
    it('returns 429 with Retry-After when rate-limit exceeded', async () => {
      enforceRateLimitMock.mockResolvedValue({ ok: false, retryAfterSeconds: 30 });
      const res = await POST(makeRequest(VALID_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(429);
      expect(body.error).toBe('Too many attempts. Please try again later.');
      expect(res.headers.get('Retry-After')).toBe('30');
      expect(verifyTurnstileMock).not.toHaveBeenCalled();
      expect(forgotPasswordMock).not.toHaveBeenCalled();
    });
  });

  describe('Turnstile', () => {
    it('returns 400 "Bot check failed." when Turnstile fails', async () => {
      verifyTurnstileMock.mockRejectedValue(new TurnstileError('Turnstile verification failed'));
      const res = await POST(makeRequest(VALID_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Bot check failed. Please try again.');
      expect(forgotPasswordMock).not.toHaveBeenCalled();
    });
  });

  describe('no-enumeration', () => {
    it('returns 200 { ok: true } even when forgotPassword throws UserNotFoundException', async () => {
      const err = new Error('User does not exist.');
      (err as { name: string }).name = 'UserNotFoundException';
      forgotPasswordMock.mockRejectedValue(err);
      const res = await POST(makeRequest(VALID_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });

    it('returns 200 { ok: true } for any Cognito error (no enumeration)', async () => {
      forgotPasswordMock.mockRejectedValue(new Error('Some other Cognito error'));
      const res = await POST(makeRequest(VALID_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });
  });

  describe('happy path', () => {
    it('returns 200 { ok: true } when all steps succeed', async () => {
      const res = await POST(makeRequest(VALID_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });
  });
});
