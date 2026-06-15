import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const putAccessRequestMock = vi.hoisted(() => vi.fn());
const verifyTurnstileMock = vi.hoisted(() => vi.fn());
const listAdminEmailsMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const sendAdminAccessRequestNotificationMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@transformmynotes/core', () => ({
  putAccessRequest: putAccessRequestMock,
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: () => ({ ok: true }),
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

vi.mock('@/lib/admin-emails', () => ({
  listAdminEmails: listAdminEmailsMock,
}));

vi.mock('@/lib/email', () => ({
  sendAdminAccessRequestNotification: sendAdminAccessRequestNotificationMock,
}));

vi.mock('@/lib/request-origin', () => ({
  originFromHeaders: vi.fn(() => 'http://localhost'),
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
  return new Request('http://localhost/api/auth/request-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  name: 'Jane',
  email: 'jane@example.com',
  turnstileToken: 'tok',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  verifyTurnstileMock.mockResolvedValue(undefined);
  putAccessRequestMock.mockResolvedValue(undefined);
  listAdminEmailsMock.mockResolvedValue([]);
  sendAdminAccessRequestNotificationMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/request-access', () => {
  describe('body validation', () => {
    it('returns 400 when turnstileToken is missing and does not call putAccessRequest', async () => {
      const { turnstileToken: _omit, ...bodyWithoutToken } = VALID_BODY;
      const res = await POST(makeRequest(bodyWithoutToken));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(putAccessRequestMock).not.toHaveBeenCalled();
    });

    it('returns 400 when email is invalid', async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, email: 'not-an-email' }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(putAccessRequestMock).not.toHaveBeenCalled();
    });
  });

  describe('Turnstile', () => {
    it('returns 400 "Bot check failed" when Turnstile fails and does not call putAccessRequest', async () => {
      verifyTurnstileMock.mockRejectedValue(new TurnstileError('Turnstile verification failed'));

      const res = await POST(makeRequest(VALID_BODY));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.error).toBe('Bot check failed. Please try again.');
      expect(putAccessRequestMock).not.toHaveBeenCalled();
    });
  });

  describe('happy path', () => {
    it('returns 200 { ok: true } and calls putAccessRequest', async () => {
      const res = await POST(makeRequest(VALID_BODY));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(putAccessRequestMock).toHaveBeenCalledOnce();
    });
  });
});
