/**
 * Vitest setupFiles for the dynalite integration harness.
 *
 * Runs in each vitest worker process BEFORE any test file is imported. Sets
 * the env vars that point the production `client.ts` at the dynalite server.
 * The AWS SDK reads `AWS_ENDPOINT_URL_DYNAMODB` natively — no modification to
 * client.ts is needed.
 *
 * These must be set synchronously at module top level so they are in place
 * before `client.ts` constructs its DynamoDBClient on first import.
 */

import { DYNALITE_ENDPOINT, USER_DATA_TABLE, INVITES_TABLE, GROUPS_TABLE } from './dynalite-config.js';

process.env.AWS_ENDPOINT_URL_DYNAMODB = DYNALITE_ENDPOINT;
process.env.SST_RESOURCE_UserData_name = USER_DATA_TABLE;
process.env.SST_RESOURCE_Invites_name = INVITES_TABLE;
process.env.SST_RESOURCE_Groups_name = GROUPS_TABLE;
process.env.AWS_REGION ??= 'us-east-1';
process.env.AWS_ACCESS_KEY_ID ??= 'test';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test';
