/**
 * Integration test: `processSourceExtraction` — DynamoDB round-trip via dynalite.
 *
 * Exercises the real `ddb` DocumentClient, `buildSourceItem` / `getSource` /
 * `markSourceReady` / `markSourceFailed` DB functions against an in-memory
 * DynamoDB. S3 and document-parsing deps are injected as stubs so no AWS
 * credentials or network access are needed.
 *
 * The dynalite server is started by `dynalite-global.ts` (globalSetup) and the
 * production client is pointed at it via env vars set in `integration-env.ts`
 * (setupFiles), which run in workers before test files.
 *
 * NOTE ON TRANSACTIONS: dynalite v4 does not implement TransactWriteItems;
 * all items are written with individual PutCommands, mirroring the pattern
 * used throughout the integration suite.
 */

import { describe, it, expect, vi } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { buildSourceItem, getSource } from '../src/db/sources.js';
import { processSourceExtraction } from '../../application/jobs/source-extraction.js';

// ---------------------------------------------------------------------------
// Integration: success path — extraction completes, source marked ready
// ---------------------------------------------------------------------------

describe('processSourceExtraction — success path (status: extracting → ready)', () => {
  const SUB = 'sub-extract-job-success-001';
  const SOURCE_ID = 'src-extract-success-aaa';

  it('setup: writes a source with status extracting', async () => {
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildSourceItem({
          sub: SUB,
          sourceId: SOURCE_ID,
          type: 'document',
          title: 'My Test Document',
          status: 'extracting',
          originalFormat: 'txt',
          originalS3Key: `sources/users/${SUB}/${SOURCE_ID}.txt`,
          byteSize: 1024,
          createdAt: '2025-06-01T00:00:00.000Z',
        }),
      }),
    );
  });

  it('processSourceExtraction resolves to outcome ready', async () => {
    const putText = vi.fn().mockResolvedValue(undefined);
    const extractedText = 'Hello world from the test document.';

    const result = await processSourceExtraction(SUB, SOURCE_ID, {
      getOriginalBytes: async () => Buffer.from('raw bytes'),
      parse: async () => extractedText,
      putText,
    });

    expect(result.outcome).toBe('ready');
  });

  it('getSource shows status ready after successful extraction', async () => {
    const item = await getSource(SUB, SOURCE_ID);
    expect(item).toBeDefined();
    expect(item!.status).toBe('ready');
  });

  it('getSource has wordCount set after extraction', async () => {
    const item = await getSource(SUB, SOURCE_ID);
    expect(typeof item!.wordCount).toBe('number');
    expect(item!.wordCount).toBeGreaterThan(0);
  });

  it('getSource has extractedTextS3Key set after extraction', async () => {
    const item = await getSource(SUB, SOURCE_ID);
    expect(item!.extractedTextS3Key).toBeDefined();
    expect(item!.extractedTextS3Key).toContain(SOURCE_ID);
  });

  it('putText spy was called once with the extracted text', async () => {
    // Re-seed a fresh source (previous test already consumed the extracting item)
    const SUB2 = 'sub-extract-job-success-spy';
    const SRC2 = 'src-extract-spy-bbb';
    const putText = vi.fn().mockResolvedValue(undefined);
    const extractedText = 'Spy test content here.';

    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildSourceItem({
          sub: SUB2,
          sourceId: SRC2,
          type: 'document',
          title: 'Spy Doc',
          status: 'extracting',
          originalFormat: 'md',
          originalS3Key: `sources/users/${SUB2}/${SRC2}.md`,
          byteSize: 512,
          createdAt: '2025-06-01T00:00:00.000Z',
        }),
      }),
    );

    await processSourceExtraction(SUB2, SRC2, {
      getOriginalBytes: async () => Buffer.from('raw'),
      parse: async () => extractedText,
      putText,
    });

    expect(putText).toHaveBeenCalledOnce();
    // First arg is sub, second is sourceId, third is text (with title prepended)
    expect(putText.mock.calls[0][2]).toContain(extractedText);
  });
});

