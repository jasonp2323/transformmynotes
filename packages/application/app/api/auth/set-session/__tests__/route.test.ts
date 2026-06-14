import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const verifyIdTokenMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/verify-id-token', () => ({
  verifyIdToken: verifyIdTokenMock,
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import { POST } from '../route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/set-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  verifyIdTokenMock.mockResolvedValue({ sub: 'user-sub-123', email: 'user@example.com' });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/set-session', () => {
  describe('body validation', () => {
    it('returns 400 when body is not JSON', async () => {
      const req = new Request('http://localhost/api/auth/set-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });
      const res = await POST(req);
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request.');
    });

    it('returns 400 when idToken is missing', async () => {
      const res = await POST(makeRequest({}));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request.');
    });

    it('returns 400 when idToken is empty string', async () => {
      const res = await POST(makeRequest({ idToken: '' }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request.');
    });
  });

  describe('token verification failure', () => {
    it('returns 401 { error: "Invalid session." } when verifyIdToken throws', async () => {
      verifyIdTokenMock.mockRejectedValue(new Error('JWT is invalid'));
      const res = await POST(makeRequest({ idToken: 'bad-token' }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(401);
      expect(body.error).toBe('Invalid session.');
    });
  });

  describe('happy path', () => {
    it('returns 200 { ok: true } and sets CognitoIdToken cookie on valid token', async () => {
      verifyIdTokenMock.mockResolvedValue({ sub: 'user-123' });
      const res = await POST(makeRequest({ idToken: 'valid-id-token' }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);

      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain('CognitoIdToken=valid-id-token');
    });

    it('sets HttpOnly cookie', async () => {
      const res = await POST(makeRequest({ idToken: 'valid-id-token' }));
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('HttpOnly');
    });
  });
});
