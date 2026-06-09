import { describe, it, expect } from 'vitest';
import { userDataKeys, accessRequestKeys } from '../../src/db/keys';
import type { UserStatus, AccessRequestStatus } from '../../src/db/keys';

describe('userDataKeys', () => {
  describe('profile', () => {
    it('returns the correct pk and sk for a given userId', () => {
      const result = userDataKeys.profile('abc-123');
      expect(result).toEqual({ pk: 'USER#abc-123', sk: 'PROFILE' });
    });

    it('interpolates the userId correctly for a different id', () => {
      const result = userDataKeys.profile('user-xyz-789');
      expect(result.pk).toBe('USER#user-xyz-789');
    });

    it('sk is always PROFILE regardless of userId', () => {
      expect(userDataKeys.profile('any-user').sk).toBe('PROFILE');
      expect(userDataKeys.profile('another-user').sk).toBe('PROFILE');
    });

    it('pk prefixes the userId with USER#', () => {
      const userId = 'cognito-sub-12345';
      const { pk } = userDataKeys.profile(userId);
      expect(pk).toBe(`USER#${userId}`);
    });
  });

  describe('statusIndex', () => {
    it('sets gsi1pk to STATUS#<status>', () => {
      const result = userDataKeys.statusIndex('pending', '2024-01-01T00:00:00.000Z');
      expect(result.gsi1pk).toBe('STATUS#pending');
    });

    it('passes createdAt through as gsi1sk unchanged', () => {
      const createdAt = '2024-06-15T12:34:56.789Z';
      const result = userDataKeys.statusIndex('active', createdAt);
      expect(result.gsi1sk).toBe(createdAt);
    });

    it('formats gsi1pk correctly for all UserStatus values', () => {
      const statuses: UserStatus[] = ['pending', 'active', 'disabled'];
      for (const status of statuses) {
        const result = userDataKeys.statusIndex(status, '2024-01-01T00:00:00.000Z');
        expect(result.gsi1pk).toBe(`STATUS#${status}`);
      }
    });

    it('returns only gsi1pk and gsi1sk (no primary keys)', () => {
      const result = userDataKeys.statusIndex('disabled', '2024-01-01T00:00:00.000Z');
      expect(Object.keys(result)).toEqual(['gsi1pk', 'gsi1sk']);
    });
  });

  describe('listByStatus', () => {
    it('sets IndexName to GSI1', () => {
      const result = userDataKeys.listByStatus('pending');
      expect(result.IndexName).toBe('GSI1');
    });

    it('sets KeyConditionExpression to gsi1pk = :gsi1pk', () => {
      const result = userDataKeys.listByStatus('active');
      expect(result.KeyConditionExpression).toBe('gsi1pk = :gsi1pk');
    });

    it('sets the :gsi1pk expression attribute value to STATUS#<status>', () => {
      const result = userDataKeys.listByStatus('pending');
      expect(result.ExpressionAttributeValues[':gsi1pk']).toBe('STATUS#pending');
    });

    it('produces the correct value for each status', () => {
      const statuses: UserStatus[] = ['pending', 'active', 'disabled'];
      for (const status of statuses) {
        const result = userDataKeys.listByStatus(status);
        expect(result.ExpressionAttributeValues[':gsi1pk']).toBe(`STATUS#${status}`);
      }
    });
  });
});

describe('accessRequestKeys', () => {
  describe('request', () => {
    it('returns the correct pk and sk for a given id', () => {
      const result = accessRequestKeys.request('req-abc-123');
      expect(result).toEqual({ pk: 'ACCESSREQ#req-abc-123', sk: 'REQUEST' });
    });

    it('interpolates the id correctly for a different id', () => {
      const result = accessRequestKeys.request('some-uuid-xyz');
      expect(result.pk).toBe('ACCESSREQ#some-uuid-xyz');
    });

    it('sk is always REQUEST regardless of id', () => {
      expect(accessRequestKeys.request('a').sk).toBe('REQUEST');
      expect(accessRequestKeys.request('b').sk).toBe('REQUEST');
    });

    it('pk prefixes the id with ACCESSREQ#', () => {
      const id = 'uuid-12345';
      const { pk } = accessRequestKeys.request(id);
      expect(pk).toBe(`ACCESSREQ#${id}`);
    });
  });

  describe('statusIndex', () => {
    it('sets gsi1pk to ACCESSREQ_STATUS#<status>', () => {
      const result = accessRequestKeys.statusIndex('new', '2024-01-01T00:00:00.000Z');
      expect(result.gsi1pk).toBe('ACCESSREQ_STATUS#new');
    });

    it('passes createdAt through as gsi1sk unchanged', () => {
      const createdAt = '2024-06-15T12:34:56.789Z';
      const result = accessRequestKeys.statusIndex('approved', createdAt);
      expect(result.gsi1sk).toBe(createdAt);
    });

    it('formats gsi1pk correctly for all AccessRequestStatus values', () => {
      const statuses: AccessRequestStatus[] = ['new', 'approved', 'dismissed'];
      for (const status of statuses) {
        const result = accessRequestKeys.statusIndex(status, '2024-01-01T00:00:00.000Z');
        expect(result.gsi1pk).toBe(`ACCESSREQ_STATUS#${status}`);
      }
    });

    it('returns only gsi1pk and gsi1sk (no primary keys)', () => {
      const result = accessRequestKeys.statusIndex('dismissed', '2024-01-01T00:00:00.000Z');
      expect(Object.keys(result)).toEqual(['gsi1pk', 'gsi1sk']);
    });
  });

  describe('listByStatus', () => {
    it('sets IndexName to GSI1', () => {
      const result = accessRequestKeys.listByStatus('new');
      expect(result.IndexName).toBe('GSI1');
    });

    it('sets KeyConditionExpression to gsi1pk = :gsi1pk', () => {
      const result = accessRequestKeys.listByStatus('approved');
      expect(result.KeyConditionExpression).toBe('gsi1pk = :gsi1pk');
    });

    it('sets the :gsi1pk expression attribute value to ACCESSREQ_STATUS#<status>', () => {
      const result = accessRequestKeys.listByStatus('new');
      expect(result.ExpressionAttributeValues[':gsi1pk']).toBe('ACCESSREQ_STATUS#new');
    });

    it('produces the correct value for each status', () => {
      const statuses: AccessRequestStatus[] = ['new', 'approved', 'dismissed'];
      for (const status of statuses) {
        const result = accessRequestKeys.listByStatus(status);
        expect(result.ExpressionAttributeValues[':gsi1pk']).toBe(`ACCESSREQ_STATUS#${status}`);
      }
    });
  });
});
