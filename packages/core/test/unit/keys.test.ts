import { describe, it, expect } from 'vitest';
import { userDataKeys } from '../../src/db/keys';

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
});
