/**
 * Unit tests for `shareKeys` (key builders) and `buildShareItem` (pure builder)
 * from `packages/core/src/db/keys.ts` and `packages/core/src/db/shares.ts`.
 *
 * Also tests `authoriseNoteRead` with a mocked `DynamoDBDocumentClient` so all
 * branches can be exercised without a running DynamoDB instance.
 *
 * NOTE: `authoriseNoteRead` uses `TableNames.Notes` (a lazy env-var getter) in
 * the non-owner path. We set `SST_RESOURCE_Notes_name` to a dummy value before
 * those tests so the getter resolves without error — no real DynamoDB is used.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { shareKeys } from '../../src/db/keys.js';
import {
  buildShareItem,
  authoriseNoteRead,
  revokeShareItem,
  revokeAllSharesForNote,
} from '../../src/db/shares.js';
import type { ShareItem } from '../../src/db/shares.js';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// ---------------------------------------------------------------------------
// shareKeys — pure key builder checks
// ---------------------------------------------------------------------------

describe('shareKeys.shareItemKey', () => {
  it('returns pk = USER#<ownerSub> and sk = SHARE#<noteId>#RECIPIENT#<recipientSub>', () => {
    const key = shareKeys.shareItemKey('owner-1', 'note-abc', 'recip-2');
    expect(key.pk).toBe('USER#owner-1');
    expect(key.sk).toBe('SHARE#note-abc#RECIPIENT#recip-2');
  });

  it('different noteIds produce different sk values', () => {
    const k1 = shareKeys.shareItemKey('owner', 'note-A', 'recip');
    const k2 = shareKeys.shareItemKey('owner', 'note-B', 'recip');
    expect(k1.sk).not.toBe(k2.sk);
    expect(k1.pk).toBe(k2.pk);
  });

  it('different recipientSubs produce different sk values', () => {
    const k1 = shareKeys.shareItemKey('owner', 'note', 'recip-A');
    const k2 = shareKeys.shareItemKey('owner', 'note', 'recip-B');
    expect(k1.sk).not.toBe(k2.sk);
  });
});

describe('shareKeys.gsi4pk', () => {
  it('returns USER#<recipientSub>', () => {
    expect(shareKeys.gsi4pk('recip-xyz')).toBe('USER#recip-xyz');
  });

  it('different subs produce different values', () => {
    expect(shareKeys.gsi4pk('a')).not.toBe(shareKeys.gsi4pk('b'));
  });
});

describe('shareKeys.gsi4sk', () => {
  it('returns SHARED_AT#<sharedAt>', () => {
    const ts = '2025-06-11T00:00:00.000Z';
    expect(shareKeys.gsi4sk(ts)).toBe(`SHARED_AT#${ts}`);
  });

  it('different timestamps produce different values', () => {
    const a = shareKeys.gsi4sk('2025-01-01T00:00:00.000Z');
    const b = shareKeys.gsi4sk('2025-06-01T00:00:00.000Z');
    expect(a).not.toBe(b);
  });
});

describe('shareKeys.sharesByRecipientQuery', () => {
  const params = shareKeys.sharesByRecipientQuery('recip-sub');

  it('uses IndexName GSI4', () => {
    expect(params.IndexName).toBe('GSI4');
  });

  it('KeyConditionExpression is gsi4pk = :pk', () => {
    expect(params.KeyConditionExpression).toBe('gsi4pk = :pk');
  });

  it(':pk ExpressionAttributeValue is USER#<recipientSub>', () => {
    expect(params.ExpressionAttributeValues[':pk']).toBe('USER#recip-sub');
  });

  it('FilterExpression excludes revoked items', () => {
    expect(params.FilterExpression).toBe('attribute_not_exists(revokedAt)');
  });

  it('ScanIndexForward is false (newest-first)', () => {
    expect(params.ScanIndexForward).toBe(false);
  });

  it('Limit is 50', () => {
    expect(params.Limit).toBe(50);
  });
});

describe('shareKeys.sharesByNoteQuery', () => {
  const params = shareKeys.sharesByNoteQuery('owner-sub', 'note-id');

  it('does not include IndexName (base-table query)', () => {
    expect('IndexName' in params).toBe(false);
  });

  it('KeyConditionExpression is pk = :pk AND begins_with(sk, :sk)', () => {
    expect(params.KeyConditionExpression).toBe('pk = :pk AND begins_with(sk, :sk)');
  });

  it(':pk ExpressionAttributeValue is USER#<ownerSub>', () => {
    expect(params.ExpressionAttributeValues[':pk']).toBe('USER#owner-sub');
  });

  it(':sk ExpressionAttributeValue is SHARE#<noteId>#', () => {
    expect(params.ExpressionAttributeValues[':sk']).toBe('SHARE#note-id#');
  });
});

describe('shareKeys.parseShareSk', () => {
  it('round-trips noteId and recipientSub from a valid share sk', () => {
    const sk = `SHARE#note-ulid-123#RECIPIENT#recip-sub-456`;
    const parsed = shareKeys.parseShareSk(sk);
    expect(parsed.noteId).toBe('note-ulid-123');
    expect(parsed.recipientSub).toBe('recip-sub-456');
  });

  it('recovers noteId and recipientSub from a sk built via shareItemKey', () => {
    const { sk } = shareKeys.shareItemKey('owner', 'note-abc', 'recip-xyz');
    const parsed = shareKeys.parseShareSk(sk);
    expect(parsed.noteId).toBe('note-abc');
    expect(parsed.recipientSub).toBe('recip-xyz');
  });

  it('throws on a malformed sort key', () => {
    expect(() => shareKeys.parseShareSk('BADKEY#value')).toThrow(
      'shareKeys.parseShareSk: malformed share sort key "BADKEY#value"',
    );
  });

  it('throws on an empty string', () => {
    expect(() => shareKeys.parseShareSk('')).toThrow('shareKeys.parseShareSk');
  });

  it('throws on a NOTE# prefix (wrong item type)', () => {
    expect(() => shareKeys.parseShareSk('NOTE#ulid-abc')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// buildShareItem — pure builder checks
// ---------------------------------------------------------------------------

describe('buildShareItem', () => {
  const BASE_INPUT = {
    ownerSub: 'owner-sub',
    ownerName: 'Alice',
    recipientSub: 'recip-sub',
    noteId: 'note-ulid',
    noteTitle: 'My Shared Note',
    groupId: 'group-123',
  };

  it('sets pk and sk correctly via shareKeys', () => {
    const item = buildShareItem(BASE_INPUT);
    expect(item.pk).toBe('USER#owner-sub');
    expect(item.sk).toBe('SHARE#note-ulid#RECIPIENT#recip-sub');
  });

  it('sets gsi4pk to USER#<recipientSub>', () => {
    const item = buildShareItem(BASE_INPUT);
    expect(item.gsi4pk).toBe('USER#recip-sub');
  });

  it('gsi4sk equals SHARED_AT#<sharedAt>', () => {
    const sharedAt = '2025-06-11T12:00:00.000Z';
    const item = buildShareItem({ ...BASE_INPUT, sharedAt });
    expect(item.gsi4sk).toBe(`SHARED_AT#${sharedAt}`);
  });

  it('populates all attrs from the input', () => {
    const item = buildShareItem(BASE_INPUT);
    expect(item.ownerSub).toBe('owner-sub');
    expect(item.ownerName).toBe('Alice');
    expect(item.recipientSub).toBe('recip-sub');
    expect(item.noteId).toBe('note-ulid');
    expect(item.noteTitle).toBe('My Shared Note');
    expect(item.groupId).toBe('group-123');
  });

  it('permission defaults to "read" when omitted', () => {
    const item = buildShareItem(BASE_INPUT);
    expect(item.permission).toBe('read');
  });

  it('permission can be explicitly set to "read"', () => {
    const item = buildShareItem({ ...BASE_INPUT, permission: 'read' });
    expect(item.permission).toBe('read');
  });

  it('sharedAt is present and an ISO-8601 string when not provided', () => {
    const before = new Date().toISOString();
    const item = buildShareItem(BASE_INPUT);
    const after = new Date().toISOString();
    expect(item.sharedAt >= before).toBe(true);
    expect(item.sharedAt <= after).toBe(true);
  });

  it('uses the provided sharedAt when supplied', () => {
    const sharedAt = '2025-01-15T08:30:00.000Z';
    const item = buildShareItem({ ...BASE_INPUT, sharedAt });
    expect(item.sharedAt).toBe(sharedAt);
  });

  it('does not set revokedAt on a fresh (active) share', () => {
    const item = buildShareItem(BASE_INPUT);
    expect(item.revokedAt).toBeUndefined();
  });

  it('does not set ttl on a fresh (active) share', () => {
    const item = buildShareItem(BASE_INPUT);
    expect(item.ttl).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// authoriseNoteRead — mocked DynamoDBDocumentClient
// ---------------------------------------------------------------------------

/**
 * Build a minimal mock `DynamoDBDocumentClient` that resolves `send` with a
 * fixed return value. Cast via `as unknown as DynamoDBDocumentClient` to satisfy
 * TypeScript without constructing a real client.
 */
