import { describe, it, expect } from 'vitest';
import { extractGroups, isAdmin, isAdminRoute } from './auth-gate';

describe('extractGroups', () => {
  it('returns the array when cognito:groups is a string[]', () => {
    expect(extractGroups({ 'cognito:groups': ['admin', 'member'] })).toEqual(['admin', 'member']);
  });

  it('returns empty array when cognito:groups is absent', () => {
    expect(extractGroups({})).toEqual([]);
  });

  it('returns empty array when cognito:groups is not an array', () => {
    expect(extractGroups({ 'cognito:groups': 'admin' })).toEqual([]);
    expect(extractGroups({ 'cognito:groups': 42 })).toEqual([]);
    expect(extractGroups({ 'cognito:groups': null })).toEqual([]);
  });

  it('filters out non-string elements from a mixed-type array', () => {
    expect(extractGroups({ 'cognito:groups': ['admin', 42, null, 'member'] })).toEqual([
      'admin',
      'member',
    ]);
  });
});

describe('isAdmin', () => {
  it('returns true when claims include the admin group', () => {
    expect(isAdmin({ 'cognito:groups': ['admin', 'member'] })).toBe(true);
  });

  it('returns false when claims do not include the admin group', () => {
    expect(isAdmin({ 'cognito:groups': ['member'] })).toBe(false);
  });

  it('returns false when cognito:groups is absent', () => {
    expect(isAdmin({})).toBe(false);
  });
});

describe('isAdminRoute', () => {
  it('returns true for /admin', () => {
    expect(isAdminRoute('/admin')).toBe(true);
  });

  it('returns true for /admin/... sub-paths', () => {
    expect(isAdminRoute('/admin/pending')).toBe(true);
    expect(isAdminRoute('/admin/users/123')).toBe(true);
  });

  it('returns false for paths that merely start with the word admin', () => {
    expect(isAdminRoute('/admindash')).toBe(false);
    expect(isAdminRoute('/administrator')).toBe(false);
  });

  it('returns false for unrelated paths', () => {
    expect(isAdminRoute('/dashboard')).toBe(false);
    expect(isAdminRoute('/login')).toBe(false);
    expect(isAdminRoute('/')).toBe(false);
  });
});
