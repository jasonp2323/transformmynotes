import { describe, it, expect } from 'vitest';
import {
  formatInviteCode,
  DEFAULT_EXPIRY_DAYS,
  defaultExpiresAt,
  parseCreateInviteBody,
} from './invite-create';

// ---------------------------------------------------------------------------
// formatInviteCode
// ---------------------------------------------------------------------------

describe('formatInviteCode', () => {
  it("inserts a dash in the middle of an 8-char code → 'ABCD-EFGH'", () => {
    expect(formatInviteCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });

  it('handles a code with all same characters', () => {
    expect(formatInviteCode('AAAABBBB')).toBe('AAAA-BBBB');
  });

  it('falls back to grouping into 4s for a 12-char code', () => {
    expect(formatInviteCode('ABCDEFGHIJKL')).toBe('ABCD-EFGH-IJKL');
  });

  it('returns the code as-is when shorter than 4 chars', () => {
    expect(formatInviteCode('AB')).toBe('AB');
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_EXPIRY_DAYS and defaultExpiresAt
// ---------------------------------------------------------------------------

describe('DEFAULT_EXPIRY_DAYS', () => {
  it('is 30', () => {
    expect(DEFAULT_EXPIRY_DAYS).toBe(30);
  });
});

describe('defaultExpiresAt', () => {
  it('returns now + 30 days as an ISO-8601 string', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const result = defaultExpiresAt(now);
    expect(result).toBe('2026-01-31T00:00:00.000Z');
  });

  it('handles month boundaries correctly (end of January)', () => {
    const now = new Date('2026-01-15T12:00:00.000Z');
    const result = defaultExpiresAt(now);
    const expected = new Date('2026-01-15T12:00:00.000Z');
    expected.setDate(expected.getDate() + 30);
    expect(result).toBe(expected.toISOString());
  });
});

// ---------------------------------------------------------------------------
// parseCreateInviteBody — email type
// ---------------------------------------------------------------------------

describe('parseCreateInviteBody — type=email', () => {
  it('parses a valid email body', () => {
    const result = parseCreateInviteBody({ type: 'email', email: 'user@example.com' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.type).toBe('email');
    if (result.value.type !== 'email') return;
    expect(result.value.email).toBe('user@example.com');
    expect(result.value.maxUses).toBe(1);
    expect(result.value.groupId).toBeUndefined();
    expect(result.value.expiresAt).toBeUndefined();
  });

  it('accepts an optional groupId', () => {
    const result = parseCreateInviteBody({
      type: 'email',
      email: 'user@example.com',
      groupId: 'group-abc',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.groupId).toBe('group-abc');
  });

  it('accepts a valid expiresAt', () => {
    const result = parseCreateInviteBody({
      type: 'email',
      email: 'user@example.com',
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expiresAt).toBe('2027-01-01T00:00:00.000Z');
  });

  it('returns error when email is missing', () => {
    const result = parseCreateInviteBody({ type: 'email' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/email/i);
  });

  it('returns error when email is invalid', () => {
    const result = parseCreateInviteBody({ type: 'email', email: 'not-an-email' });
    expect(result.ok).toBe(false);
  });

  it('returns error when expiresAt is not a parseable date', () => {
    const result = parseCreateInviteBody({
      type: 'email',
      email: 'user@example.com',
      expiresAt: 'not-a-date',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/expiresAt/i);
  });

  it('returns error when expiresAt is not a string', () => {
    const result = parseCreateInviteBody({
      type: 'email',
      email: 'user@example.com',
      expiresAt: 12345,
    });
    expect(result.ok).toBe(false);
  });

  it('forces maxUses to 1 regardless of what is supplied', () => {
    // label is silently ignored for email type
    const result = parseCreateInviteBody({ type: 'email', email: 'user@example.com' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.maxUses).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// parseCreateInviteBody — code type
// ---------------------------------------------------------------------------

describe('parseCreateInviteBody — type=code', () => {
  it('parses a valid code body with label', () => {
    const result = parseCreateInviteBody({ type: 'code', label: 'Classroom batch A' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.type).toBe('code');
    if (result.value.type !== 'code') return;
    expect(result.value.label).toBe('Classroom batch A');
    expect(result.value.maxUses).toBe(1);
    expect(result.value.groupId).toBeUndefined();
    expect(result.value.expiresAt).toBeUndefined();
  });

  it('accepts a valid maxUses > 1', () => {
    const result = parseCreateInviteBody({ type: 'code', label: 'Multi', maxUses: 50 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.value.type !== 'code') return;
    expect(result.value.maxUses).toBe(50);
  });

  it('defaults maxUses to 1 when absent', () => {
    const result = parseCreateInviteBody({ type: 'code', label: 'Test' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.value.type !== 'code') return;
    expect(result.value.maxUses).toBe(1);
  });

  it('returns error when label is missing', () => {
    const result = parseCreateInviteBody({ type: 'code' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/label/i);
  });

  it('returns error when label is empty string', () => {
    const result = parseCreateInviteBody({ type: 'code', label: '   ' });
    expect(result.ok).toBe(false);
  });

  it('returns error when maxUses is 0', () => {
    const result = parseCreateInviteBody({ type: 'code', label: 'X', maxUses: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/maxUses/i);
  });

  it('returns error when maxUses is negative', () => {
    const result = parseCreateInviteBody({ type: 'code', label: 'X', maxUses: -1 });
    expect(result.ok).toBe(false);
  });

  it('returns error when maxUses is a non-integer', () => {
    const result = parseCreateInviteBody({ type: 'code', label: 'X', maxUses: 2.5 });
    expect(result.ok).toBe(false);
  });

  it('returns error when maxUses is a string', () => {
    const result = parseCreateInviteBody({ type: 'code', label: 'X', maxUses: '10' });
    expect(result.ok).toBe(false);
  });

  it('returns error when expiresAt is not a parseable date', () => {
    const result = parseCreateInviteBody({ type: 'code', label: 'X', expiresAt: 'bad' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/expiresAt/i);
  });

  it('accepts a valid groupId and expiresAt', () => {
    const result = parseCreateInviteBody({
      type: 'code',
      label: 'Batch',
      groupId: 'grp-123',
      expiresAt: '2027-06-01T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.groupId).toBe('grp-123');
    expect(result.value.expiresAt).toBe('2027-06-01T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// parseCreateInviteBody — invalid type
// ---------------------------------------------------------------------------

describe('parseCreateInviteBody — invalid type', () => {
  it('returns error for unknown type', () => {
    const result = parseCreateInviteBody({ type: 'link' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Invalid type/i);
  });

  it('returns error when type is absent', () => {
    const result = parseCreateInviteBody({});
    expect(result.ok).toBe(false);
  });

  it('returns error when type is a number', () => {
    const result = parseCreateInviteBody({ type: 42 });
    expect(result.ok).toBe(false);
  });
});
