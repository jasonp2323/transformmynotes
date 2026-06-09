import { describe, it, expect } from 'vitest';
import { buildAccessRequestItem } from '../../src/auth/access-request';
import type { BuildAccessRequestInput } from '../../src/auth/access-request';

describe('buildAccessRequestItem', () => {
  const baseInput: BuildAccessRequestInput = {
    id: 'req-001',
    email: 'user@example.com',
  };

  describe('primary key attributes', () => {
    it('sets pk to ACCESSREQ#<id>', () => {
      const result = buildAccessRequestItem(baseInput);
      expect(result.pk).toBe('ACCESSREQ#req-001');
    });

    it('sets sk to REQUEST', () => {
      const result = buildAccessRequestItem(baseInput);
      expect(result.sk).toBe('REQUEST');
    });

    it('uses id correctly in pk for different ids', () => {
      const result = buildAccessRequestItem({ ...baseInput, id: 'some-uuid-xyz' });
      expect(result.pk).toBe('ACCESSREQ#some-uuid-xyz');
    });
  });

  describe('GSI1 key attributes', () => {
    it('sets gsi1pk to ACCESSREQ_STATUS#new by default', () => {
      const result = buildAccessRequestItem(baseInput);
      expect(result.gsi1pk).toBe('ACCESSREQ_STATUS#new');
    });

    it('sets gsi1sk to the createdAt timestamp', () => {
      const createdAt = '2024-03-15T08:00:00.000Z';
      const result = buildAccessRequestItem({ ...baseInput, createdAt });
      expect(result.gsi1sk).toBe(createdAt);
    });

    it('sets gsi1pk correctly for approved status', () => {
      const result = buildAccessRequestItem({ ...baseInput, status: 'approved' });
      expect(result.gsi1pk).toBe('ACCESSREQ_STATUS#approved');
    });

    it('sets gsi1pk correctly for dismissed status', () => {
      const result = buildAccessRequestItem({ ...baseInput, status: 'dismissed' });
      expect(result.gsi1pk).toBe('ACCESSREQ_STATUS#dismissed');
    });
  });

  describe('status defaults', () => {
    it('defaults status to "new" when not provided', () => {
      const result = buildAccessRequestItem(baseInput);
      expect(result.status).toBe('new');
    });

    it('uses provided status when present', () => {
      const result = buildAccessRequestItem({ ...baseInput, status: 'approved' });
      expect(result.status).toBe('approved');
    });

    it('uses dismissed status when provided', () => {
      const result = buildAccessRequestItem({ ...baseInput, status: 'dismissed' });
      expect(result.status).toBe('dismissed');
    });
  });

  describe('name defaults', () => {
    it('defaults name to empty string when not provided', () => {
      const result = buildAccessRequestItem(baseInput);
      expect(result.name).toBe('');
    });

    it('uses provided name when present', () => {
      const result = buildAccessRequestItem({ ...baseInput, name: 'Alice' });
      expect(result.name).toBe('Alice');
    });
  });

  describe('note handling', () => {
    it('omits note key when note is not provided', () => {
      const result = buildAccessRequestItem(baseInput);
      expect('note' in result).toBe(false);
    });

    it('sets note when provided', () => {
      const result = buildAccessRequestItem({ ...baseInput, note: 'Looking forward to it' });
      expect(result.note).toBe('Looking forward to it');
    });

    it('omits note key when note is explicitly undefined', () => {
      const result = buildAccessRequestItem({ ...baseInput, note: undefined });
      expect('note' in result).toBe(false);
    });
  });

  describe('id and email propagation', () => {
    it('propagates id', () => {
      const result = buildAccessRequestItem(baseInput);
      expect(result.id).toBe('req-001');
    });

    it('propagates email', () => {
      const result = buildAccessRequestItem({ ...baseInput, email: 'other@example.com' });
      expect(result.email).toBe('other@example.com');
    });
  });

  describe('timestamps', () => {
    it('sets updatedAt to now-ish (within 5 seconds)', () => {
      const before = new Date();
      const result = buildAccessRequestItem(baseInput);
      const after = new Date();
      const updatedAt = new Date(result.updatedAt);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(updatedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    it('defaults createdAt to now-ish (within 5 seconds) when not provided', () => {
      const before = new Date();
      const result = buildAccessRequestItem(baseInput);
      const after = new Date();
      const createdAt = new Date(result.createdAt);
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    it('preserves explicit createdAt', () => {
      const createdAt = '2023-01-01T00:00:00.000Z';
      const result = buildAccessRequestItem({ ...baseInput, createdAt });
      expect(result.createdAt).toBe('2023-01-01T00:00:00.000Z');
    });

    it('uses explicit createdAt in gsi1sk', () => {
      const createdAt = '2023-06-01T12:00:00.000Z';
      const result = buildAccessRequestItem({ ...baseInput, createdAt });
      expect(result.gsi1sk).toBe(createdAt);
    });

    it('uses explicit now for updatedAt', () => {
      const now = '2024-12-01T10:00:00.000Z';
      const result = buildAccessRequestItem({ ...baseInput, now });
      expect(result.updatedAt).toBe(now);
    });

    it('falls back to now for createdAt when only now is provided', () => {
      const now = '2024-11-15T09:00:00.000Z';
      const result = buildAccessRequestItem({ ...baseInput, now });
      expect(result.createdAt).toBe(now);
    });

    it('explicit createdAt takes precedence over now for createdAt', () => {
      const now = '2024-12-01T10:00:00.000Z';
      const createdAt = '2024-01-01T00:00:00.000Z';
      const result = buildAccessRequestItem({ ...baseInput, now, createdAt });
      expect(result.createdAt).toBe(createdAt);
      expect(result.updatedAt).toBe(now);
    });
  });
});
