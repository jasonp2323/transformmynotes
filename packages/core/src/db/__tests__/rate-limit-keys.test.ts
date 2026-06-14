import { describe, it, expect } from 'vitest';
import { rateLimitKeys } from '../keys.js';

describe('rateLimitKeys.counter', () => {
  it('returns the correct pk and sk for a given route, ip, and windowStart', () => {
    const key = rateLimitKeys.counter('login', '1.2.3.4', '1700000000');
    expect(key).toEqual({
      pk: 'RATELIMIT#login',
      sk: 'IP#1.2.3.4#WIN#1700000000',
    });
  });

  it('encodes route correctly in pk', () => {
    const key = rateLimitKeys.counter('signup', '10.0.0.1', '1700001000');
    expect(key.pk).toBe('RATELIMIT#signup');
  });

  it('encodes ip and windowStart correctly in sk', () => {
    const key = rateLimitKeys.counter('login', '192.168.1.100', '1700002000');
    expect(key.sk).toBe('IP#192.168.1.100#WIN#1700002000');
  });
});
