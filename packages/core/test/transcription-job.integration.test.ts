/**
 * Integration test: TranscriptionJob access pattern via the real production client.
 *
 * Uses the real `ddb` DocumentClient, `TableNames`, and `jobKeys` — no
 * mocks. The dynalite server is started by `dynalite-global.ts` (globalSetup)
 * and the production client is pointed at it via env vars set in
 * `integration-env.ts` (setupFiles).
 *
 * TranscriptionJob items live in the `UserData` table under the user's own
 * partition (PK = `USER#<sub>`, SK = `JOB#<jobId>`). No GSI — fetched by
 * PK+SK only.
 */

import { describe, it, expect } from 'vitest';
import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { jobKeys } from '../src/db/keys.js';

describe('TranscriptionJob — write/read round-trip', () => {
  it('reads back the exact item that was written (Test A)', async () => {
    const sub = 'cognito-sub-a1b2c3d4e5f6';
    const jobId = '01JABCDEF0123456789ABCDEFG';
    const now = '2024-06-01T10:00:00.000Z';

    const item = {
      ...jobKeys.job(sub, jobId),
      jobId,
      status: 'pending' as const,
      s3Key: `images/users/${sub}/${jobId}.jpg`,
      createdAt: now,
      updatedAt: now,
    };

    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: item,
      }),
    );

    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.UserData,
        Key: jobKeys.job(sub, jobId),
      }),
    );

    expect(Item).toEqual(item);
    expect(Item!.status).toBe('pending');
    expect(Item!.pk).toBe(`USER#${sub}`);
    expect(Item!.sk).toBe(`JOB#${jobId}`);
  });

  it('reflects a status update from pending to processing (Test B)', async () => {
    const sub = 'cognito-sub-b2c3d4e5f6a1';
    const jobId = '01JBCDEF01234567890BCDEFGH';
    const createdAt = '2024-06-02T11:00:00.000Z';
    const updatedAt = '2024-06-02T11:05:00.000Z';

    // Write a pending job first.
    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: {
          ...jobKeys.job(sub, jobId),
          jobId,
          status: 'pending',
          s3Key: `images/users/${sub}/${jobId}.jpg`,
          createdAt,
          updatedAt: createdAt,
        },
      }),
    );

    // Update status to processing — `status` is a DynamoDB reserved word so use
    // ExpressionAttributeNames to alias it.
    await ddb.send(
      new UpdateCommand({
        TableName: TableNames.UserData,
        Key: jobKeys.job(sub, jobId),
        UpdateExpression: 'SET #s = :s, updatedAt = :updatedAt',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':s': 'processing',
          ':updatedAt': updatedAt,
        },
      }),
    );

    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.UserData,
        Key: jobKeys.job(sub, jobId),
      }),
    );

    expect(Item).toBeDefined();
    expect(Item!.status).toBe('processing');
    expect(Item!.pk).toBe(`USER#${sub}`);
    expect(Item!.sk).toBe(`JOB#${jobId}`);
  });

  it('returns undefined Item for a non-existent jobId (Test C)', async () => {
    const sub = 'cognito-sub-c3d4e5f6a1b2';
    const jobId = '01JCDEF012345678901CDEFGHI';

    const { Item } = await ddb.send(
      new GetCommand({
        TableName: TableNames.UserData,
        Key: jobKeys.job(sub, jobId),
      }),
    );

    expect(Item).toBeUndefined();
  });
});
