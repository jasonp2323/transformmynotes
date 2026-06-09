/**
 * Unit tests for `buildInviteItem`, `generateInviteCode`, and the extended
 * `evaluateInvite` status-field paths.
 *
 * `hashInviteCode` and the core `evaluateInvite` paths (revoked boolean,
 * expiresAt, maxUses/usedCount) are already covered in invite.test.ts — this
 * file focuses on the newer surfaces added in M2.7 Phase A.
 */

import { describe, it, expect } from 'vitest';
import {
  buildInviteItem,
  generateInviteCode,
  evaluateInvite,
  hashInviteCode,
} from '../../src/auth/invite';
import type { InviteRecord } from '../../src/auth/invite';

// ---------------------------------------------------------------------------
// buildInviteItem
// ---------------------------------------------------------------------------

describe('buildInviteItem', () => {
  const BASE_HASH = hashInviteCode('TESTCODE');
  const FIXED_TS = '2024-06-01T10:00:00.000Z';

  describe('primary key attributes', () => {
    it('sets pk to INVITE#<codeHash>', () => {
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'code', now: FIXED_TS });
      expect(item.pk).toBe(`INVITE#${BASE_HASH}`);
    });

    it('sets sk to INVITE', () => {
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'code', now: FIXED_TS });
      expect(item.sk).toBe('INVITE');
    });
  });

  describe('GSI1 key attributes', () => {
    it('sets gsi1pk to INVITES', () => {
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'code', now: FIXED_TS });
      expect(item.gsi1pk).toBe('INVITES');
    });

    it('sets gsi1sk to <status>#<createdAt>', () => {
      const item = buildInviteItem({
        codeHash: BASE_HASH,
        type: 'code',
        status: 'pending',
        createdAt: FIXED_TS,
        now: FIXED_TS,
      });
      expect(item.gsi1sk).toBe(`pending#${FIXED_TS}`);
    });

    it('uses the resolved status in gsi1sk prefix', () => {
      const item = buildInviteItem({
        codeHash: BASE_HASH,
        type: 'code',
        status: 'revoked',
        createdAt: FIXED_TS,
        now: FIXED_TS,
      });
      expect(item.gsi1sk.startsWith('revoked#')).toBe(true);
    });
  });

  describe('defaults', () => {
    it('defaults usedCount to 0', () => {
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'code', now: FIXED_TS });
      expect(item.usedCount).toBe(0);
    });

    it('defaults status to "pending"', () => {
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'code', now: FIXED_TS });
      expect(item.status).toBe('pending');
    });

    it('defaults maxUses to 1', () => {
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'code', now: FIXED_TS });
      expect(item.maxUses).toBe(1);
    });

    it('uses explicit maxUses when provided', () => {
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'code', maxUses: 5, now: FIXED_TS });
      expect(item.maxUses).toBe(5);
    });
  });

  describe('attribute passthrough', () => {
    it('propagates codeHash', () => {
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'code', now: FIXED_TS });
      expect(item.codeHash).toBe(BASE_HASH);
    });

    it('propagates type', () => {
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'email', now: FIXED_TS });
      expect(item.type).toBe('email');
    });

    it('propagates targetEmail when provided', () => {
      const item = buildInviteItem({
        codeHash: BASE_HASH,
        type: 'email',
        targetEmail: 'alice@example.com',
        now: FIXED_TS,
      });
      expect(item.targetEmail).toBe('alice@example.com');
    });

    it('omits targetEmail when not provided', () => {
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'code', now: FIXED_TS });
      expect('targetEmail' in item).toBe(false);
    });

    it('propagates label when provided', () => {
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'code', label: 'Beta', now: FIXED_TS });
      expect(item.label).toBe('Beta');
    });

    it('propagates groupId and groupName when provided', () => {
      const item = buildInviteItem({
        codeHash: BASE_HASH,
        type: 'code',
        groupId: 'grp-42',
        groupName: 'Beta Group',
        now: FIXED_TS,
      });
      expect(item.groupId).toBe('grp-42');
      expect(item.groupName).toBe('Beta Group');
    });

    it('propagates inviterName when provided', () => {
      const item = buildInviteItem({
        codeHash: BASE_HASH,
        type: 'code',
        inviterName: 'Bob',
        now: FIXED_TS,
      });
      expect(item.inviterName).toBe('Bob');
    });

    it('propagates expiresAt when provided', () => {
      const expiresAt = '2025-01-01T00:00:00.000Z';
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'code', expiresAt, now: FIXED_TS });
      expect(item.expiresAt).toBe(expiresAt);
    });

    it('propagates createdBy when provided', () => {
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'code', createdBy: 'admin-sub', now: FIXED_TS });
      expect(item.createdBy).toBe('admin-sub');
    });
  });

  describe('timestamps', () => {
    it('sets createdAt to now when not provided', () => {
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'code', now: FIXED_TS });
      expect(item.createdAt).toBe(FIXED_TS);
    });

    it('preserves explicit createdAt', () => {
      const createdAt = '2023-01-01T00:00:00.000Z';
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'code', createdAt, now: FIXED_TS });
      expect(item.createdAt).toBe(createdAt);
    });

    it('sets updatedAt to now', () => {
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'code', now: FIXED_TS });
      expect(item.updatedAt).toBe(FIXED_TS);
    });

    it('explicit createdAt takes precedence over now for createdAt but updatedAt still uses now', () => {
      const createdAt = '2022-06-01T00:00:00.000Z';
      const item = buildInviteItem({ codeHash: BASE_HASH, type: 'code', createdAt, now: FIXED_TS });
      expect(item.createdAt).toBe(createdAt);
      expect(item.updatedAt).toBe(FIXED_TS);
    });
  });
});

