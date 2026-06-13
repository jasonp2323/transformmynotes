import { describe, it, expect } from 'vitest';
import { hashInviteCode, evaluateInvite } from '../../src/auth/invite';
import type { InviteRecord } from '../../src/auth/invite';

describe('hashInviteCode', () => {
  it('returns a stable hex string for a given code', () => {
    const result = hashInviteCode('HELLO-WORLD');
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same hash for the same input', () => {
    expect(hashInviteCode('ABC123')).toBe(hashInviteCode('ABC123'));
  });

  it('lowercases before hashing (case-insensitive)', () => {
    expect(hashInviteCode('INVITE-CODE')).toBe(hashInviteCode('invite-code'));
    expect(hashInviteCode('MiXeD-CaSe')).toBe(hashInviteCode('mixed-case'));
  });

  it('trims whitespace before hashing', () => {
    expect(hashInviteCode('  code  ')).toBe(hashInviteCode('code'));
    expect(hashInviteCode('\tcode\n')).toBe(hashInviteCode('code'));
  });

  it('trims and lowercases together', () => {
    expect(hashInviteCode('  HELLO  ')).toBe(hashInviteCode('hello'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashInviteCode('code-one')).not.toBe(hashInviteCode('code-two'));
  });

  it('strips dashes so formatted and unformatted codes hash identically', () => {
    expect(hashInviteCode('ABCD-EFGH')).toBe(hashInviteCode('ABCDEFGH'));
  });

  it('strips internal whitespace so spaced and raw codes hash identically', () => {
    expect(hashInviteCode('abcd efgh')).toBe(hashInviteCode('abcdefgh'));
  });
});

describe('evaluateInvite', () => {
  const NOW = new Date('2024-06-15T12:00:00.000Z');

  const validInvite: InviteRecord = {
    codeHash: 'abc123',
    groupId: 'grp-1',
    groupName: 'Alpha Group',
  };

  describe('missing invite', () => {
    it('returns { valid: false, reason: "missing" } for undefined', () => {
      expect(evaluateInvite(undefined, NOW)).toEqual({ valid: false, reason: 'missing' });
    });
  });

  describe('revoked invite', () => {
    it('returns { valid: false, reason: "revoked" } when revoked is true', () => {
      const invite: InviteRecord = { ...validInvite, revoked: true };
      expect(evaluateInvite(invite, NOW)).toEqual({ valid: false, reason: 'revoked' });
    });

    it('does not treat revoked: false as revoked', () => {
      const invite: InviteRecord = { ...validInvite, revoked: false };
      const result = evaluateInvite(invite, NOW);
      expect(result.valid).toBe(true);
    });
  });

  describe('expired invite', () => {
    it('returns { valid: false, reason: "expired" } when expiresAt is in the past', () => {
      const invite: InviteRecord = { ...validInvite, expiresAt: '2024-06-01T00:00:00.000Z' };
      expect(evaluateInvite(invite, NOW)).toEqual({ valid: false, reason: 'expired' });
    });

    it('returns expired when expiresAt equals now exactly (boundary: expired)', () => {
      const invite: InviteRecord = { ...validInvite, expiresAt: NOW.toISOString() };
      expect(evaluateInvite(invite, NOW)).toEqual({ valid: false, reason: 'expired' });
    });

    it('is valid when expiresAt is 1 ms in the future', () => {
      const future = new Date(NOW.getTime() + 1).toISOString();
      const invite: InviteRecord = { ...validInvite, expiresAt: future };
      expect(evaluateInvite(invite, NOW).valid).toBe(true);
    });

    it('is valid when no expiresAt is present', () => {
      const invite: InviteRecord = { ...validInvite };
      expect(evaluateInvite(invite, NOW).valid).toBe(true);
    });
  });

  describe('exhausted invite', () => {
    it('returns { valid: false, reason: "exhausted" } when usedCount equals maxUses', () => {
      const invite: InviteRecord = { ...validInvite, maxUses: 5, usedCount: 5 };
      expect(evaluateInvite(invite, NOW)).toEqual({ valid: false, reason: 'exhausted' });
    });

    it('returns exhausted when usedCount exceeds maxUses', () => {
      const invite: InviteRecord = { ...validInvite, maxUses: 3, usedCount: 10 };
      expect(evaluateInvite(invite, NOW)).toEqual({ valid: false, reason: 'exhausted' });
    });

    it('treats missing usedCount as 0 when checking exhausted', () => {
      const invite: InviteRecord = { ...validInvite, maxUses: 0 };
      expect(evaluateInvite(invite, NOW)).toEqual({ valid: false, reason: 'exhausted' });
    });

    it('is valid when usedCount is one less than maxUses', () => {
      const invite: InviteRecord = { ...validInvite, maxUses: 5, usedCount: 4 };
      expect(evaluateInvite(invite, NOW).valid).toBe(true);
    });

    it('is valid when no maxUses is set', () => {
      const invite: InviteRecord = { ...validInvite, usedCount: 9999 };
      expect(evaluateInvite(invite, NOW).valid).toBe(true);
    });
  });

  describe('valid invite', () => {
    it('returns { valid: true } for a plain invite with no restrictions', () => {
      const result = evaluateInvite({ codeHash: 'x' }, NOW);
      expect(result).toEqual({ valid: true, groupId: undefined, groupName: undefined });
    });

    it('includes groupId and groupName in the result when present', () => {
      const result = evaluateInvite(validInvite, NOW);
      expect(result).toEqual({ valid: true, groupId: 'grp-1', groupName: 'Alpha Group' });
    });

    it('uses the current time by default (smoke test)', () => {
      const invite: InviteRecord = { codeHash: 'x', expiresAt: '2099-01-01T00:00:00.000Z' };
      expect(evaluateInvite(invite).valid).toBe(true);
    });

    it('returns role: "admin" when the invite has role "admin"', () => {
      const result = evaluateInvite({ codeHash: 'x', role: 'admin' }, NOW);
      expect(result.valid).toBe(true);
      expect(result.role).toBe('admin');
    });

    it('returns role: "member" when the invite has role "member"', () => {
      const result = evaluateInvite({ codeHash: 'x', role: 'member' }, NOW);
      expect(result.valid).toBe(true);
      expect(result.role).toBe('member');
    });

    it('returns role: undefined when the invite has no role', () => {
      const result = evaluateInvite({ codeHash: 'x' }, NOW);
      expect(result.valid).toBe(true);
      expect(result.role).toBeUndefined();
    });

    it('invite with expiresAt in the future and headroom from maxUses is valid', () => {
      const invite: InviteRecord = {
        ...validInvite,
        expiresAt: '2099-01-01T00:00:00.000Z',
        maxUses: 10,
        usedCount: 3,
      };
      expect(evaluateInvite(invite, NOW).valid).toBe(true);
    });
  });
});