// ---------------------------------------------------------------------------
// Integration: failure path — parse throws, source marked failed
// ---------------------------------------------------------------------------

describe('processSourceExtraction — failure path (parse throws → status: failed)', () => {
  const SUB = 'sub-extract-job-fail-001';
  const SOURCE_ID = 'src-extract-fail-aaa';

  it('setup: writes a source with status extracting', async () => {
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildSourceItem({
          sub: SUB,
          sourceId: SOURCE_ID,
          type: 'document',
          title: 'Failing Document',
          status: 'extracting',
          originalFormat: 'pdf',
          originalS3Key: `sources/users/${SUB}/${SOURCE_ID}.pdf`,
          byteSize: 2048,
          createdAt: '2025-06-01T00:00:00.000Z',
        }),
      }),
    );
  });

  it('processSourceExtraction resolves (does not throw) when parse throws', async () => {
    const result = await processSourceExtraction(SUB, SOURCE_ID, {
      getOriginalBytes: async () => Buffer.from('bytes'),
      parse: async () => {
        const err = new Error('corrupt PDF');
        err.name = 'ParseError';
        throw err;
      },
      putText: vi.fn(),
    });

    expect(result.outcome).toBe('failed');
  });

  it('getSource shows status failed after parse error', async () => {
    const item = await getSource(SUB, SOURCE_ID);
    expect(item).toBeDefined();
    expect(item!.status).toBe('failed');
  });

  it('getSource has a non-empty error message after parse error', async () => {
    const item = await getSource(SUB, SOURCE_ID);
    expect(typeof item!.error).toBe('string');
    expect(item!.error!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: idempotency — already-ready source returns skipped
// ---------------------------------------------------------------------------

describe('processSourceExtraction — idempotency (status: ready → skipped)', () => {
  const SUB = 'sub-extract-job-idem-001';
  const SOURCE_ID = 'src-extract-idem-aaa';

  it('setup: writes a source with status ready', async () => {
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildSourceItem({
          sub: SUB,
          sourceId: SOURCE_ID,
          type: 'document',
          title: 'Already Ready Document',
          status: 'ready',
          originalFormat: 'txt',
          originalS3Key: `sources/users/${SUB}/${SOURCE_ID}.txt`,
          extractedTextS3Key: `sources/users/${SUB}/${SOURCE_ID}.md`,
          wordCount: 500,
          byteSize: 4096,
          createdAt: '2025-06-01T00:00:00.000Z',
        }),
      }),
    );
  });

  it('processSourceExtraction returns outcome skipped for a ready source', async () => {
    const putText = vi.fn();

    const result = await processSourceExtraction(SUB, SOURCE_ID, {
      getOriginalBytes: vi.fn(),
      parse: vi.fn(),
      putText,
    });

    expect(result.outcome).toBe('skipped');
  });

  it('getSource still shows status ready (no mutation occurred)', async () => {
    const item = await getSource(SUB, SOURCE_ID);
    expect(item!.status).toBe('ready');
  });

  it('putText was never called (skipped early)', async () => {
    // Verify no side effects: re-run with a fresh spy
    const putText = vi.fn();
    await processSourceExtraction(SUB, SOURCE_ID, {
      getOriginalBytes: vi.fn(),
      parse: vi.fn(),
      putText,
    });
    expect(putText).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Integration: not_found — missing source returns not_found
// ---------------------------------------------------------------------------

describe('processSourceExtraction — not_found (source does not exist)', () => {
  it('returns outcome not_found for a non-existent source', async () => {
    const result = await processSourceExtraction('sub-nonexistent', 'src-nonexistent', {
      getOriginalBytes: vi.fn(),
      parse: vi.fn(),
      putText: vi.fn(),
    });
    expect(result.outcome).toBe('not_found');
  });
});
