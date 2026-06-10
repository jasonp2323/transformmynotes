/**
 * Integration test: token-index item shape + `listNoteIdsByToken` via GSI3
 * (issue #69, M6.1.3).
 *
 * Exercises the real `ddb` DocumentClient, `noteKeys` token builders,
 * `buildTokenIndexItem`, and `listNoteIdsByToken` — no mocks. The dynalite
 * server is started by `dynalite-global.ts` (globalSetup) and the production
 * client is pointed at it via env vars set in `integration-env.ts` (setupFiles).
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems;
 * all items are written with individual PutCommands, mirroring the pattern
 * used throughout the integration suite.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { noteKeys } from '../src/db/keys.js';
import { buildTokenIndexItem, listNoteIdsByToken } from '../src/db/notes.js';

// ---------------------------------------------------------------------------
// Pure builder unit checks (no I/O)
// ---------------------------------------------------------------------------

describe('buildTokenIndexItem — pure builder checks', () => {
  it('populates pk / sk / gsi3pk / gsi3sk / noteId correctly', () => {
    const item = buildTokenIndexItem({ token: 'hello', sub: 'ti-sub-u', noteId: 'ti-note-u' });

    expect(item.pk).toBe('USER#ti-sub-u');
    expect(item.sk).toBe('TOKEN#hello#NOTE#ti-note-u');
    expect(item.gsi3pk).toBe('USER#ti-sub-u');
    expect(item.gsi3sk).toBe('TOKEN#hello#NOTE#ti-note-u');
    expect(item.noteId).toBe('ti-note-u');
  });

  it('produces distinct items for different tokens on the same note', () => {
    const i1 = buildTokenIndexItem({ token: 'alpha', sub: 's', noteId: 'n' });
    const i2 = buildTokenIndexItem({ token: 'beta', sub: 's', noteId: 'n' });

    expect(i1.sk).not.toBe(i2.sk);
    expect(i1.gsi3sk).not.toBe(i2.gsi3sk);
    expect(i1.noteId).toBe(i2.noteId);
  });
});

describe('noteKeys token builders — pure checks', () => {
  it('gsi3pk returns USER#<sub>', () => {
    expect(noteKeys.gsi3pk('my-sub')).toBe('USER#my-sub');
  });

  it('gsi3sk returns TOKEN#<token>#NOTE#<noteId>', () => {
    expect(noteKeys.gsi3sk('word', 'id-1')).toBe('TOKEN#word#NOTE#id-1');
  });

  it('tokenItemKey returns the correct pk/sk pair', () => {
    const key = noteKeys.tokenItemKey('s', 'tok', 'n');
    expect(key.pk).toBe('USER#s');
    expect(key.sk).toBe('TOKEN#tok#NOTE#n');
  });

  it('tokenQueryKey uses IndexName GSI3 and begins_with on gsi3sk', () => {
    const params = noteKeys.tokenQueryKey('s', 'ter');
    expect(params.IndexName).toBe('GSI3');
    expect(params.KeyConditionExpression).toBe(
      'gsi3pk = :pk AND begins_with(gsi3sk, :sk)',
    );
    expect(params.ExpressionAttributeValues[':pk']).toBe('USER#s');
    expect(params.ExpressionAttributeValues[':sk']).toBe('TOKEN#ter');
  });

  it('parseTokenItemSk round-trips token + noteId', () => {
    const sk = noteKeys.gsi3sk('hello', 'note-abc');
    const parsed = noteKeys.parseTokenItemSk(sk);
    expect(parsed.token).toBe('hello');
    expect(parsed.noteId).toBe('note-abc');
  });

  it('parseTokenItemSk throws on a malformed key', () => {
    expect(() => noteKeys.parseTokenItemSk('BADKEY#value')).toThrow();
    expect(() => noteKeys.parseTokenItemSk('')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Integration: write token-index items → query → delete → query again
// ---------------------------------------------------------------------------

describe('token-index — write / query / delete round-trip (GSI3)', () => {
  // Use a unique sub to avoid collisions with other test files sharing dynalite.
  const SUB = 'sub-ti-001';
  const NOTE_ID = '01JXXXXXXXXXXXXXXXXXXXTI1';
  const TOKENS = ['learn', 'language', 'vocab', 'grammar', 'study'];

  it('setup: writes five token-index items for one note', async () => {
    for (const token of TOKENS) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Notes,
          Item: buildTokenIndexItem({ token, sub: SUB, noteId: NOTE_ID }),
        }),
      );
    }
  });

  it('listNoteIdsByToken returns the note id for a known token', async () => {
    const items = await listNoteIdsByToken(SUB, 'learn');
    const noteIds = items.map((i) => i.noteId);
    expect(noteIds).toContain(NOTE_ID);
  });

  it('listNoteIdsByToken returns the note id for another known token', async () => {
    const items = await listNoteIdsByToken(SUB, 'vocab');
    const noteIds = items.map((i) => i.noteId);
    expect(noteIds).toContain(NOTE_ID);
  });

  it('deletes the "learn" token-index item', async () => {
    await ddb.send(
      new DeleteCommand({
        TableName: TableNames.Notes,
        Key: noteKeys.tokenItemKey(SUB, 'learn', NOTE_ID),
      }),
    );
  });

  it('after deletion, "learn" no longer returns the note id', async () => {
    const items = await listNoteIdsByToken(SUB, 'learn');
    const noteIds = items.map((i) => i.noteId);
    expect(noteIds).not.toContain(NOTE_ID);
  });

  it('after deletion, "language" (not removed) still returns the note id', async () => {
    const items = await listNoteIdsByToken(SUB, 'language');
    const noteIds = items.map((i) => i.noteId);
    expect(noteIds).toContain(NOTE_ID);
  });

  it('an unknown term returns an empty array', async () => {
    const items = await listNoteIdsByToken(SUB, 'unknownterm_xyz');
    expect(items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// User isolation: token query is scoped to the requesting user
// ---------------------------------------------------------------------------

describe('token-index — user isolation', () => {
  const SUB_A = 'sub-ti-002a';
  const SUB_B = 'sub-ti-002b';
  const NOTE_A = '01JXXXXXXXXXXXXXXXXXXXTA2';
  const NOTE_B = '01JXXXXXXXXXXXXXXXXXXXTTB2';
  const TOKEN = 'shared-word';

  it('setup: writes the same token for two different users', async () => {
    for (const [sub, noteId] of [
      [SUB_A, NOTE_A],
      [SUB_B, NOTE_B],
    ] as [string, string][]) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Notes,
          Item: buildTokenIndexItem({ token: TOKEN, sub, noteId }),
        }),
      );
    }
  });

  it("user A's token query does NOT return user B's note", async () => {
    const items = await listNoteIdsByToken(SUB_A, TOKEN);
    const noteIds = items.map((i) => i.noteId);
    expect(noteIds).toContain(NOTE_A);
    expect(noteIds).not.toContain(NOTE_B);
  });

  it("user B's token query does NOT return user A's note", async () => {
    const items = await listNoteIdsByToken(SUB_B, TOKEN);
    const noteIds = items.map((i) => i.noteId);
    expect(noteIds).toContain(NOTE_B);
    expect(noteIds).not.toContain(NOTE_A);
  });
});

// ---------------------------------------------------------------------------
// Prefix search: begins_with on gsi3sk matches all tokens starting with term
// ---------------------------------------------------------------------------

describe('token-index — prefix search via begins_with', () => {
  const SUB = 'sub-ti-003';
  const NOTE_ID = '01JXXXXXXXXXXXXXXXXXXXTI3';

  it('setup: writes tokens "grammar", "grammarian", "great"', async () => {
    for (const token of ['grammar', 'grammarian', 'great']) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Notes,
          Item: buildTokenIndexItem({ token, sub: SUB, noteId: NOTE_ID }),
        }),
      );
    }
  });

  it('querying prefix "gram" returns the note for both "grammar" and "grammarian" tokens', async () => {
    const items = await listNoteIdsByToken(SUB, 'gram');
    // Both "grammar" and "grammarian" start with "gram"
    expect(items.length).toBe(2);
    const noteIds = items.map((i) => i.noteId);
    expect(noteIds).toContain(NOTE_ID);
  });

  it('querying prefix "gramm" returns items for "grammar" and "grammarian" but not "great"', async () => {
    const gramm = await listNoteIdsByToken(SUB, 'gramm');
    const great = await listNoteIdsByToken(SUB, 'great');
    expect(gramm.length).toBe(2);
    expect(great.length).toBe(1);
  });
});
