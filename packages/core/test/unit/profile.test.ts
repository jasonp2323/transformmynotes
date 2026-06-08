import { describe, it, expect } from 'vitest';
import { buildUserProfileItem } from '../../src/auth/profile';
import type { BuildUserProfileInput } from '../../src/auth/profile';

describe('buildUserProfileItem', () => {
  const baseInput: BuildUserProfileInput = {
    sub: 'test-sub-001',
    email: 'user@example.com',
    status: 'pending',
    role: 'member',
  };

  describe('primary key attributes', () => {
    it('sets pk to USER#<sub>', () => {
      const result = buildUserProfileItem(baseInput);
      expect(result.pk).toBe('USER#test-sub-001');
    });

    it('sets sk to PROFILE', () => {
      const result = buildUserProfileItem(baseInput);
      expect(result.sk).toBe('PROFILE');
    });

    it('uses sub correctly in pk for different subs', () => {
      const result = buildUserProfileItem({ ...baseInput, sub: 'cognito-xyz-789' });
      expect(result.pk).toBe('USER#cognito-xyz-789');
    });
  });

  describe('GSI1 key attributes', () => {
    it('sets gsi1pk to STATUS#<status>', () => {
      const result = buildUserProfileItem(baseInput);
      expect(result.gsi1pk).toBe('STATUS#pending');
    });

    it('sets gsi1sk to the createdAt timestamp', () => {
      const createdAt = '2024-03-15T08:00:00.000Z';
      const result = buildUserProfileItem({ ...baseInput, createdAt });
      expect(result.gsi1sk).toBe(createdAt);
    });

    it('sets gsi1pk correctly for active status', () => {
      const result = buildUserProfileItem({ ...baseInput, status: 'active' });
      expect(result.gsi1pk).toBe('STATUS#active');
    });

    it('sets gsi1pk correctly for disabled status', () => {
      const result = buildUserProfileItem({ ...baseInput, status: 'disabled' });
      expect(result.gsi1pk).toBe('STATUS#disabled');
    });
  });

  describe('status and role propagation', () => {
    it('propagates status field', () => {
      const result = buildUserProfileItem({ ...baseInput, status: 'active' });
      expect(result.status).toBe('active');
    });

    it('propagates role field', () => {
      const result = buildUserProfileItem({ ...baseInput, role: 'admin' });
      expect(result.role).toBe('admin');
    });

    it('propagates member role', () => {
      const result = buildUserProfileItem({ ...baseInput, role: 'member' });
      expect(result.role).toBe('member');
    });
  });

  describe('email and sub propagation', () => {
    it('propagates email', () => {
      const result = buildUserProfileItem({ ...baseInput, email: 'other@example.com' });
      expect(result.email).toBe('other@example.com');
    });

    it('propagates sub', () => {
      const result = buildUserProfileItem(baseInput);
      expect(result.sub).toBe('test-sub-001');
    });
  });

  describe('name defaults', () => {
    it('defaults name to empty string when not provided', () => {
      const result = buildUserProfileItem(baseInput);
      expect(result.name).toBe('');
    });

    it('uses provided name when present', () => {
      const result = buildUserProfileItem({ ...baseInput, name: 'Alice' });
      expect(result.name).toBe('Alice');
    });
  });

  describe('groupIds defaults', () => {
    it('defaults groupIds to an empty array when not provided', () => {
      const result = buildUserProfileItem(baseInput);
      expect(result.groupIds).toEqual([]);
    });

    it('uses provided groupIds when present', () => {
      const result = buildUserProfileItem({ ...baseInput, groupIds: ['grp-1', 'grp-2'] });
      expect(result.groupIds).toEqual(['grp-1', 'grp-2']);
    });
  });

  describe('noteCount', () => {
    it('always sets noteCount to 0', () => {
      const result = buildUserProfileItem(baseInput);
      expect(result.noteCount).toBe(0);
    });
  });

  describe('timestamps', () => {
    it('sets updatedAt to now-ish (within 5 seconds)', () => {
      const before = new Date();
      const result = buildUserProfileItem(baseInput);
      const after = new Date();
      const updatedAt = new Date(result.updatedAt);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(updatedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    it('defaults createdAt to now-ish (within 5 seconds) when not provided', () => {
      const before = new Date();
      const result = buildUserProfileItem(baseInput);
      const after = new Date();
      const createdAt = new Date(result.createdAt);
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    it('preserves explicit createdAt', () => {
      const createdAt = '2023-01-01T00:00:00.000Z';
      const result = buildUserProfileItem({ ...baseInput, createdAt });
      expect(result.createdAt).toBe('2023-01-01T00:00:00.000Z');
    });

    it('uses explicit createdAt in gsi1sk', () => {
      const createdAt = '2023-06-01T12:00:00.000Z';
      const result = buildUserProfileItem({ ...baseInput, createdAt });
      expect(result.gsi1sk).toBe(createdAt);
    });

    it('uses explicit now for updatedAt', () => {
      const now = '2024-12-01T10:00:00.000Z';
      const result = buildUserProfileItem({ ...baseInput, now });
      expect(result.updatedAt).toBe(now);
    });

    it('falls back to now for createdAt when only now is provided', () => {
      const now = '2024-11-15T09:00:00.000Z';
      const result = buildUserProfileItem({ ...baseInput, now });
      expect(result.createdAt).toBe(now);
    });

    it('explicit createdAt takes precedence over now for createdAt', () => {
      const now = '2024-12-01T10:00:00.000Z';
      const createdAt = '2024-01-01T00:00:00.000Z';
      const result = buildUserProfileItem({ ...baseInput, now, createdAt });
      expect(result.createdAt).toBe(createdAt);
      expect(result.updatedAt).toBe(now);
    });
  });
});
