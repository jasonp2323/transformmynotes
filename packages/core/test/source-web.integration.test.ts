/**
 * Integration test: SOURCE# web item shape + findSourceByUrlHash (M21.2.1 + M21.2.2).
 *
 * Tests that a web SOURCE# item can be written with all M21 web fields
 * (sourceUrl, urlHash, fetchedAt, fetchedBy) and retrieved by PK+SK and via
 * urlHash query.
 */

import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import {
  buildSourceItem,
  getSource,
  findSourceByUrlHash,
} from '../src/db/sources.js';

const computeUrlHash = (url: string) =>
  createHash('sha256').update(url).digest('hex');

describe('web SOURCE# item — write / read round-trip with web fields', () => {
  const SUB = 'sub-web-source-001';
  const SOURCE_URL = 'https://en.wikipedia.org/wiki/Photosynthesis';
  const URL_HASH = computeUrlHash(SOURCE_URL);
  const SOURCE_ID = 'src-web-aaa-001';

  const WEB_SRC = {
    sourceId: SOURCE_ID,
    type: 'web' as const,
    title: 'Photosynthesis - Wikipedia',
    status: 'ready' as const,
    originalFormat: 'md' as const,
    originalS3Key: `sources/users/${SUB}/${SOURCE_ID}.md`,
    extractedTextS3Key: `sources/users/${SUB}/${SOURCE_ID}.md`,
    byteSize: 4096,
    sourceUrl: SOURCE_URL,
    urlHash: URL_HASH,
    fetchedAt: '2026-06-18T12:00:00.000Z',
    fetchedBy: SUB,
    createdAt: '2026-06-18T12:00:00.000Z',
  };

  it('setup: writes a web source item', async () => {
    await ddb.send(
      new PutCommand({
        TableName: TableNames.Notes,
        Item: buildSourceItem({ sub: SUB, ...WEB_SRC }),
      }),
    );
  });

  it('getSource returns item with all web fields present', async () => {
    const item = await getSource(SUB, SOURCE_ID);
    expect(item).toBeDefined();
    expect(item!.type).toBe('web');
    expect(item!.sourceUrl).toBe(SOURCE_URL);
    expect(item!.urlHash).toBe(URL_HASH);
    expect(item!.fetchedAt).toBe(WEB_SRC.fetchedAt);
    expect(item!.fetchedBy).toBe(SUB);
    expect(item!.originalFormat).toBe('md');
    expect(item!.byteSize).toBe(WEB_SRC.byteSize);
  });

  it('urlHash equals the SHA-256 of the source URL', async () => {
    const item = await getSource(SUB, SOURCE_ID);
    expect(item!.urlHash).toBe(computeUrlHash(SOURCE_URL));
  });

  it('findSourceByUrlHash returns the item for a matching hash', async () => {
    const found = await findSourceByUrlHash(SUB, URL_HASH);
    expect(found).toBeDefined();
    expect(found!.sourceId).toBe(SOURCE_ID);
    expect(found!.urlHash).toBe(URL_HASH);
  });

  it('findSourceByUrlHash returns undefined for a non-matching hash', async () => {
    const notFound = await findSourceByUrlHash(SUB, 'nonexistent-hash-value');
    expect(notFound).toBeUndefined();
  });

  it('findSourceByUrlHash does NOT return items for a different user', async () => {
    const OTHER_SUB = 'sub-web-source-other';
    // Other user has no items, so querying with OTHER_SUB should return undefined
    const notFound = await findSourceByUrlHash(OTHER_SUB, URL_HASH);
    expect(notFound).toBeUndefined();
  });
});
