import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Single shared DynamoDB DocumentClient for the whole app.
// The SDK reads region + credentials from the standard env/SST bindings, and
// AWS_ENDPOINT_URL_DYNAMODB natively (used by the offline dynalite harness),
// so this client is identical in production and in tests — never construct it
// with an explicit endpoint here.
const client = new DynamoDBClient({});

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

function requireTableName(envVar: string): string {
  const value = process.env[envVar];
  if (!value) {
    throw new Error(
      `Missing required env var ${envVar}: the DynamoDB table name is not bound. ` +
        `Expected it from the SST resource link (production) or the test harness (dynalite).`,
    );
  }
  return value;
}

/**
 * Resolved DynamoDB table names, read from the SST resource bindings via
 * `process.env.SST_RESOURCE_<Table>_name`. Lazy getters so importing this
 * module never throws — a missing binding fails loudly only on first access.
 * Add a getter here for every table defined in `infra/db.ts`.
 */
export const TableNames = {
  get UserData(): string {
    return requireTableName('SST_RESOURCE_UserData_name');
  },
} as const;
