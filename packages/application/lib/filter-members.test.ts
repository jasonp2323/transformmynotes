import { describe, it, expect } from 'vitest';
import { filterMembers } from './filter-members';
import type { UserProfileItem } from '@transformmynotes/core';

function makeUser(overrides: Partial<UserProfileItem>): UserProfileItem {
  return {
    pk: 'USER#sub1',
    sk: 'PROFILE',
    gsi1pk: 'STATUS#active',
    gsi1sk: '2024-01-01T00:00:00.000Z#sub1',
    sub: 'sub1',
    email: 'user@example.com',
    name: 'Test User',
    status: 'active',
    role: 'member',
    groupIds: [],
    noteCount: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const alice = makeUser({ sub: 'alice', name: 'Alice Smith', email: 'alice@example.com' });
const bob = makeUser({ sub: 'bob', name: 'Bob Jones', email: 'bob@example.com' });
const charlie = makeUser({ sub: 'charlie', name: 'Charlie Brown', email: 'charlie@test.org' });

describe('filterMembers', () => {
  it('returns all users when query is empty', () => {
    expect(filterMembers([alice, bob, charlie], '')).toEqual([alice, bob, charlie]);
  });

  it('returns all users when query is whitespace only', () => {
    expect(filterMembers([alice, bob, charlie], '   ')).toEqual([alice, bob, charlie]);
  });

  it('matches by name (substring)', () => {
    const result = filterMembers([alice, bob, charlie], 'Alice');
    expect(result).toEqual([alice]);
  });

  it('matches by email (substring)', () => {
    const result = filterMembers([alice, bob, charlie], 'test.org');
    expect(result).toEqual([charlie]);
  });

  it('is case-insensitive for name match', () => {
    expect(filterMembers([alice, bob], 'ALICE')).toEqual([alice]);
    expect(filterMembers([alice, bob], 'alice')).toEqual([alice]);
  });

  it('is case-insensitive for email match', () => {
    expect(filterMembers([alice, bob], 'BOB@EXAMPLE')).toEqual([bob]);
  });

  it('returns empty array when no users match', () => {
    expect(filterMembers([alice, bob, charlie], 'zzznomatch')).toEqual([]);
  });

  it('returns multiple matches when several users match the query', () => {
    const result = filterMembers([alice, bob, charlie], 'example.com');
    expect(result).toEqual([alice, bob]);
  });
});
