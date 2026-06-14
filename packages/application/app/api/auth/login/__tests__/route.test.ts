import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

const initiateAuthMock = vi.hoisted(() => vi.fn());
const respondNewPasswordMock = vi.hoisted(() => vi.fn());
const verifyTurnstileMock = vi.hoisted(() => vi.fn());
const enforceRateLimitMock = vi.hoisted(() => vi.fn());
const clientIpMock = vi.hoisted(() => vi.fn(() => '1.2.3.4'));

vi.mock('@/lib/cognito', () => ({
  initiateAuth: initiateAuthMock,
  respondNewPassword: respondNewPasswordMock,
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
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { POST } from '../route';
import { TurnstileError } from '@/lib/turnstile';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  });
}

const VALID_PASSWORD_BODY = {
  step: 'PASSWORD',
  email: 'user@example.com',
  password: 'Password123!',
  turnstileToken: 'tok',
};

const VALID_NEW_PASSWORD_BODY = {
  step: 'NEW_PASSWORD',
  email: 'user@example.com',
  newPassword: 'NewPassword123!',
  session: 'sess-123',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: rate-limit passes
  enforceRateLimitMock.mockResolvedValue({ ok: true, retryAfterSeconds: 0 });
  // Default: Turnstile passes
  verifyTurnstileMock.mockResolvedValue(undefined);
  // Default: initiateAuth returns idToken
  initiateAuthMock.mockResolvedValue({ idToken: 'test-id-token' });
  // Default: respondNewPassword returns idToken
  respondNewPasswordMock.mockResolvedValue({ idToken: 'test-id-token' });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/login', () => {
  describe('body validation', () => {
    it('returns 400 { error: "Invalid request." } when body is not JSON', async () => {
      const req = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });
      const res = await POST(req);
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request.');
    });

    it('returns 400 when email is missing', async () => {
      const res = await POST(makeRequest({ step: 'PASSWORD', password: 'pw', turnstileToken: 'tok' }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request.');
      // Cognito must never be called
      expect(initiateAuthMock).not.toHaveBeenCalled();
    });

    it('returns 400 when email is invalid', async () => {
      const res = await POST(makeRequest({ ...VALID_PASSWORD_BODY, email: 'not-an-email' }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request.');
      expect(initiateAuthMock).not.toHaveBeenCalled();
    });

    it('returns 400 when turnstileToken is blank', async () => {
      const res = await POST(makeRequest({ ...VALID_PASSWORD_BODY, turnstileToken: '' }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request.');
      expect(initiateAuthMock).not.toHaveBeenCalled();
    });
  });

  describe('rate-limit', () => {
    it('returns 429 with Retry-After when rate-limit is exceeded', async () => {
      enforceRateLimitMock.mockResolvedValue({ ok: false, retryAfterSeconds: 42 });
      const res = await POST(makeRequest(VALID_PASSWORD_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(429);
      expect(body.error).toBe('Too many attempts. Please try again later.');
      expect(res.headers.get('Retry-After')).toBe('42');
      // Neither Turnstile nor Cognito should be called
      expect(verifyTurnstileMock).not.toHaveBeenCalled();
      expect(initiateAuthMock).not.toHaveBeenCalled();
    });
  });

  describe('Turnstile', () => {
    it('returns 400 "Bot check failed." when verifyTurnstile throws TurnstileError', async () => {
      verifyTurnstileMock.mockRejectedValue(new TurnstileError('Turnstile verification failed'));
      const res = await POST(makeRequest(VALID_PASSWORD_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Bot check failed. Please try again.');
      // Cognito must never be called
      expect(initiateAuthMock).not.toHaveBeenCalled();
    });

    it('returns 400 "Bot check failed." when turnstileToken is present but check fails', async () => {
      verifyTurnstileMock.mockRejectedValue(new TurnstileError('Turnstile verification failed'));
      const res = await POST(makeRequest({ ...VALID_PASSWORD_BODY, turnstileToken: 'bad-token' }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Bot check failed. Please try again.');
      expect(initiateAuthMock).not.toHaveBeenCalled();
    });
  });

  describe('Cognito errors', () => {
    it('returns 401 "Invalid email or password." for NotAuthorizedException', async () => {
      const err = new Error('Incorrect username or password.');
      (err as { name: string }).name = 'NotAuthorizedException';
      initiateAuthMock.mockRejectedValue(err);
      const res = await POST(makeRequest(VALID_PASSWORD_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(401);
      expect(body.error).toBe('Invalid email or password.');
    });

    it('returns 401 "Invalid email or password." for UserNotFoundException (no enumeration)', async () => {
      const err = new Error('User does not exist.');
      (err as { name: string }).name = 'UserNotFoundException';
      initiateAuthMock.mockRejectedValue(err);
      const res = await POST(makeRequest(VALID_PASSWORD_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(401);
      expect(body.error).toBe('Invalid email or password.');
      // Same response as NotAuthorizedException — no enumeration
    });

    it('returns 500 for unexpected Cognito errors', async () => {
      initiateAuthMock.mockRejectedValue(new Error('Unknown error'));
      const res = await POST(makeRequest(VALID_PASSWORD_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(500);
      expect(body.error).toBe('Something went wrong. Please try again.');
    });
  });

  describe('happy path — PASSWORD step', () => {
    it('returns 200 { ok: true } and sets CognitoIdToken cookie', async () => {
      initiateAuthMock.mockResolvedValue({ idToken: 'my-id-token' });
      const res = await POST(makeRequest(VALID_PASSWORD_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);

      // Cookie must be set
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain('CognitoIdToken=my-id-token');
    });

    it('returns challenge when initiateAuth returns NEW_PASSWORD_REQUIRED', async () => {
      initiateAuthMock.mockResolvedValue({
        challenge: 'NEW_PASSWORD_REQUIRED',
        session: 'challenge-session',
      });
      const res = await POST(makeRequest(VALID_PASSWORD_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(body.ok).toBe(false);
      expect(body.challenge).toBe('NEW_PASSWORD_REQUIRED');
      expect(body.session).toBe('challenge-session');
    });
  });

  describe('happy path — NEW_PASSWORD step', () => {
    it('returns 200 { ok: true } and sets cookie on successful password change', async () => {
      respondNewPasswordMock.mockResolvedValue({ idToken: 'new-id-token' });
      const res = await POST(makeRequest(VALID_NEW_PASSWORD_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);

      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain('CognitoIdToken=new-id-token');
    });

    it('does NOT call verifyTurnstile on NEW_PASSWORD step (continuation gated by session)', async () => {
      respondNewPasswordMock.mockResolvedValue({ idToken: 'new-id-token' });
      await POST(makeRequest(VALID_NEW_PASSWORD_BODY));
      expect(verifyTurnstileMock).not.toHaveBeenCalled();
    });

    it('returns 401 for auth failure on NEW_PASSWORD step', async () => {
      const err = new Error('Bad session');
      (err as { name: string }).name = 'NotAuthorizedException';
      respondNewPasswordMock.mockRejectedValue(err);
      const res = await POST(makeRequest(VALID_NEW_PASSWORD_BODY));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(401);
      expect(body.error).toBe('Invalid email or password.');
    });
  });
});
