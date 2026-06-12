import { listAccessRequestsByStatus } from '@transformmynotes/core';

/**
 * Returns the number of access requests with status 'new'.
 * Used to badge the Admin nav's "Pending" item.
 */
export async function getPendingAccessRequestCount(): Promise<number> {
  const requests = await listAccessRequestsByStatus('new');
  return requests.length;
}
