import { describe, it, expect } from 'vitest';
import { adminActiveFromPath } from './adminActive';

describe('adminActiveFromPath', () => {
  it('returns "pending" for /admin/pending', () => {
    expect(adminActiveFromPath('/admin/pending')).toBe('pending');
  });

  it('returns "pending" for sub-paths under /admin/pending', () => {
    expect(adminActiveFromPath('/admin/pending/123')).toBe('pending');
  });

  it('returns "members" for /admin/members', () => {
    expect(adminActiveFromPath('/admin/members')).toBe('members');
  });

  it('returns "members" for /admin/users (legacy alias)', () => {
    expect(adminActiveFromPath('/admin/users')).toBe('members');
  });

  it('returns "members" for sub-paths under /admin/users', () => {
    expect(adminActiveFromPath('/admin/users/abc')).toBe('members');
  });

  it('returns "invites" for /admin/invites', () => {
    expect(adminActiveFromPath('/admin/invites')).toBe('invites');
  });

  it('returns "invites" for sub-paths under /admin/invites', () => {
    expect(adminActiveFromPath('/admin/invites/xyz')).toBe('invites');
  });

  it('returns undefined for bare /admin', () => {
    expect(adminActiveFromPath('/admin')).toBeUndefined();
  });

  it('returns "ai-settings" for /admin/ai-settings', () => {
    expect(adminActiveFromPath('/admin/ai-settings')).toBe('ai-settings');
  });

  it('returns "ai-settings" for sub-paths under /admin/ai-settings', () => {
    expect(adminActiveFromPath('/admin/ai-settings/versions')).toBe('ai-settings');
  });

  it('returns undefined for an unrelated path', () => {
    expect(adminActiveFromPath('/dashboard')).toBeUndefined();
    expect(adminActiveFromPath('/library')).toBeUndefined();
    expect(adminActiveFromPath('/')).toBeUndefined();
  });
});