// ---------------------------------------------------------------------------
// generateInviteCode
// ---------------------------------------------------------------------------

describe('generateInviteCode', () => {
  it('returns a non-empty string', () => {
    const code = generateInviteCode();
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThan(0);
  });

  it('returns a string of ~8 characters', () => {
    const code = generateInviteCode();
    expect(code.length).toBe(8);
  });

  it('uses only uppercase alphanumeric characters (ambiguous chars excluded)', () => {
    // Run a few times to get a decent sample.
    for (let i = 0; i < 20; i++) {
      const code = generateInviteCode();
      // Must NOT contain ambiguous chars O, 0, I, 1.
      expect(code).not.toMatch(/[O0I1]/);
      // Must contain only chars from the allowed alphabet.
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    }
  });

  it('two consecutive calls return different codes', () => {
    const a = generateInviteCode();
    const b = generateInviteCode();
    // Probability of collision for 8-char codes is negligible; this is a
    // sanity check, not a statistical guarantee.
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// evaluateInvite — extended status-field paths (M2.7 additions)
// ---------------------------------------------------------------------------

describe('evaluateInvite — extended status checks', () => {
  const NOW = new Date('2024-06-15T12:00:00.000Z');

  describe('status field: revoked', () => {
    it('returns { valid: false, reason: "revoked" } when status is "revoked"', () => {
      const invite: InviteRecord = { codeHash: 'x', status: 'revoked' };
      expect(evaluateInvite(invite, NOW)).toEqual({ valid: false, reason: 'revoked' });
    });

    it('returns revoked even when revoked boolean is absent', () => {
      const invite: InviteRecord = { codeHash: 'x', status: 'revoked' };
      expect(invite.revoked).toBeUndefined();
      expect(evaluateInvite(invite, NOW).reason).toBe('revoked');
    });
  });

  describe('status field: used', () => {
    it('returns { valid: false, reason: "exhausted" } when status is "used"', () => {
      const invite: InviteRecord = { codeHash: 'x', status: 'used' };
      expect(evaluateInvite(invite, NOW)).toEqual({ valid: false, reason: 'exhausted' });
    });
  });

  describe('status field: expired', () => {
    it('returns { valid: false, reason: "expired" } when status is "expired"', () => {
      const invite: InviteRecord = { codeHash: 'x', status: 'expired' };
      expect(evaluateInvite(invite, NOW)).toEqual({ valid: false, reason: 'expired' });
    });
  });

  describe('status field: pending — still uses other checks', () => {
    it('status=pending with no other restrictions → valid', () => {
      const invite: InviteRecord = { codeHash: 'x', status: 'pending' };
      expect(evaluateInvite(invite, NOW).valid).toBe(true);
    });

    it('status=pending but expiresAt in the past → expired', () => {
      const invite: InviteRecord = {
        codeHash: 'x',
        status: 'pending',
        expiresAt: '2024-01-01T00:00:00.000Z',
      };
      expect(evaluateInvite(invite, NOW)).toEqual({ valid: false, reason: 'expired' });
    });

    it('status=pending but usedCount >= maxUses → exhausted', () => {
      const invite: InviteRecord = { codeHash: 'x', status: 'pending', maxUses: 3, usedCount: 3 };
      expect(evaluateInvite(invite, NOW)).toEqual({ valid: false, reason: 'exhausted' });
    });

    it('status=pending, future expiresAt, uses remaining → valid', () => {
      const invite: InviteRecord = {
        codeHash: 'x',
        status: 'pending',
        expiresAt: '2099-01-01T00:00:00.000Z',
        maxUses: 5,
        usedCount: 2,
      };
      const result = evaluateInvite(invite, NOW);
      expect(result.valid).toBe(true);
    });
  });

  describe('backwards-compat: revoked boolean still works', () => {
    it('revoked: true → { valid: false, reason: "revoked" }', () => {
      const invite: InviteRecord = { codeHash: 'x', revoked: true };
      expect(evaluateInvite(invite, NOW)).toEqual({ valid: false, reason: 'revoked' });
    });

    it('revoked: true takes priority over status=pending', () => {
      const invite: InviteRecord = { codeHash: 'x', revoked: true, status: 'pending' };
      expect(evaluateInvite(invite, NOW)).toEqual({ valid: false, reason: 'revoked' });
    });
  });
});
