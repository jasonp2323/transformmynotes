/**
 * Integration test: share item shape + access patterns via the real `ddb`
 * DocumentClient backed by dynalite (in-memory DynamoDB).
 *
 * Exercises `shareKeys`, `buildShareItem`, `putShareItem`, `getShareItem`,
 * `listSharesForRecipient`, `listSharesForNote`, and `authoriseNoteRead`.
 *
 * The dynalite server is started by `dynalite-global.ts` (globalSetup) and the
 * production client is pointed at it via env vars set in `integration-env.ts`
 * (setupFiles).
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems; all
 * items are written with individual PutCommands, mirroring the pattern used
 * throughout the integration suite.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { shareKeys } from '../src/db/keys.js';
import {
  buildShareItem,
  putShareItem,
  listSharesForRecipient,
  listSharesForNote,
  authoriseNoteRead,
  revokeShareItem,
  revokeAllSharesForNote,
} from '../src/db/shares.js';

// ---------------------------------------------------------------------------
// Unique identifiers — avoids collisions with other test suites sharing dynalite
// ---------------------------------------------------------------------------

const OWNER_SUB = 'sub-sh-owner-001';
const OWNER_NAME = 'Alice Sharer';
const RECIPIENT_A = 'sub-sh-recip-A-001';
const RECIPIENT_B = 'sub-sh-recip-B-001';
const UNRELATED_SUB = 'sub-sh-unrelated-001';
const NOTE_ID = '01JXXXXXXXXXXXXXXXXXSH001';
const NOTE_TITLE = 'Shared Integration Note';
const GROUP_ID = 'group-sh-001';

// A second note used for the legacy soft-delete test
const NOTE_ID_REVOKED = '01JXXXXXXXXXXXXXXXXXSH002';
const RECIPIENT_REVOKED = 'sub-sh-recip-revoked-001';

// Identifiers for the revokeShareItem and revokeAllSharesForNote tests
const OWNER_SUB_R = 'sub-sh-owner-revoke-001';
const OWNER_NAME_R = 'Bob Revoker';
const RECIPIENT_RA = 'sub-sh-recip-ra-001';
const RECIPIENT_RB = 'sub-sh-recip-rb-001';
const NOTE_ID_R = '01JXXXXXXXXXXXXXXXXXSH010';
const NOTE_TITLE_R = 'Revokable Note';
const GROUP_ID_R = 'group-revoke-001';

// Identifiers for revokeAllSharesForNote test
const OWNER_SUB_R2 = 'sub-sh-owner-revoke-002';
const OWNER_NAME_R2 = 'Carol Revoker';
const RECIPIENT_RC = 'sub-sh-recip-rc-001';
const RECIPIENT_RD = 'sub-sh-recip-rd-001';
const NOTE_ID_R2 = '01JXXXXXXXXXXXXXXXXXSH020';
const NOTE_TITLE_R2 = 'Revokable Note 2';
const GROUP_ID_R2 = 'group-revoke-002';

// ---------------------------------------------------------------------------
// Setup: create two ACTIVE share items (owner → recipientA, owner → recipientB)
// ---------------------------------------------------------------------------

describe('shares — setup: putShareItem for two recipients', () => {
  it('writes an active share for recipient A', async () => {
    const item = await putShareItem({
      ownerSub: OWNER_SUB,
      ownerName: OWNER_NAME,
      recipientSub: RECIPIENT_A,
      noteId: NOTE_ID,
      noteTitle: NOTE_TITLE,
      groupId: GROUP_ID,
      sharedAt: '2025-06-10T10:00:00.000Z',
    });

    expect(item.pk).toBe(`USER#${OWNER_SUB}`);
    expect(item.sk).toBe(`SHARE#${NOTE_ID}#RECIPIENT#${RECIPIENT_A}`);
    expect(item.gsi4pk).toBe(`USER#${RECIPIENT_A}`);
    expect(item.gsi4sk).toBe('SHARED_AT#2025-06-10T10:00:00.000Z');
    expect(item.ownerSub).toBe(OWNER_SUB);
    expect(item.noteId).toBe(NOTE_ID);
    expect(item.permission).toBe('read');
    expect(item.revokedAt).toBeUndefined();
  });

  it('writes an active share for recipient B', async () => {
    const item = await putShareItem({
      ownerSub: OWNER_SUB,
      ownerName: OWNER_NAME,
      recipientSub: RECIPIENT_B,
      noteId: NOTE_ID,
      noteTitle: NOTE_TITLE,
      groupId: GROUP_ID,
      sharedAt: '2025-06-10T11:00:00.000Z',
    });

    expect(item.pk).toBe(`USER#${OWNER_SUB}`);
    expect(item.sk).toBe(`SHARE#${NOTE_ID}#RECIPIENT#${RECIPIENT_B}`);
    expect(item.gsi4pk).toBe(`USER#${RECIPIENT_B}`);
    expect(item.noteId).toBe(NOTE_ID);
  });
});

// ---------------------------------------------------------------------------
// listSharesForRecipient — GSI4 queries scoped by recipient
// ---------------------------------------------------------------------------

describe('listSharesForRecipient', () => {
  it("returns exactly recipient A's share and no others", async () => {
    const items = await listSharesForRecipient(RECIPIENT_A);
    expect(items).toHaveLength(1);
    const [share] = items;
    expect(share.noteId).toBe(NOTE_ID);
    expect(share.ownerSub).toBe(OWNER_SUB);
    expect(share.noteTitle).toBe(NOTE_TITLE);
    expect(share.recipientSub).toBe(RECIPIENT_A);
    // Confirm recipient B's share is NOT returned
    expect(items.some((s) => s.recipientSub === RECIPIENT_B)).toBe(false);
  });

  it("returns exactly recipient B's share and no others", async () => {
    const items = await listSharesForRecipient(RECIPIENT_B);
    expect(items).toHaveLength(1);
    const [share] = items;
    expect(share.noteId).toBe(NOTE_ID);
    expect(share.recipientSub).toBe(RECIPIENT_B);
    // Confirm recipient A's share is NOT returned
    expect(items.some((s) => s.recipientSub === RECIPIENT_A)).toBe(false);
  });

  it('returns an empty array for an unrelated sub with no shares', async () => {
    const items = await listSharesForRecipient(UNRELATED_SUB);
    expect(items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listSharesForNote — base-table query for all shares on a note
// ---------------------------------------------------------------------------

describe('listSharesForNote', () => {
  it('returns both shares (recipient A and B) for the shared note', async () => {
    const items = await listSharesForNote(OWNER_SUB, NOTE_ID);
    expect(items).toHaveLength(2);
    const subs = items.map((s) => s.recipientSub);
    expect(subs).toContain(RECIPIENT_A);
    expect(subs).toContain(RECIPIENT_B);
  });

  it('returns an empty array for a note with no shares', async () => {
    const items = await listSharesForNote(OWNER_SUB, 'note-that-does-not-exist');
    expect(items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseShareSk — recover noteId + recipientSub from a share item sk
// ---------------------------------------------------------------------------

describe('sharesByNoteQuery + parseShareSk round-trip', () => {
  it('recovers noteId and recipientSub from each share sk', async () => {
    const items = await listSharesForNote(OWNER_SUB, NOTE_ID);
    expect(items.length).toBeGreaterThanOrEqual(2);

    for (const item of items) {
      const parsed = shareKeys.parseShareSk(item.sk);
      expect(parsed.noteId).toBe(NOTE_ID);
      expect([RECIPIENT_A, RECIPIENT_B]).toContain(parsed.recipientSub);
    }
  });
});

// ---------------------------------------------------------------------------
// authoriseNoteRead — using the real ddb client (integration path)
// ---------------------------------------------------------------------------

describe('authoriseNoteRead (integration)', () => {
  it('returns true for the note owner (no DB call needed, but passes integration)', async () => {
    const result = await authoriseNoteRead(OWNER_SUB, OWNER_SUB, NOTE_ID);
    expect(result).toBe(true);
  });

  it('returns true for recipient A (active share exists)', async () => {
    const result = await authoriseNoteRead(RECIPIENT_A, OWNER_SUB, NOTE_ID);
    expect(result).toBe(true);
  });

  it('returns false for an unrelated user (no share record)', async () => {
    const result = await authoriseNoteRead(UNRELATED_SUB, OWNER_SUB, NOTE_ID);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Soft-delete / revoke: revoked share is excluded from listSharesForRecipient
// and authoriseNoteRead returns false
// ---------------------------------------------------------------------------

describe('soft-delete (revokedAt) filter', () => {
  it('setup: writes a share for NOTE_ID_REVOKED then soft-deletes it', async () => {
    // First write an active share
    const activeShare = buildShareItem({
      ownerSub: OWNER_SUB,
      ownerName: OWNER_NAME,
      recipientSub: RECIPIENT_REVOKED,
      noteId: NOTE_ID_REVOKED,
      noteTitle: 'Revoked Note',
      groupId: GROUP_ID,
      sharedAt: '2025-06-09T09:00:00.000Z',
    });

    // Then overwrite with a revoked copy (individual PutCommand — no TransactWrite)
    const revokedShare = {
      ...activeShare,
      revokedAt: '2025-06-10T00:00:00.000Z',
      ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
    };

    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: revokedShare,
      }),
    );
  });

  it('listSharesForRecipient EXCLUDES the revoked share (FilterExpression)', async () => {
    const items = await listSharesForRecipient(RECIPIENT_REVOKED);
    // The revoked share must not appear
    expect(items.some((s) => s.noteId === NOTE_ID_REVOKED)).toBe(false);
  });

  it('authoriseNoteRead returns false for the revoked recipient', async () => {
    const result = await authoriseNoteRead(RECIPIENT_REVOKED, OWNER_SUB, NOTE_ID_REVOKED);
    expect(result).toBe(false);
  });

  it('listSharesForNote still returns the revoked item (no FilterExpression on base query)', async () => {
    const items = await listSharesForNote(OWNER_SUB, NOTE_ID_REVOKED);
    expect(items).toHaveLength(1);
    expect(items[0].revokedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// revokeShareItem — UpdateCommand-based soft-delete round-trip
// ---------------------------------------------------------------------------

describe('revokeShareItem (integration)', () => {
  it('setup: shares NOTE_ID_R with recipient A and recipient B', async () => {
    await putShareItem({
      ownerSub: OWNER_SUB_R,
      ownerName: OWNER_NAME_R,
      recipientSub: RECIPIENT_RA,
      noteId: NOTE_ID_R,
      noteTitle: NOTE_TITLE_R,
      groupId: GROUP_ID_R,
      sharedAt: '2025-06-11T08:00:00.000Z',
    });
    await putShareItem({
      ownerSub: OWNER_SUB_R,
      ownerName: OWNER_NAME_R,
      recipientSub: RECIPIENT_RB,
      noteId: NOTE_ID_R,
      noteTitle: NOTE_TITLE_R,
      groupId: GROUP_ID_R,
      sharedAt: '2025-06-11T08:30:00.000Z',
    });
  });

  it('listSharesForRecipient returns the share for recipient A (pre-revoke)', async () => {
    const items = await listSharesForRecipient(RECIPIENT_RA);
    expect(items.some((s) => s.noteId === NOTE_ID_R)).toBe(true);
  });

  it('revokeShareItem(ownerR, NOTE_ID_R, recipientA) returns true', async () => {
    const result = await revokeShareItem(OWNER_SUB_R, NOTE_ID_R, RECIPIENT_RA);
    expect(result).toBe(true);
  });

  it('listSharesForRecipient EXCLUDES NOTE_ID_R for recipient A after revoke', async () => {
    const items = await listSharesForRecipient(RECIPIENT_RA);
    expect(items.some((s) => s.noteId === NOTE_ID_R)).toBe(false);
  });

  it('listSharesForNote returns BOTH items (one revoked, one active)', async () => {
    const items = await listSharesForNote(OWNER_SUB_R, NOTE_ID_R);
    expect(items).toHaveLength(2);

    const itemA = items.find((s) => s.recipientSub === RECIPIENT_RA);
    const itemB = items.find((s) => s.recipientSub === RECIPIENT_RB);

    expect(itemA).toBeDefined();
    expect(itemA!.revokedAt).toBeDefined();
    // ttl must be a number (seconds)
    expect(typeof itemA!.ttl).toBe('number');

    expect(itemB).toBeDefined();
    expect(itemB!.revokedAt).toBeUndefined();
  });

  it('authoriseNoteRead returns false for revoked recipient A', async () => {
    const result = await authoriseNoteRead(RECIPIENT_RA, OWNER_SUB_R, NOTE_ID_R);
    expect(result).toBe(false);
  });

  it('authoriseNoteRead returns true for still-active recipient B', async () => {
    const result = await authoriseNoteRead(RECIPIENT_RB, OWNER_SUB_R, NOTE_ID_R);
    expect(result).toBe(true);
  });

  it('revokeShareItem returns false for a non-existent share item', async () => {
    const result = await revokeShareItem(OWNER_SUB_R, NOTE_ID_R, 'no-such-recipient');
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// revokeAllSharesForNote — cascade soft-delete round-trip
// ---------------------------------------------------------------------------

describe('revokeAllSharesForNote (integration)', () => {
  it('setup: shares NOTE_ID_R2 with two recipients', async () => {
    await putShareItem({
      ownerSub: OWNER_SUB_R2,
      ownerName: OWNER_NAME_R2,
      recipientSub: RECIPIENT_RC,
      noteId: NOTE_ID_R2,
      noteTitle: NOTE_TITLE_R2,
      groupId: GROUP_ID_R2,
      sharedAt: '2025-06-11T09:00:00.000Z',
    });
    await putShareItem({
      ownerSub: OWNER_SUB_R2,
      ownerName: OWNER_NAME_R2,
      recipientSub: RECIPIENT_RD,
      noteId: NOTE_ID_R2,
      noteTitle: NOTE_TITLE_R2,
      groupId: GROUP_ID_R2,
      sharedAt: '2025-06-11T09:30:00.000Z',
    });
  });

  it('revokeAllSharesForNote returns 2 (both recipients revoked)', async () => {
    const count = await revokeAllSharesForNote(OWNER_SUB_R2, NOTE_ID_R2);
    expect(count).toBe(2);
  });

  it('listSharesForRecipient no longer includes NOTE_ID_R2 for recipient C', async () => {
    const items = await listSharesForRecipient(RECIPIENT_RC);
    expect(items.some((s) => s.noteId === NOTE_ID_R2)).toBe(false);
  });

  it('listSharesForRecipient no longer includes NOTE_ID_R2 for recipient D', async () => {
    const items = await listSharesForRecipient(RECIPIENT_RD);
    expect(items.some((s) => s.noteId === NOTE_ID_R2)).toBe(false);
  });

  it('calling revokeAllSharesForNote again returns 0 (already revoked)', async () => {
    const count = await revokeAllSharesForNote(OWNER_SUB_R2, NOTE_ID_R2);
    expect(count).toBe(0);
  });
});
