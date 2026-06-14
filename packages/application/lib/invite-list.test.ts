import { describe, it, expect } from 'vitest';
import {
  formatShortDate,
  inviteRecipientLabel,
  inviteCodeRef,
  inviteCodeDisplay,
  inviteDetail,
  expiresAtForOption,
} from './invite-list';

// ---------------------------------------------------------------------------
// formatShortDate
// ---------------------------------------------------------------------------

describe('formatShortDate', () => {
  it('formats a known UTC date correctly', () => {
    // 2024-06-05T00:00:00.000Z → "Jun 5"
    expect(formatShortDate('2024-06-05T00:00:00.000Z')).toBe('Jun 5');
  });

  it('formats the last day of December', () => {
    expect(formatShortDate('2024-12-31T23:59:59.000Z')).toBe('Dec 31');
  });

  it('formats January 1', () => {
    expect(formatShortDate('2025-01-01T12:00:00.000Z')).toBe('Jan 1');
  });

  it('uses UTC month, not local month', () => {
    // 2024-03-01T00:30:00Z is always March 1 in UTC
    const result = formatShortDate('2024-03-01T00:30:00.000Z');
    expect(result).toBe('Mar 1');
  });
});

// ---------------------------------------------------------------------------
// inviteRecipientLabel
// ---------------------------------------------------------------------------

describe('inviteRecipientLabel', () => {
  it('returns targetEmail for email invites', () => {
    expect(
      inviteRecipientLabel({ type: 'email', targetEmail: 'user@example.com', label: undefined }),
    ).toBe('user@example.com');
  });

  it('returns "—" for email invites with no targetEmail', () => {
    expect(
      inviteRecipientLabel({ type: 'email', targetEmail: undefined, label: undefined }),
    ).toBe('—');
  });

  it('returns label for code invites', () => {
    expect(
      inviteRecipientLabel({ type: 'code', targetEmail: undefined, label: 'SPAN-201-FALL' }),
    ).toBe('SPAN-201-FALL');
  });

  it('returns "—" for code invites with no label', () => {
    expect(
      inviteRecipientLabel({ type: 'code', targetEmail: undefined, label: undefined }),
    ).toBe('—');
  });
});

// ---------------------------------------------------------------------------
// inviteCodeRef
// ---------------------------------------------------------------------------

describe('inviteCodeRef', () => {
  it('returns the first 8 characters of the codeHash', () => {
    expect(inviteCodeRef({ codeHash: 'abcdef1234567890' })).toBe('abcdef12');
  });

  it('handles a hash shorter than 8 chars gracefully', () => {
    expect(inviteCodeRef({ codeHash: 'abc' })).toBe('abc');
  });

  it('returns exactly 8 chars for a 40-char sha hash', () => {
    const hash = 'a'.repeat(40);
    const ref = inviteCodeRef({ codeHash: hash });
    expect(ref).toHaveLength(8);
    expect(ref).toBe('aaaaaaaa');
  });
});

// ---------------------------------------------------------------------------
// inviteDetail
// ---------------------------------------------------------------------------

describe('inviteDetail', () => {
  it('returns "N/M used" for code invites', () => {
    expect(
      inviteDetail({ type: 'code', usedCount: 3, maxUses: 25, expiresAt: undefined }),
    ).toBe('3/25 used');
  });

  it('returns "0/1 used" for an untouched code invite', () => {
    expect(
      inviteDetail({ type: 'code', usedCount: 0, maxUses: 1, expiresAt: undefined }),
    ).toBe('0/1 used');
  });

  it('returns expiry date for email invites with expiresAt', () => {
    expect(
      inviteDetail({
        type: 'email',
        usedCount: 0,
        maxUses: 1,
        expiresAt: '2025-08-15T00:00:00.000Z',
      }),
    ).toBe('Expires Aug 15');
  });

  it('returns "No expiry" for email invites without expiresAt', () => {
    expect(
      inviteDetail({ type: 'email', usedCount: 0, maxUses: 1, expiresAt: undefined }),
    ).toBe('No expiry');
  });
});

// ---------------------------------------------------------------------------
// expiresAtForOption
// ---------------------------------------------------------------------------

describe('expiresAtForOption', () => {
  const now = new Date('2025-06-10T12:00:00.000Z');

  it('adds 7 days for "In 7 days"', () => {
    const result = expiresAtForOption('In 7 days', now);
    // 2025-06-10 + 7 = 2025-06-17
    expect(result).toBe(new Date('2025-06-17T12:00:00.000Z').toISOString());
  });

  it('adds 30 days for "In 30 days"', () => {
    const result = expiresAtForOption('In 30 days', now);
    // 2025-06-10 + 30 = 2025-07-10
    expect(result).toBe(new Date('2025-07-10T12:00:00.000Z').toISOString());
  });

  it('does not mutate the original Date', () => {
    const nowCopy = new Date(now.getTime());
    expiresAtForOption('In 30 days', now);
    expect(now.toISOString()).toBe(nowCopy.toISOString());
  });
});

// ---------------------------------------------------------------------------
// inviteCodeDisplay
// ---------------------------------------------------------------------------

describe('inviteCodeDisplay', () => {
  it('returns formatted code when invite.code is present', () => {
    // formatInviteCode('ABCDEFGH') → 'ABCD-EFGH'
    expect(inviteCodeDisplay({ code: 'ABCDEFGH', codeHash: 'abc123' })).toBe('ABCD-EFGH');
  });

  it('falls back to codeHash slice when invite.code is absent', () => {
    expect(inviteCodeDisplay({ code: undefined, codeHash: 'abcdef1234567890' })).toBe('abcdef12');
  });

  it('falls back to codeHash slice when invite.code is empty string', () => {
    // Empty string is falsy, so falls back to hash ref
    expect(inviteCodeDisplay({ code: '', codeHash: 'abcdef1234567890' })).toBe('abcdef12');
  });
});
