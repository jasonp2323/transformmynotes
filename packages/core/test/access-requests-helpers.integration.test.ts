/**
 * Integration test: getAccessRequest, listAccessRequestsByStatus, and
 * updateAccessRequestStatus helpers via the real production client.
 *
 * Uses the real `ddb` DocumentClient, `TableNames`, `accessRequestKeys`, and
 * the three new helpers — no mocks. The dynalite server is started by
 * `dynalite-global.ts` (globalSetup) and the production client is pointed at
 * it via env vars set in `integration-env.ts` (setupFiles).
 */

import { describe, it, expect } from 'vitest';
import { putAccessRequest } from '../src/db/access-requests.js';
import {
  getAccessRequest,
  listAccessRequestsByStatus,
  updateAccessRequestStatus,
} from '../src/db/access-requests.js';

describe('getAccessRequest — write/read round-trip', () => {
  it('returns the item after putAccessRequest', async () => {
    const id = 'helpers-get-001';
    const written = await putAccessRequest({
      id,
      name: 'Alice',
      email: 'alice-helpers@example.com',
      note: 'test note',
    });

    const fetched = await getAccessRequest(id);

    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(id);
    expect(fetched!.email).toBe('alice-helpers@example.com');
    expect(fetched!.name).toBe('Alice');
    expect(fetched!.note).toBe('test note');
    expect(fetched!.status).toBe('new');
    expect(fetched).toEqual(written);
  });

  it('returns undefined for a non-existent id', async () => {
    const fetched = await getAccessRequest('does-not-exist-helpers-xyz');
    expect(fetched).toBeUndefined();
  });
});

describe('listAccessRequestsByStatus — GSI1 round-trip', () => {
  it('includes a newly written request in the new list', async () => {
    const id = 'helpers-list-001';
    await putAccessRequest({ id, name: 'Bob', email: 'bob-helpers@example.com' });

    const items = await listAccessRequestsByStatus('new');
    expect(items.some((i) => i.id === id)).toBe(true);
  });

  it('does not include an approved request in the new list', async () => {
    const id = 'helpers-list-approved-001';
    await putAccessRequest({ id, name: 'Carol', email: 'carol-helpers@example.com' });

    // Approve it.
    await updateAccessRequestStatus(id, 'approved');

    const newItems = await listAccessRequestsByStatus('new');
    expect(newItems.some((i) => i.id === id)).toBe(false);

    const approvedItems = await listAccessRequestsByStatus('approved');
    expect(approvedItems.some((i) => i.id === id)).toBe(true);
  });
});

describe('updateAccessRequestStatus — status GSI rewrite', () => {
  it('moves item from new to approved: absent from new list, present in approved list', async () => {
    const id = 'helpers-update-001';
    await putAccessRequest({ id, name: 'Dave', email: 'dave-helpers@example.com' });

    // Confirm starts in new.
    const beforeNew = await listAccessRequestsByStatus('new');
    expect(beforeNew.some((i) => i.id === id)).toBe(true);

    const result = await updateAccessRequestStatus(id, 'approved');
    expect(result.ok).toBe(true);
    expect(result.item).toBeDefined();
    expect(result.item!.status).toBe('approved');
    expect(result.item!.gsi1pk).toBe('ACCESSREQ_STATUS#approved');
    expect(result.item!.id).toBe(id);

    // Must be GONE from the new list.
    const afterNew = await listAccessRequestsByStatus('new');
    expect(afterNew.some((i) => i.id === id)).toBe(false);

    // Must be PRESENT in the approved list.
    const afterApproved = await listAccessRequestsByStatus('approved');
    expect(afterApproved.some((i) => i.id === id)).toBe(true);
  });

  it('moves item from new to dismissed: absent from new, present in dismissed', async () => {
    const id = 'helpers-update-dismissed-001';
    await putAccessRequest({ id, name: 'Eve', email: 'eve-helpers@example.com' });

    const result = await updateAccessRequestStatus(id, 'dismissed');
    expect(result.ok).toBe(true);
    expect(result.item!.status).toBe('dismissed');
    expect(result.item!.gsi1pk).toBe('ACCESSREQ_STATUS#dismissed');

    const newItems = await listAccessRequestsByStatus('new');
    expect(newItems.some((i) => i.id === id)).toBe(false);

    const dismissedItems = await listAccessRequestsByStatus('dismissed');
    expect(dismissedItems.some((i) => i.id === id)).toBe(true);
  });

  it('returns { ok: false, reason: "not_found" } for a non-existent id', async () => {
    const result = await updateAccessRequestStatus('does-not-exist-update-xyz', 'approved');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('uses the provided now timestamp for updatedAt', async () => {
    const id = 'helpers-update-now-001';
    await putAccessRequest({ id, name: 'Frank', email: 'frank-helpers@example.com' });

    const fixedNow = new Date('2025-06-01T10:00:00.000Z');
    const result = await updateAccessRequestStatus(id, 'approved', { now: fixedNow });

    expect(result.ok).toBe(true);
    expect(result.item!.updatedAt).toBe('2025-06-01T10:00:00.000Z');
  });
});
