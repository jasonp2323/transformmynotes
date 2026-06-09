import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendInviteEmail, sendApprovalEmail, sendRejectionEmail } from '../email';

// ---------------------------------------------------------------------------
// Mock the Resend SDK
// ---------------------------------------------------------------------------

const sendMock = vi.hoisted(() => vi.fn());

vi.mock('resend', () => {
  return {
    Resend: class {
      emails = { send: sendMock };
    },
  };
});

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

const TEST_API_KEY = 'test-resend-api-key';
const TEST_FROM = 'noreply@test.transformmynotes.com';

beforeEach(() => {
  process.env.RESEND_API_KEY = TEST_API_KEY;
  process.env.INVITE_FROM_ADDRESS = TEST_FROM;
  sendMock.mockClear();
  sendMock.mockResolvedValue({ data: { id: 'msg_test_x' }, error: null });
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.INVITE_FROM_ADDRESS;
});

// ---------------------------------------------------------------------------
// sendInviteEmail
// ---------------------------------------------------------------------------

describe('sendInviteEmail', () => {
  it('calls send once with the correct from address and to address', async () => {
    await sendInviteEmail('student@example.com', 'ABC123', null, '2026-07-01T00:00:00.000Z');
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0]![0] as Record<string, string>;
    expect(payload.from).toBe(TEST_FROM);
    expect(payload.to).toBe('student@example.com');
  });

  it('includes the access code in both html and text', async () => {
    const code = 'MYCODE99';
    await sendInviteEmail('student@example.com', code, null, '2026-07-01T00:00:00.000Z');
    const payload = sendMock.mock.calls[0]![0] as Record<string, string>;
    expect(payload.html).toContain(code);
    expect(payload.text).toContain(code);
  });

  it('includes the group name when provided', async () => {
    const groupName = 'Biology 101';
    await sendInviteEmail('student@example.com', 'XYZ', groupName, '2026-07-01T00:00:00.000Z');
    const payload = sendMock.mock.calls[0]![0] as Record<string, string>;
    expect(payload.html).toContain(groupName);
    expect(payload.text).toContain(groupName);
  });

  it('succeeds when groupName is null (omits group from body)', async () => {
    await expect(
      sendInviteEmail('student@example.com', 'CODE', null, '2026-07-01T00:00:00.000Z'),
    ).resolves.toBeUndefined();
    const payload = sendMock.mock.calls[0]![0] as Record<string, string>;
    expect(payload.subject).toBeTruthy();
  });

  it('includes a subject', async () => {
    await sendInviteEmail('s@example.com', 'C', null, '2026-07-01T00:00:00.000Z');
    const payload = sendMock.mock.calls[0]![0] as Record<string, string>;
    expect(payload.subject).toBeTruthy();
  });

  it('throws when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(
      sendInviteEmail('s@example.com', 'C', null, '2026-07-01T00:00:00.000Z'),
    ).rejects.toThrow('RESEND_API_KEY');
  });

  it('throws when INVITE_FROM_ADDRESS is unset', async () => {
    delete process.env.INVITE_FROM_ADDRESS;
    await expect(
      sendInviteEmail('s@example.com', 'C', null, '2026-07-01T00:00:00.000Z'),
    ).rejects.toThrow('INVITE_FROM_ADDRESS');
  });

  it('throws when Resend returns a truthy error', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: 'rate limit exceeded' } });
    await expect(
      sendInviteEmail('s@example.com', 'C', null, '2026-07-01T00:00:00.000Z'),
    ).rejects.toThrow('Resend send failed');
  });
});

// ---------------------------------------------------------------------------
// sendApprovalEmail
// ---------------------------------------------------------------------------

describe('sendApprovalEmail', () => {
  it('calls send with correct from/to and includes the name', async () => {
    await sendApprovalEmail('alice@example.com', 'Alice');
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0]![0] as Record<string, string>;
    expect(payload.from).toBe(TEST_FROM);
    expect(payload.to).toBe('alice@example.com');
    expect(payload.html).toContain('Alice');
    expect(payload.text).toContain('Alice');
  });

  it('throws when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendApprovalEmail('alice@example.com', 'Alice')).rejects.toThrow('RESEND_API_KEY');
  });

  it('throws when INVITE_FROM_ADDRESS is unset', async () => {
    delete process.env.INVITE_FROM_ADDRESS;
    await expect(sendApprovalEmail('alice@example.com', 'Alice')).rejects.toThrow(
      'INVITE_FROM_ADDRESS',
    );
  });

  it('throws when Resend returns a truthy error', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: 'invalid api key' } });
    await expect(sendApprovalEmail('alice@example.com', 'Alice')).rejects.toThrow('Resend send failed');
  });
});

// ---------------------------------------------------------------------------
// sendRejectionEmail
// ---------------------------------------------------------------------------

describe('sendRejectionEmail', () => {
  it('calls send with the correct to address', async () => {
    await sendRejectionEmail('bob@example.com');
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0]![0] as Record<string, string>;
    expect(payload.from).toBe(TEST_FROM);
    expect(payload.to).toBe('bob@example.com');
    expect(payload.subject).toBeTruthy();
  });

  it('throws when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendRejectionEmail('bob@example.com')).rejects.toThrow('RESEND_API_KEY');
  });

  it('throws when INVITE_FROM_ADDRESS is unset', async () => {
    delete process.env.INVITE_FROM_ADDRESS;
    await expect(sendRejectionEmail('bob@example.com')).rejects.toThrow('INVITE_FROM_ADDRESS');
  });

  it('throws when Resend returns a truthy error', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { statusCode: 422 } });
    await expect(sendRejectionEmail('bob@example.com')).rejects.toThrow('Resend send failed');
  });
});
