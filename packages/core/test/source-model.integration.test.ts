/**
 * Integration test: SOURCE item shape + `listSourcesByUser` /
 * `countSourcesByUser` / `getSource` via GSI9 (SourcesByUser) and
 * base-table GetItem (M20.1.1).
 *
 * Exercises the real `ddb` DocumentClient, `sourceKeys` builders,
 * `buildSourceItem`, `listSourcesByUser`, `countSourcesByUser`, and
 * `getSource` — no mocks.
 * The dynalite server is started by `dynalite-global.ts` (globalSetup) and
 * the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles), which run in workers before test files.
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems;
 * all items are written with individual PutCommands, mirroring the pattern
 * used throughout the integration suite.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import {
  buildSourceItem,
  listSourcesByUser,
  countSourcesByUser,
  getSource,
} from '../src/db/sources.js';

// ---------------------------------------------------------------------------
// Integration: listSourcesByUser — write / query round-trip (GSI9)
// ---------------------------------------------------------------------------

describe('listSourcesByUser — write / query round-trip (GSI9 SourcesByUser)', () => {
  // Unique subs to avoid collisions with other test files sharing dynalite.
  const SUB_A = 'sub-source-gsi9-a';
  const SUB_B = 'sub-source-gsi9-b';

  // Two sources for user A with ascending ULID-like ids (lexicographically
  // ordered so 'src-bbb' > 'src-aaa' — newest-first means 'src-bbb' comes back
  // first from ScanIndexForward: false on GSI9).
  const SRC_AAA = {
    sourceId: 'src-aaa-001',
    type: 'document' as const,
    title: 'Biology Textbook',
    status: 'ready' as const,
    originalFormat: 'pdf' as const,
    originalS3Key: 'sources/users/sub-source-gsi9-a/src-aaa-001.pdf',
    extractedTextS3Key: 'sources/users/sub-source-gsi9-a/src-aaa-001.md',
    byteSize: 1024 * 512,
    pageCount: 42,
    wordCount: 15000,
    createdAt: '2025-01-01T00:00:00.000Z',
  };

  const SRC_BBB = {
    sourceId: 'src-bbb-002',
    type: 'document' as const,
    title: 'Chemistry Notes',
    status: 'uploading' as const,
    originalFormat: 'docx' as const,
    originalS3Key: 'sources/users/sub-source-gsi9-a/src-bbb-002.docx',
    byteSize: 1024 * 128,
    createdAt: '2025-02-01T00:00:00.000Z',
  };

  // User B has one source — must not appear in user A queries.
  const SRC_B = {
    sourceId: 'src-ccc-003',
    type: 'document' as const,
    title: 'User B Document',
    status: 'ready' as const,
    originalFormat: 'txt' as const,
    originalS3Key: 'sources/users/sub-source-gsi9-b/src-ccc-003.txt',
    extractedTextS3Key: 'sources/users/sub-source-gsi9-b/src-ccc-003.md',
    byteSize: 4096,
    createdAt: '2025-03-01T00:00:00.000Z',
  };

  it('setup: writes 2 sources for user A and 1 for user B', async () => {
    for (const src of [SRC_AAA, SRC_BBB]) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Notes,
          Item: buildSourceItem({ sub: SUB_A, ...src }),
        }),
      );
    }
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildSourceItem({ sub: SUB_B, ...SRC_B }),
      }),
    );
  });

  it('listSourcesByUser returns both sources for user A', async () => {
    const sources = await listSourcesByUser(SUB_A);
    expect(sources).toHaveLength(2);
  });

  it('listSourcesByUser returns sources newest-first (descending ULID order)', async () => {
    const sources = await listSourcesByUser(SUB_A);
    const ids = sources.map((s) => s.sourceId);
    expect(ids[0]).toBe(SRC_BBB.sourceId); // 'src-bbb' > 'src-aaa'
    expect(ids[1]).toBe(SRC_AAA.sourceId);
  });

  it("listSourcesByUser does NOT return user B's source", async () => {
    const sources = await listSourcesByUser(SUB_A);
    const ids = sources.map((s) => s.sourceId);
    expect(ids).not.toContain(SRC_B.sourceId);
  });

  it("user B's listSourcesByUser returns only user B's source", async () => {
    const sources = await listSourcesByUser(SUB_B);
    expect(sources).toHaveLength(1);
    expect(sources[0].sourceId).toBe(SRC_B.sourceId);
  });

  it('listSourcesByUser returns full source attributes (projection ALL)', async () => {
    const sources = await listSourcesByUser(SUB_A);
    const found = sources.find((s) => s.sourceId === SRC_AAA.sourceId);
    expect(found).toBeDefined();
    expect(found!.type).toBe(SRC_AAA.type);
    expect(found!.title).toBe(SRC_AAA.title);
    expect(found!.status).toBe(SRC_AAA.status);
    expect(found!.originalFormat).toBe(SRC_AAA.originalFormat);
    expect(found!.originalS3Key).toBe(SRC_AAA.originalS3Key);
    expect(found!.extractedTextS3Key).toBe(SRC_AAA.extractedTextS3Key);
    expect(found!.byteSize).toBe(SRC_AAA.byteSize);
    expect(found!.pageCount).toBe(SRC_AAA.pageCount);
    expect(found!.wordCount).toBe(SRC_AAA.wordCount);
    expect(found!.createdAt).toBe(SRC_AAA.createdAt);
    expect(found!.updatedAt).toBe(SRC_AAA.createdAt); // defaults to createdAt
  });
});

// ---------------------------------------------------------------------------
// Integration: countSourcesByUser — COUNT query via GSI9
// ---------------------------------------------------------------------------

describe('countSourcesByUser — COUNT query via GSI9', () => {
  const SUB = 'sub-source-count-001';

  const SRCS = [
    {
      sourceId: 'src-count-aaa',
      type: 'document' as const,
      title: 'Count Source A',
      status: 'ready' as const,
      originalFormat: 'pdf' as const,
      originalS3Key: 'sources/users/sub-source-count-001/src-count-aaa.pdf',
      byteSize: 1024,
      createdAt: '2025-04-01T00:00:00.000Z',
    },
    {
      sourceId: 'src-count-bbb',
      type: 'document' as const,
      title: 'Count Source B',
      status: 'extracting' as const,
      originalFormat: 'md' as const,
      originalS3Key: 'sources/users/sub-source-count-001/src-count-bbb.md',
      byteSize: 512,
      createdAt: '2025-04-02T00:00:00.000Z',
    },
  ];

  it('setup: writes 2 sources for the count sub', async () => {
    for (const src of SRCS) {
      await ddb.send(
        new PutCommand({
          TableName: TableNames.Notes,
          Item: buildSourceItem({ sub: SUB, ...src }),
        }),
      );
    }
  });

  it('countSourcesByUser returns 2 for the sub with 2 sources', async () => {
    const count = await countSourcesByUser(SUB);
    expect(count).toBe(2);
  });

  it('countSourcesByUser returns 0 for a sub with no sources', async () => {
    const count = await countSourcesByUser('sub-source-count-empty');
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: getSource — GetItem round-trip
// ---------------------------------------------------------------------------

describe('getSource — write / GetItem round-trip', () => {
  const SUB = 'sub-source-get-001';

  const SRC = {
    sourceId: 'src-get-aaa-001',
    type: 'document' as const,
    title: 'Get round-trip source',
    status: 'ready' as const,
    originalFormat: 'epub' as const,
    originalS3Key: 'sources/users/sub-source-get-001/src-get-aaa-001.epub',
    extractedTextS3Key: 'sources/users/sub-source-get-001/src-get-aaa-001.md',
    byteSize: 2048 * 1024,
    pageCount: 200,
    createdAt: '2025-05-01T00:00:00.000Z',
  };

  it('setup: writes a ready source', async () => {
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildSourceItem({ sub: SUB, ...SRC }),
      }),
    );
  });

  it('getSource returns the item immediately after write', async () => {
    const item = await getSource(SUB, SRC.sourceId);
    expect(item).toBeDefined();
    expect(item!.sourceId).toBe(SRC.sourceId);
    expect(item!.status).toBe('ready');
    expect(item!.extractedTextS3Key).toBe(SRC.extractedTextS3Key);
    expect(item!.pageCount).toBe(SRC.pageCount);
    expect('wordCount' in item!).toBe(false); // not provided → absent
    expect('error' in item!).toBe(false);     // not provided → absent
  });

  it('getSource round-trip: all initial fields survive the write', async () => {
    const item = await getSource(SUB, SRC.sourceId);
    expect(item!.type).toBe(SRC.type);
    expect(item!.title).toBe(SRC.title);
    expect(item!.originalFormat).toBe(SRC.originalFormat);
    expect(item!.originalS3Key).toBe(SRC.originalS3Key);
    expect(item!.byteSize).toBe(SRC.byteSize);
    expect(item!.createdAt).toBe(SRC.createdAt);
    expect(item!.updatedAt).toBe(SRC.createdAt); // defaults to createdAt
  });

  it('getSource preserves GSI9 keys after write', async () => {
    const item = await getSource(SUB, SRC.sourceId);
    expect(item!.pk).toBe(`USER#${SUB}`);
    expect(item!.sk).toBe(`SOURCE#${SRC.sourceId}`);
    expect(item!.gsi9pk).toBe(`USER#${SUB}`);
    expect(item!.gsi9sk).toBe(`SOURCE#${SRC.sourceId}`);
  });

  it('getSource returns undefined for a non-existent source', async () => {
    const item = await getSource(SUB, 'does-not-exist');
    expect(item).toBeUndefined();
  });
});
