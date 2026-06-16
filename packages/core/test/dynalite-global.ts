/**
 * Vitest globalSetup for the dynalite integration harness.
 *
 * Runs in the main vitest process (NOT in workers). Starts a dynalite
 * (in-memory DynamoDB) server, creates the tables that mirror `infra/db.ts`,
 * and returns a teardown function vitest calls after all suites finish.
 *
 * NOTE: Do NOT import `client.ts` here — this is harness infrastructure. The
 * DynamoDBClient constructed below uses an explicit endpoint for table setup;
 * the production client is pointed at dynalite purely via env vars set in
 * `integration-env.ts` (setupFiles), which run in workers before test files.
 */

import dynalite from 'dynalite';
import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb';
import type { Server } from 'node:http';
import { DYNALITE_PORT, DYNALITE_ENDPOINT, USER_DATA_TABLE, INVITES_TABLE, GROUPS_TABLE, NOTES_TABLE } from './dynalite-config.js';

function startServer(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, () => resolve());
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

export default async function setup() {
  const server = dynalite({ createTableMs: 0, deleteTableMs: 0, updateTableMs: 0 });
  await startServer(server, DYNALITE_PORT);

  // Harness-only client: explicit endpoint + dummy credentials.
  // The production client.ts is never touched here.
  const ddbAdmin = new DynamoDBClient({
    endpoint: DYNALITE_ENDPOINT,
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });

  // Mirror infra/db.ts exactly: UserData table (pk HASH, sk RANGE, GSI1, PAY_PER_REQUEST, streams).
  await ddbAdmin.send(
    new CreateTableCommand({
      TableName: USER_DATA_TABLE,
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
        { AttributeName: 'gsi1pk', AttributeType: 'S' },
        { AttributeName: 'gsi1sk', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'gsi1pk', KeyType: 'HASH' },
            { AttributeName: 'gsi1sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: 'NEW_AND_OLD_IMAGES',
      },
    }),
  );

  // Mirror infra/db.ts: Invites table (identical schema to UserData).
  await ddbAdmin.send(
    new CreateTableCommand({
      TableName: INVITES_TABLE,
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
        { AttributeName: 'gsi1pk', AttributeType: 'S' },
        { AttributeName: 'gsi1sk', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'gsi1pk', KeyType: 'HASH' },
            { AttributeName: 'gsi1sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: 'NEW_AND_OLD_IMAGES',
      },
    }),
  );

  // Mirror infra/db.ts: Groups table (identical schema to Invites).
  await ddbAdmin.send(
    new CreateTableCommand({
      TableName: GROUPS_TABLE,
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
        { AttributeName: 'gsi1pk', AttributeType: 'S' },
        { AttributeName: 'gsi1sk', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'gsi1pk', KeyType: 'HASH' },
            { AttributeName: 'gsi1sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: 'NEW_AND_OLD_IMAGES',
      },
    }),
  );

  // Mirror infra/db.ts: Notes table — pk/sk primary + GSI1 (UserNotesByTime, ALL) +
  // GSI2 (NotesByTag, KEYS_ONLY) + GSI3 (ByToken, KEYS_ONLY) + GSI4 (ByRecipient, ALL) +
  // GSI5 (ByDue, ALL) + GSI6 (StudySetsByUser, ALL) + GSI7 (StudySetsByNote, ALL) +
  // GSI8 (ByQuizAttempt, ALL).
  // No StreamSpecification — notes has no stream.
  await ddbAdmin.send(
    new CreateTableCommand({
      TableName: NOTES_TABLE,
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
        { AttributeName: 'gsi1pk', AttributeType: 'S' },
        { AttributeName: 'gsi1sk', AttributeType: 'S' },
        { AttributeName: 'gsi2pk', AttributeType: 'S' },
        { AttributeName: 'gsi2sk', AttributeType: 'S' },
        { AttributeName: 'gsi3pk', AttributeType: 'S' },
        { AttributeName: 'gsi3sk', AttributeType: 'S' },
        { AttributeName: 'gsi4pk', AttributeType: 'S' },
        { AttributeName: 'gsi4sk', AttributeType: 'S' },
        { AttributeName: 'gsi5pk', AttributeType: 'S' },
        { AttributeName: 'gsi5sk', AttributeType: 'S' },
        { AttributeName: 'gsi6pk', AttributeType: 'S' },
        { AttributeName: 'gsi6sk', AttributeType: 'S' },
        { AttributeName: 'gsi7pk', AttributeType: 'S' },
        { AttributeName: 'gsi7sk', AttributeType: 'S' },
        { AttributeName: 'gsi8pk', AttributeType: 'S' },
        { AttributeName: 'gsi8sk', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'gsi1pk', KeyType: 'HASH' },
            { AttributeName: 'gsi1sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'GSI2',
          KeySchema: [
            { AttributeName: 'gsi2pk', KeyType: 'HASH' },
            { AttributeName: 'gsi2sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'KEYS_ONLY' },
        },
        {
          IndexName: 'GSI3',
          KeySchema: [
            { AttributeName: 'gsi3pk', KeyType: 'HASH' },
            { AttributeName: 'gsi3sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'KEYS_ONLY' },
        },
        {
          IndexName: 'GSI4',
          KeySchema: [
            { AttributeName: 'gsi4pk', KeyType: 'HASH' },
            { AttributeName: 'gsi4sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'GSI5',
          KeySchema: [
            { AttributeName: 'gsi5pk', KeyType: 'HASH' },
            { AttributeName: 'gsi5sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'GSI6',
          KeySchema: [
            { AttributeName: 'gsi6pk', KeyType: 'HASH' },
            { AttributeName: 'gsi6sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'GSI7',
          KeySchema: [
            { AttributeName: 'gsi7pk', KeyType: 'HASH' },
            { AttributeName: 'gsi7sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'GSI8',
          KeySchema: [
            { AttributeName: 'gsi8pk', KeyType: 'HASH' },
            { AttributeName: 'gsi8sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );

  ddbAdmin.destroy();

  // Return the teardown function — vitest calls it after all suites complete.
  return async () => {
    await closeServer(server);
  };
}
