import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const confirmForgotPasswordMock = vi.hoisted(() => vi.fn());
const verifyTurnstileMock = vi.hoisted(() => vi.fn());
const enforceRateLimitMock = vi.hoisted(() => vi.fn());
const clientIpMock = vi.hoisted(() => vi.fn(() => '1.2.3.4'));

vi.mock('@/lib/cognito', () => ({
  confirmForgotPassword: confirmForgotPasswordMock,
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
  return new Request('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  email: 'user@example.com',
  code: '123456',
  newPassword: 'NewPassword123!',
  turnstileToken: 'tok',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  enforceRateLimitMock.mockResolvedValue({ ok: true, retryAfterSeconds: 0 });
  verifyTurnstileMock.mockResolvedValue(undefined);
  confirmForgotPasswordMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/reset-password', () => {
  describe('body validation', () => {
    it('returns 400 when email is missing', async () => {
      const res = await POST(makeRequest({ code: '123', newPassword: 'pw', turnstileToken: 'tok' }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request.');
    });

    it('returns 400 when code is blank', async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, code: '' }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request.');
    });
  });

  describe('rate-limit', () => {
    it('returns 429 with Retry-After when rate-limit exceeded', async () => {
      enforceRateLimitMock.mockResolvedValue({ ok: false, retryAfterSeconds: 55 });
      const res = await POST(makeRequest(VALID_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(429);
      expect(body.error).toBe('Too many attempts. Please try again later.');
      expect(res.headers.get('Retry-After')).toBe('55');
      expect(verifyTurnstileMock).not.toHaveBeenCalled();
      expect(confirmForgotPasswordMock).not.toHaveBeenCalled();
    });
  });

  describe('Turnstile', () => {
    it('returns 400 "Bot check failed." when Turnstile fails', async () => {
      verifyTurnstileMock.mockRejectedValue(new TurnstileError('Turnstile verification failed'));
      const res = await POST(makeRequest(VALID_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Bot check failed. Please try again.');
      expect(confirmForgotPasswordMock).not.toHaveBeenCalled();
    });
  });

  describe('Cognito error mapping', () => {
    it('returns 400 with "Invalid or expired code." for CodeMismatchException', async () => {
      const err = new Error('Invalid verification code provided.');
      (err as { name: string }).name = 'CodeMismatchException';
      confirmForgotPasswordMock.mockRejectedValue(err);
      const res = await POST(makeRequest(VALID_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid or expired code. Please try again.');
    });

    it('returns 400 with "Invalid or expired code." for ExpiredCodeException', async () => {
      const err = new Error('Invalid code provided, please request a code again.');
      (err as { name: string }).name = 'ExpiredCodeException';
      confirmForgotPasswordMock.mockRejectedValue(err);
      const res = await POST(makeRequest(VALID_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid or expired code. Please try again.');
    });

    it('returns 400 with "Password does not meet the requirements." for InvalidPasswordException', async () => {
      const err = new Error('Password does not conform to policy.');
      (err as { name: string }).name = 'InvalidPasswordException';
      confirmForgotPasswordMock.mockRejectedValue(err);
      const res = await POST(makeRequest(VALID_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Password does not meet the requirements.');
    });

    it('returns 500 for unexpected Cognito errors', async () => {
      confirmForgotPasswordMock.mockRejectedValue(new Error('Unknown error'));
      const res = await POST(makeRequest(VALID_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(500);
      expect(body.error).toBe('Something went wrong. Please try again.');
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
