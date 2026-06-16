import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAdminApiUserMock = vi.hoisted(() => vi.fn());
const revertAiConfigMock = vi.hoisted(() => vi.fn());
const bustAiConfigCacheMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-admin', () => ({
  getAdminApiUser: getAdminApiUserMock,
}));

vi.mock('@transformmynotes/core', async (importActual) => ({
  ...(await importActual<typeof import('@transformmynotes/core')>()),
  revertAiConfig: revertAiConfigMock,
  bustAiConfigCache: bustAiConfigCacheMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { POST } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN = { sub: 'admin-1', claims: {} };

function jsonReq(body: unknown): Request {
  return new Request('http://localhost/api/admin/ai-config/revert', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function taggedError(name: string, message = name): Error {
  return Object.assign(new Error(message), { name });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAdminApiUserMock.mockResolvedValue(ADMIN);
  revertAiConfigMock.mockResolvedValue({ version: 1 });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/admin/ai-config/revert', () => {
  it('returns 403 when getAdminApiUser returns null', async () => {
    getAdminApiUserMock.mockResolvedValueOnce(null);

    const res = await POST(jsonReq({ version: 2 }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
    expect(revertAiConfigMock).not.toHaveBeenCalled();
  });

  it('returns 400 when version is missing', async () => {
    const res = await POST(jsonReq({}));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(revertAiConfigMock).not.toHaveBeenCalled();
  });

  it('returns 400 when version is zero', async () => {
    const res = await POST(jsonReq({ version: 0 }));
    expect(res.status).toBe(400);
    expect(revertAiConfigMock).not.toHaveBeenCalled();
  });

  it('returns 400 when version is non-integer', async () => {
    const res = await POST(jsonReq({ version: 1.5 }));
    expect(res.status).toBe(400);
    expect(revertAiConfigMock).not.toHaveBeenCalled();
  });

  it('returns 404 when revertAiConfig rejects with NotFound', async () => {
    revertAiConfigMock.mockRejectedValueOnce(taggedError('AiConfigVersionNotFoundError'));

    const res = await POST(jsonReq({ version: 99 }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(body.error).toBe('Version not found.');
  });

  it('returns 400 with the error message when revert snapshot is invalid', async () => {
    revertAiConfigMock.mockRejectedValueOnce(
      taggedError('AiConfigRevertInvalidError', 'AI_CONFIG_REVERT_INVALID: bad snapshot'),
    );

    const res = await POST(jsonReq({ version: 3 }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe('AI_CONFIG_REVERT_INVALID: bad snapshot');
  });

  it('returns 409 when revertAiConfig rejects with a conflict', async () => {
    revertAiConfigMock.mockRejectedValueOnce(taggedError('AiConfigVersionConflictError'));

    const res = await POST(jsonReq({ version: 3 }));
    expect(res.status).toBe(409);
  });

  it('returns 500 when revertAiConfig rejects generically', async () => {
    revertAiConfigMock.mockRejectedValueOnce(new Error('DB down'));

    const res = await POST(jsonReq({ version: 3 }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
  });

  it('reverts and returns the new version, busting cache', async () => {
    revertAiConfigMock.mockResolvedValueOnce({ version: 5 });

    const res = await POST(jsonReq({ version: 2 }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.version).toBe(5);
    expect(revertAiConfigMock).toHaveBeenCalledWith(2, ADMIN.sub);
    expect(bustAiConfigCacheMock).toHaveBeenCalledTimes(1);
  });
});