function makeMockClient(sendResult: unknown) {
  return { send: vi.fn().mockResolvedValue(sendResult) } as unknown as DynamoDBDocumentClient;
}

describe('authoriseNoteRead', () => {
  const OWNER = 'sub-owner';
  const CALLER = 'sub-caller';
  const NOTE_ID = 'note-ulid-999';

  // `authoriseNoteRead` references `TableNames.Notes` (a lazy env-var getter)
  // in the non-owner slow path. Set a dummy value so the getter resolves without
  // throwing. No real DynamoDB connection is made — the client is mocked.
  beforeAll(() => {
    process.env.SST_RESOURCE_Notes_name = 'unit-test-notes-table';
  });

  it('returns true immediately for the owner without calling send', async () => {
    const client = makeMockClient({ Item: undefined });
    const result = await authoriseNoteRead(OWNER, OWNER, NOTE_ID, client);
    expect(result).toBe(true);
    expect((client.send as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('returns true for a valid recipient (active share, no revokedAt)', async () => {
    const activeShare: Partial<ShareItem> = {
      ownerSub: OWNER,
      recipientSub: CALLER,
      noteId: NOTE_ID,
      permission: 'read',
      sharedAt: '2025-06-01T00:00:00.000Z',
      // revokedAt intentionally absent
    };
    const client = makeMockClient({ Item: activeShare });
    const result = await authoriseNoteRead(CALLER, OWNER, NOTE_ID, client);
    expect(result).toBe(true);
    expect((client.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
  });

  it('returns false for a revoked recipient (revokedAt is set)', async () => {
    const revokedShare: Partial<ShareItem> = {
      ownerSub: OWNER,
      recipientSub: CALLER,
      noteId: NOTE_ID,
      permission: 'read',
      sharedAt: '2025-06-01T00:00:00.000Z',
      revokedAt: '2025-06-10T00:00:00.000Z',
    };
    const client = makeMockClient({ Item: revokedShare });
    const result = await authoriseNoteRead(CALLER, OWNER, NOTE_ID, client);
    expect(result).toBe(false);
  });

  it('returns false for an unknown user (no share item exists)', async () => {
    const client = makeMockClient({ /* no Item key */ });
    const result = await authoriseNoteRead(CALLER, OWNER, NOTE_ID, client);
    expect(result).toBe(false);
  });

  it('returns false when Item is explicitly undefined', async () => {
    const client = makeMockClient({ Item: undefined });
    const result = await authoriseNoteRead(CALLER, OWNER, NOTE_ID, client);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// revokeShareItem — mocked DynamoDBDocumentClient
// ---------------------------------------------------------------------------

/**
 * revokeShareItem uses the module-level `ddb` singleton, so we mock the module
 * to intercept the UpdateCommand. We use vi.mock at the top of the module to
 * replace the db/client module, but since the test file does not use top-level
 * vi.mock (which would affect other tests), we test revokeShareItem by
 * inspecting the behaviour it exposes: the UpdateCommand parameters and the
 * error handling. We achieve this by mocking the `ddb` send method via
 * vi.spyOn on the imported ddb object.
 */

// We need to reach in and mock ddb.send. Import it here.
import * as clientModule from '../../src/db/client.js';

describe('revokeShareItem', () => {
  const OWNER = 'sub-revoke-owner';
  const NOTE = 'note-revoke-001';
  const RECIP = 'sub-revoke-recip';
  const FIXED_NOW = new Date('2025-06-11T12:00:00.000Z');

  beforeAll(() => {
    process.env.SST_RESOURCE_Notes_name = 'unit-test-notes-table';
  });

  it('sends an UpdateCommand with revokedAt and numeric ttl ~30 days out and returns true', async () => {
    const spy = vi.spyOn(clientModule.ddb, 'send').mockResolvedValue({} as never);

    const result = await revokeShareItem(OWNER, NOTE, RECIP, FIXED_NOW);

    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledOnce();

    // Inspect the UpdateCommand that was sent
    const sentCmd = spy.mock.calls[0][0] as { input: Record<string, unknown> };
    const input = sentCmd.input;

    expect(input.TableName).toBe('unit-test-notes-table');
    expect(input.Key).toEqual(shareKeys.shareItemKey(OWNER, NOTE, RECIP));
    expect(input.UpdateExpression).toContain('revokedAt');
    expect(input.UpdateExpression).toContain('#ttl');

    // revokedAt must be the ISO string from FIXED_NOW
    const attrValues = input.ExpressionAttributeValues as Record<string, unknown>;
    expect(attrValues[':revokedAt']).toBe(FIXED_NOW.toISOString());

    // ttl must be a number equal to ~30 days from FIXED_NOW (Unix seconds)
    const expectedTtl = Math.floor(FIXED_NOW.getTime() / 1000) + 30 * 24 * 60 * 60;
    expect(attrValues[':ttl']).toBe(expectedTtl);

    // ConditionExpression must require the item to exist
    expect(input.ConditionExpression).toBe('attribute_exists(pk)');

    spy.mockRestore();
  });

  it('returns false when ConditionalCheckFailedException is thrown (item does not exist)', async () => {
    const err = Object.assign(new Error('ConditionalCheckFailedException'), {
      name: 'ConditionalCheckFailedException',
    });
    const spy = vi.spyOn(clientModule.ddb, 'send').mockRejectedValue(err as never);

    const result = await revokeShareItem(OWNER, NOTE, RECIP, FIXED_NOW);
    expect(result).toBe(false);

    spy.mockRestore();
  });

  it('re-throws unexpected errors', async () => {
    const err = new Error('network error');
    const spy = vi.spyOn(clientModule.ddb, 'send').mockRejectedValue(err as never);

    await expect(revokeShareItem(OWNER, NOTE, RECIP, FIXED_NOW)).rejects.toThrow('network error');

    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// revokeAllSharesForNote — mocked via vi.spyOn on revokeShareItem dependencies
// ---------------------------------------------------------------------------

describe('revokeAllSharesForNote', () => {
  const OWNER = 'sub-raf-owner';
  const NOTE = 'note-raf-001';
  const FIXED_NOW = new Date('2025-06-11T15:00:00.000Z');

  beforeAll(() => {
    process.env.SST_RESOURCE_Notes_name = 'unit-test-notes-table';
  });

  it('revokes each active share, skips already-revoked ones, and returns the correct count', async () => {
    const activeShare1: Partial<ShareItem> = {
      pk: `USER#${OWNER}`,
      sk: `SHARE#${NOTE}#RECIPIENT#recip-1`,
      ownerSub: OWNER,
      recipientSub: 'recip-1',
      noteId: NOTE,
      revokedAt: undefined,
    };
    const activeShare2: Partial<ShareItem> = {
      pk: `USER#${OWNER}`,
      sk: `SHARE#${NOTE}#RECIPIENT#recip-2`,
      ownerSub: OWNER,
      recipientSub: 'recip-2',
      noteId: NOTE,
      revokedAt: undefined,
    };
    const alreadyRevoked: Partial<ShareItem> = {
      pk: `USER#${OWNER}`,
      sk: `SHARE#${NOTE}#RECIPIENT#recip-3`,
      ownerSub: OWNER,
      recipientSub: 'recip-3',
      noteId: NOTE,
      revokedAt: '2025-06-10T00:00:00.000Z',
    };

    // Provide injectable mocks via the optional _listFn / _revokeFn parameters
    const listFn = vi
      .fn<typeof import('../../src/db/shares.js').listSharesForNote>()
      .mockResolvedValue([activeShare1, activeShare2, alreadyRevoked] as ShareItem[]);
    const revokeFn = vi
      .fn<typeof import('../../src/db/shares.js').revokeShareItem>()
      .mockResolvedValue(true);

    const count = await revokeAllSharesForNote(OWNER, NOTE, FIXED_NOW, listFn, revokeFn);

    // Only 2 active shares should have been revoked
    expect(count).toBe(2);

    // listFn must have been called once with the right args
    expect(listFn).toHaveBeenCalledOnce();
    expect(listFn).toHaveBeenCalledWith(OWNER, NOTE);

    // revokeFn should have been called exactly twice (skipping already-revoked)
    expect(revokeFn).toHaveBeenCalledTimes(2);
    expect(revokeFn).toHaveBeenCalledWith(OWNER, NOTE, 'recip-1', FIXED_NOW);
    expect(revokeFn).toHaveBeenCalledWith(OWNER, NOTE, 'recip-2', FIXED_NOW);
    // recip-3 (already revoked) must NOT have been called
    expect(revokeFn).not.toHaveBeenCalledWith(OWNER, NOTE, 'recip-3', expect.anything());
  });

  it('returns 0 when there are no shares for the note', async () => {
    const listFn = vi
      .fn<typeof import('../../src/db/shares.js').listSharesForNote>()
      .mockResolvedValue([]);
    const revokeFn = vi
      .fn<typeof import('../../src/db/shares.js').revokeShareItem>()
      .mockResolvedValue(true);

    const count = await revokeAllSharesForNote(OWNER, NOTE, FIXED_NOW, listFn, revokeFn);

    expect(count).toBe(0);
    expect(revokeFn).not.toHaveBeenCalled();
  });

  it('returns 0 when all shares are already revoked', async () => {
    const alreadyRevoked: Partial<ShareItem> = {
      ownerSub: OWNER,
      recipientSub: 'recip-x',
      noteId: NOTE,
      revokedAt: '2025-06-10T00:00:00.000Z',
    };
    const listFn = vi
      .fn<typeof import('../../src/db/shares.js').listSharesForNote>()
      .mockResolvedValue([alreadyRevoked] as ShareItem[]);
    const revokeFn = vi
      .fn<typeof import('../../src/db/shares.js').revokeShareItem>()
      .mockResolvedValue(true);

    const count = await revokeAllSharesForNote(OWNER, NOTE, FIXED_NOW, listFn, revokeFn);

    expect(count).toBe(0);
    expect(revokeFn).not.toHaveBeenCalled();
  });
});
