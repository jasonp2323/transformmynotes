import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the core module before importing the function under test
vi.mock('@transformmynotes/core', () => ({
  listAccessRequestsByStatus: vi.fn(),
}));

import { listAccessRequestsByStatus } from '@transformmynotes/core';
import { getPendingAccessRequestCount } from './pending-count';

describe('getPendingAccessRequestCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the length of the list when requests exist', async () => {
    vi.mocked(listAccessRequestsByStatus).mockResolvedValue([
      { id: '1' } as any,
      { id: '2' } as any,
      { id: '3' } as any,
    ]);
    expect(await getPendingAccessRequestCount()).toBe(3);
    expect(listAccessRequestsByStatus).toHaveBeenCalledWith('new');
  });

  it('returns 0 when the list is empty', async () => {
    vi.mocked(listAccessRequestsByStatus).mockResolvedValue([]);
    expect(await getPendingAccessRequestCount()).toBe(0);
  });

  it('returns 1 when exactly one request exists', async () => {
    vi.mocked(listAccessRequestsByStatus).mockResolvedValue([{ id: '1' } as any]);
    expect(await getPendingAccessRequestCount()).toBe(1);
  });
});
