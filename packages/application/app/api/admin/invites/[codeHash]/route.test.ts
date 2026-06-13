import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAdminApiUserMock = vi.hoisted(() => vi.fn());
const revokeInviteMock = vi.hoisted(() => vi.fn());
const deleteInviteMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-admin', () => ({
  getAdminApiUser: getAdminApiUserMock,
}));

vi.mock('@transformmynotes/core', () => ({
  revokeInvite: revokeInviteMock,
  deleteInvite: deleteInviteMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { DELETE } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN = { sub: 'admin-sub-001', claims: { 'cognito:groups': ['admin'] } };
const CODE_HASH = 'abc123codehashabcdef';

function makeDeleteRequest(search = '', body?: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/admin/invites/${CODE_HASH}${search}`, {
    method: 'DELETE',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAdminApiUserMock.mockResolvedValue(ADMIN);
  revokeInviteMock.mockResolvedValue({ ok: true, item: { status: 'revoked' } });
  deleteInviteMock.mockResolvedValue({ ok: true });
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('DELETE /api/admin/invites/[codeHash] — auth', () => {
  it('returns 403 when getAdminApiUser returns null', async () => {
    getAdminApiUserMock.mockResolvedValueOnce(null);

    const res = await DELETE(makeDeleteRequest(), { params: { codeHash: CODE_HASH } });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Forbidden');
  });
});

// ---------------------------------------------------------------------------
// Hard delete (?hard=true)
// ---------------------------------------------------------------------------

describe('DELETE /api/admin/invites/[codeHash]?hard=true — hard delete', () => {
  it('calls deleteInvite with the codeHash and returns { ok: true, status: "deleted" }', async () => {
    const res = await DELETE(makeDeleteRequest('?hard=true'), { params: { codeHash: CODE_HASH } });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('deleted');
    expect(deleteInviteMock).toHaveBeenCalledWith(CODE_HASH);
    expect(revokeInviteMock).not.toHaveBeenCalled();
  });

  it('returns 500 when deleteInvite throws', async () => {
    deleteInviteMock.mockRejectedValueOnce(new Error('DynamoDB error'));

    const res = await DELETE(makeDeleteRequest('?hard=true'), { params: { codeHash: CODE_HASH } });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Failed to delete invite.');
  });
});

// ---------------------------------------------------------------------------
// Soft revoke (default — no ?hard param)
// ---------------------------------------------------------------------------

describe('DELETE /api/admin/invites/[codeHash] — soft revoke (default)', () => {
  it('calls revokeInvite and returns { ok: true, status: "revoked" } on success', async () => {
    const res = await DELETE(makeDeleteRequest(), { params: { codeHash: CODE_HASH } });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('revoked');
    expect(revokeInviteMock).toHaveBeenCalledWith(CODE_HASH, undefined);
    expect(deleteInviteMock).not.toHaveBeenCalled();
  });

  it('passes auditNotes from request body to revokeInvite', async () => {
    const res = await DELETE(
      makeDeleteRequest('', { auditNotes: 'Policy violation' }),
      { params: { codeHash: CODE_HASH } },
    );
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(revokeInviteMock).toHaveBeenCalledWith(CODE_HASH, { auditNotes: 'Policy violation' });
  });

  it('returns 404 when revokeInvite returns { ok: false, reason: "not_found" }', async () => {
    revokeInviteMock.mockResolvedValueOnce({ ok: false, reason: 'not_found' });

    const res = await DELETE(makeDeleteRequest(), { params: { codeHash: CODE_HASH } });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Invite not found.');
  });

  it('returns 200 idempotently when revokeInvite returns { ok: false, reason: "already_revoked" }', async () => {
    revokeInviteMock.mockResolvedValueOnce({ ok: false, reason: 'already_revoked' });

    const res = await DELETE(makeDeleteRequest(), { params: { codeHash: CODE_HASH } });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('revoked');
  });

  it('returns 500 when revokeInvite throws', async () => {
    revokeInviteMock.mockRejectedValueOnce(new Error('DynamoDB error'));

    const res = await DELETE(makeDeleteRequest(), { params: { codeHash: CODE_HASH } });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Failed to revoke invite.');
  });
});
