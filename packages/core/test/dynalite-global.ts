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
import { DYNALITE_PORT, DYNALITE_ENDPOINT, USER_DATA_TABLE } from './dynalite-config.js';

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

  // Mirror infra/db.ts exactly: UserData table (pk HASH, sk RANGE, PAY_PER_REQUEST, streams).
  await ddbAdmin.send(
    new CreateTableCommand({
      TableName: USER_DATA_TABLE,
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: 'NEW_AND_OLD_IMAGES',
      },
    }),
  );

  ddbAdmin.destroy();

  // Return the teardown function — vitest calls it after all suites complete.
  return async () => {
    await closeServer(server);
  };
}
