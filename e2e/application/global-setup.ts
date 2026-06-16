/**
 * Playwright globalSetup for the authed application E2E suite.
 *
 * Boots ALL offline services and spawns next dev, then returns a teardown
 * function Playwright calls after the run. No webServer config is used —
 * all ordering is handled here.
 *
 * Services started:
 *  1. dynalite (in-process) on port 4570 — in-memory DynamoDB
 *  2. cognito-local (child process) on port 9229 — Cognito emulator
 *  3. s3rver (in-process) on port 4572 — in-memory S3
 *  4. next dev -p 3002 (child process) with env pointing at all three
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import dynalite from 'dynalite';
import S3rver from 's3rver';
import type { Server } from 'node:http';
import {
  CognitoIdentityProviderClient,
  CreateUserPoolCommand,
  CreateUserPoolClientCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  CreateGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildInviteItem,
  hashInviteCode,
  buildUserProfileItem,
  buildAccessRequestItem,
  buildGroupMetaItem,
  buildGroupMemberItem,
} from '@transformmynotes/core';

const DYNALITE_PORT = 4570; // distinct from integration harness port (4569)
const COGNITO_PORT = 9229;
const S3RVER_PORT = 4572;
const NEXT_PORT = 3002;
const NOTES_BUCKET = 'notes-bucket';
const RUNTIME_FILE = path.join(__dirname, '.e2e-runtime.json');

// Test invite constants
const INVITE_CODE = 'TESTINVITE01';
const INVITE_EMAIL = 'invitee@example.com';

// Forgot-password test user
const FORGOT_USERNAME = 'forgot-user@example.com';
const FORGOT_INITIAL_PASSWORD = 'ForgotInit1!Password';
const FORGOT_NEW_PASSWORD = 'ForgotNew99!Password';

// Admin user
const ADMIN_USERNAME = 'e2e-admin@example.com';
const ADMIN_PASSWORD = 'Admin1234!Password';

// Library test user (dedicated to library.spec — avoids collision with capture-flow)
const LIBRARY_USERNAME = 'e2e-library@example.com';
const LIBRARY_PASSWORD = 'Library1234!Password';

// Review test user (dedicated to review.e2e — starts with zero cards)
const REVIEW_USERNAME = 'e2e-review@example.com';
const REVIEW_PASSWORD = 'Review1234!Password';

// Share test users (dedicated to sharing.e2e)
const SHARE_OWNER_USERNAME = 'e2e-share-owner@example.com';
const SHARE_OWNER_PASSWORD = 'ShareOwner1!Password';
const SHARE_RECIPIENT_USERNAME = 'e2e-share-recipient@example.com';
const SHARE_RECIPIENT_PASSWORD = 'ShareRecip1!Password';

// Share group constant
const SHARE_GROUP_ID = 'e2e-share-group';

// Pending users (for admin pending-queue tests)
const PENDING_USER1_EMAIL = 'e2e-pending1@example.com';
const PENDING_USER1_PASSWORD = 'Pending1234!Password';
// Deterministic access-request IDs so the seeded items are stable across runs
const PENDING_USER1_REQUEST_ID = 'e2e-access-req-pending1';

const PENDING_USER2_EMAIL = 'e2e-pending2@example.com';
const PENDING_USER2_PASSWORD = 'Pending5678!Password';
const PENDING_USER2_REQUEST_ID = 'e2e-access-req-pending2';

// Revokable invite (seeded code invite for revoke test)
const REVOKABLE_INVITE_LABEL = 'E2E-REVOKE-ME';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── dynalite ──────────────────────────────────────────────────────────────────

function startDynalite(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = dynalite({ createTableMs: 0, deleteTableMs: 0, updateTableMs: 0 });
    server.on('error', reject);
    server.listen(port, () => resolve(server as unknown as Server));
  });
}

async function createDynaliteTables(port: number) {
  const client = new DynamoDBClient({
    endpoint: `http://127.0.0.1:${port}`,
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });

  // UserData table (with GSI1 to match infra/db.ts)
  await client.send(
    new CreateTableCommand({
      TableName: 'UserData',
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

  // Invites table (with GSI1 to match infra/db.ts)
  await client.send(
    new CreateTableCommand({
      TableName: 'Invites',
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

  // Notes table (with GSI1 UserNotesByTime + GSI2 NotesByTag + GSI3 ByToken + GSI4 ByRecipient + GSI5 ByDue +
  // GSI6 StudySetsByUser + GSI7 StudySetsByNote, to match infra/db.ts)
  await client.send(
    new CreateTableCommand({
      TableName: 'Notes',
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
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );

  // Groups table (PK = GROUP#<groupId>, SK = META | MEMBER#<userSub>; GSI1 = user→groups)
  await client.send(
    new CreateTableCommand({
      TableName: 'Groups',
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

  client.destroy();
}

async function seedInvite(port: number) {
  const dynamoClient = new DynamoDBClient({
    endpoint: `http://127.0.0.1:${port}`,
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  const docClient = DynamoDBDocumentClient.from(dynamoClient);

  const item = buildInviteItem({
    codeHash: hashInviteCode(INVITE_CODE),
    type: 'email',
    targetEmail: INVITE_EMAIL,
    groupName: 'E2E Test Group',
    inviterName: 'E2E Admin',
    maxUses: 1,
    status: 'pending',
  });

  await docClient.send(
    new PutCommand({
      TableName: 'Invites',
      Item: item,
    }),
  );

  docClient.destroy();
  dynamoClient.destroy();
}

async function seedRevokableInvite(port: number): Promise<string> {
  const dynamoClient = new DynamoDBClient({
    endpoint: `http://127.0.0.1:${port}`,
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  const docClient = DynamoDBDocumentClient.from(dynamoClient);

  // Generate a deterministic hash from the label so the codeHash is known at setup time
  const codeHash = hashInviteCode(REVOKABLE_INVITE_LABEL + '-seed');

  const item = buildInviteItem({
    codeHash,
    type: 'code',
    label: REVOKABLE_INVITE_LABEL,
    maxUses: 25,
    status: 'pending',
  });

  await docClient.send(
    new PutCommand({
      TableName: 'Invites',
      Item: item,
    }),
  );

  docClient.destroy();
  dynamoClient.destroy();

  return codeHash;
}

// ── s3rver ────────────────────────────────────────────────────────────────────

async function startS3rver(port: number, directory: string): Promise<S3rver> {
  const s3 = new S3rver({
    port,
    address: '127.0.0.1',
    silent: true,
    directory,
    resetOnClose: true,
    // Use path-style addressing (http://host:port/bucket/key)
    // rather than virtual-host style (http://bucket.host:port/key)
    vhostBuckets: false,
    // Skip AWS signature validation — test credentials ('test/test') are not real
    allowMismatchedSignatures: true,
    configureBuckets: [{ name: NOTES_BUCKET, configs: [] }],
  });
  await s3.run();
  return s3;
}

// ── cognito-local ─────────────────────────────────────────────────────────────

function spawnCognitoLocal(port: number, dataDir: string): ChildProcess {
  const cognitoProc = spawn(
    'node',
    [require.resolve('cognito-local/lib/bin/start.js')],
    {
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        COGNITO_LOCAL_DEVMODE: '1',
        // Deterministic OTP for forgot-password flow
        CODE: '123456',
      },
      cwd: dataDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    },
  );
  return cognitoProc;
}

async function waitForCognitoLocal(port: number, timeoutMs = 30_000): Promise<void> {
  const cognitoClient = new CognitoIdentityProviderClient({
    endpoint: `http://127.0.0.1:${port}`,
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // A light probe: CreateUserPool succeeds fast when cognito-local is ready.
      await cognitoClient.send(new CreateUserPoolCommand({ PoolName: '__probe__' }));
      return;
    } catch {
      await sleep(300);
    }
  }
  throw new Error(`cognito-local on port ${port} did not become ready within ${timeoutMs}ms`);
}

// ── seed user pool + users ────────────────────────────────────────────────────

async function seedCognito(port: number, username: string, password: string) {
  const cognitoClient = new CognitoIdentityProviderClient({
    endpoint: `http://127.0.0.1:${port}`,
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });

  const poolResp = await cognitoClient.send(
    new CreateUserPoolCommand({ PoolName: 'e2e-test-pool' }),
  );
  const poolId = poolResp.UserPool!.Id!;

  const clientResp = await cognitoClient.send(
    new CreateUserPoolClientCommand({
      UserPoolId: poolId,
      ClientName: 'e2e-test-client',
      ExplicitAuthFlows: [
        'ALLOW_USER_SRP_AUTH',
        'ALLOW_USER_PASSWORD_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH',
      ],
    }),
  );
  const clientId = clientResp.UserPoolClient!.ClientId!;

  // Create Cognito groups needed by invite redeem
  await cognitoClient.send(
    new CreateGroupCommand({ UserPoolId: poolId, GroupName: 'member' }),
  );
  await cognitoClient.send(
    new CreateGroupCommand({ UserPoolId: poolId, GroupName: 'admin' }),
  );

  // Primary test user (login + invite auto-signin tests)
  const mainUserResp = await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: username,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: username },
        { Name: 'email_verified', Value: 'true' },
      ],
    }),
  );
  const mainUserSub = mainUserResp.User!.Attributes!.find((a) => a.Name === 'sub')!.Value!;

  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: username,
      Password: password,
      Permanent: true,
    }),
  );

  // Dedicated forgot-password test user
  const forgotUserResp = await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: FORGOT_USERNAME,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: FORGOT_USERNAME },
        { Name: 'email_verified', Value: 'true' },
      ],
    }),
  );
  const forgotUserSub = forgotUserResp.User!.Attributes!.find((a) => a.Name === 'sub')!.Value!;

  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: FORGOT_USERNAME,
      Password: FORGOT_INITIAL_PASSWORD,
      Permanent: true,
    }),
  );

  // ── Admin user ──────────────────────────────────────────────────────────────
  // Created in cognito-local, then added to the 'admin' group so the issued JWT
  // carries `cognito:groups: ['admin']` and the admin nav / /admin/** routes are
  // accessible.
  //
  // ⚠️ RISK #1 note: cognito-local's AdminAddUserToGroup resolves the Username
  // by first doing an exact match on the stored username string, then falling
  // back to matching the 'sub' attribute. Since we seed with Username=email,
  // passing the sub here also works (cognito-local iterates users and compares
  // the sub attribute). The approve route passes sub as Username for
  // AdminAddUserToGroup — empirically verified to work with cognito-local.
  const adminUserResp = await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: ADMIN_USERNAME,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: ADMIN_USERNAME },
        { Name: 'email_verified', Value: 'true' },
      ],
    }),
  );
  const adminUserSub = adminUserResp.User!.Attributes!.find((a) => a.Name === 'sub')!.Value!;

  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: ADMIN_USERNAME,
      Password: ADMIN_PASSWORD,
      Permanent: true,
    }),
  );

  // Add admin user to the 'admin' Cognito group — this makes the JWT include
  // `cognito:groups: ['admin']` which is what proxy.ts and the admin layout gate on.
  await cognitoClient.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: poolId,
      Username: ADMIN_USERNAME,
      GroupName: 'admin',
    }),
  );

  // ── Pending users ───────────────────────────────────────────────────────────
  // Two pending users for the admin pending-queue tests. Created in cognito-local
  // (so they can sign in after approval) with stable emails and passwords.
  // Their subs are captured so the DynamoDB profile can use the same sub, which
  // is critical: the approve route calls AdminAddUserToGroup({Username: sub}).
  // pendingUser1: has groupIds=['e2e-group'] → renders 'Invited' badge
  // pendingUser2: has groupIds=[]             → renders 'No invite code' badge
  const pendingUser1Resp = await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: PENDING_USER1_EMAIL,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: PENDING_USER1_EMAIL },
        { Name: 'email_verified', Value: 'true' },
      ],
    }),
  );
  const pendingUser1Sub = pendingUser1Resp.User!.Attributes!.find((a) => a.Name === 'sub')!.Value!;

  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: PENDING_USER1_EMAIL,
      Password: PENDING_USER1_PASSWORD,
      Permanent: true,
    }),
  );

  const pendingUser2Resp = await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: PENDING_USER2_EMAIL,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: PENDING_USER2_EMAIL },
        { Name: 'email_verified', Value: 'true' },
      ],
    }),
  );
  const pendingUser2Sub = pendingUser2Resp.User!.Attributes!.find((a) => a.Name === 'sub')!.Value!;

  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: PENDING_USER2_EMAIL,
      Password: PENDING_USER2_PASSWORD,
      Permanent: true,
    }),
  );

  // ── Library test user ──────────────────────────────────────────────────────
  // Dedicated to library.spec tests; kept separate from mainUser so the
  // empty-state assertion sees a clean zero-note user at suite start.
  const libraryUserResp = await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: LIBRARY_USERNAME,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: LIBRARY_USERNAME },
        { Name: 'email_verified', Value: 'true' },
      ],
    }),
  );
  const libraryUserSub = libraryUserResp.User!.Attributes!.find((a) => a.Name === 'sub')!.Value!;

  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: LIBRARY_USERNAME,
      Password: LIBRARY_PASSWORD,
      Permanent: true,
    }),
  );

  // ── Review test user ────────────────────────────────────────────────────────
  // Dedicated to review.e2e tests; kept separate from other users so the
  // zero-card state assertion is clean at suite start.
  const reviewUserResp = await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: REVIEW_USERNAME,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: REVIEW_USERNAME },
        { Name: 'email_verified', Value: 'true' },
      ],
    }),
  );
  const reviewUserSub = reviewUserResp.User!.Attributes!.find((a) => a.Name === 'sub')!.Value!;

  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: REVIEW_USERNAME,
      Password: REVIEW_PASSWORD,
      Permanent: true,
    }),
  );

  // ── Share owner ──────────────────────────────────────────────────────────────
  // Dedicated to sharing.e2e; owns the note that gets shared.
  const shareOwnerResp = await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: SHARE_OWNER_USERNAME,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: SHARE_OWNER_USERNAME },
        { Name: 'email_verified', Value: 'true' },
      ],
    }),
  );
  const shareOwnerSub = shareOwnerResp.User!.Attributes!.find((a) => a.Name === 'sub')!.Value!;

  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: SHARE_OWNER_USERNAME,
      Password: SHARE_OWNER_PASSWORD,
      Permanent: true,
    }),
  );

  // ── Share recipient ───────────────────────────────────────────────────────────
  // Dedicated to sharing.e2e; receives the shared note.
  const shareRecipientResp = await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: SHARE_RECIPIENT_USERNAME,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: SHARE_RECIPIENT_USERNAME },
        { Name: 'email_verified', Value: 'true' },
      ],
    }),
  );
  const shareRecipientSub = shareRecipientResp.User!.Attributes!.find((a) => a.Name === 'sub')!.Value!;

  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: SHARE_RECIPIENT_USERNAME,
      Password: SHARE_RECIPIENT_PASSWORD,
      Permanent: true,
    }),
  );

  cognitoClient.destroy();
  return {
    poolId,
    clientId,
    mainUserSub,
    forgotUserSub,
    adminUserSub,
    pendingUser1Sub,
    pendingUser2Sub,
    libraryUserSub,
    reviewUserSub,
    shareOwnerSub,
    shareRecipientSub,
  };
}

async function seedUserProfiles(
  dynalitePort: number,
  users: Array<{ sub: string; email: string }>,
) {
  const dynamoClient = new DynamoDBClient({
    endpoint: `http://127.0.0.1:${dynalitePort}`,
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  const docClient = DynamoDBDocumentClient.from(dynamoClient);

  for (const user of users) {
    const profile = buildUserProfileItem({
      sub: user.sub,
      email: user.email,
      name: user.email,
      status: 'active',
      role: 'member',
    });
    await docClient.send(
      new PutCommand({
        TableName: 'UserData',
        Item: profile,
      }),
    );
  }

  docClient.destroy();
  dynamoClient.destroy();
}

async function seedAdminProfile(
  dynalitePort: number,
  sub: string,
  email: string,
) {
  const dynamoClient = new DynamoDBClient({
    endpoint: `http://127.0.0.1:${dynalitePort}`,
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  const docClient = DynamoDBDocumentClient.from(dynamoClient);

  const profile = buildUserProfileItem({
    sub,
    email,
    name: 'E2E Admin',
    status: 'active',
    role: 'admin',
  });

  await docClient.send(
    new PutCommand({
      TableName: 'UserData',
      Item: profile,
    }),
  );

  docClient.destroy();
  dynamoClient.destroy();
}

async function seedPendingUserProfiles(
  dynalitePort: number,
  users: Array<{ sub: string; email: string; groupIds: string[] }>,
) {
  const dynamoClient = new DynamoDBClient({
    endpoint: `http://127.0.0.1:${dynalitePort}`,
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  const docClient = DynamoDBDocumentClient.from(dynamoClient);

  for (const user of users) {
    const profile = buildUserProfileItem({
      sub: user.sub,
      email: user.email,
      name: user.email,
      status: 'pending',
      role: 'member',
      groupIds: user.groupIds,
    });
    await docClient.send(
      new PutCommand({
        TableName: 'UserData',
        Item: profile,
      }),
    );
  }

  docClient.destroy();
  dynamoClient.destroy();
}

async function seedAccessRequests(
  dynalitePort: number,
  users: Array<{ id: string; email: string; name: string }>,
) {
  const dynamoClient = new DynamoDBClient({
    endpoint: `http://127.0.0.1:${dynalitePort}`,
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  const docClient = DynamoDBDocumentClient.from(dynamoClient);

  for (const user of users) {
    const item = buildAccessRequestItem({
      id: user.id,
      email: user.email,
      name: user.name,
      status: 'new',
    });
    await docClient.send(
      new PutCommand({
        TableName: 'UserData',
        Item: item,
      }),
    );
  }

  docClient.destroy();
  dynamoClient.destroy();
}

async function seedShareGroup(
  dynalitePort: number,
  groupId: string,
  ownerSub: string,
  recipientSub: string,
) {
  const dynamoClient = new DynamoDBClient({
    endpoint: `http://127.0.0.1:${dynalitePort}`,
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  const docClient = DynamoDBDocumentClient.from(dynamoClient);

  const metaItem = buildGroupMetaItem({
    groupId,
    name: 'E2E Share Group',
    createdBy: ownerSub,
  });

  const ownerMemberItem = buildGroupMemberItem({
    groupId,
    userSub: ownerSub,
    role: 'admin',
  });

  const recipientMemberItem = buildGroupMemberItem({
    groupId,
    userSub: recipientSub,
    role: 'member',
  });

  await docClient.send(new PutCommand({ TableName: 'Groups', Item: metaItem }));
  await docClient.send(new PutCommand({ TableName: 'Groups', Item: ownerMemberItem }));
  await docClient.send(new PutCommand({ TableName: 'Groups', Item: recipientMemberItem }));

  docClient.destroy();
  dynamoClient.destroy();
}

// ── next dev ──────────────────────────────────────────────────────────────────

function spawnNextDev(
  appEnv: NodeJS.ProcessEnv,
  repoRoot: string,
): ChildProcess {
  const proc = spawn('npm', ['run', 'dev:application'], {
    env: appEnv,
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  return proc;
}

async function waitForNextDev(port: number, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  throw new Error(`next dev on port ${port} did not become ready within ${timeoutMs}ms`);
}

// ── globalSetup entry point ───────────────────────────────────────────────────

export default async function globalSetup(): Promise<() => Promise<void>> {
  const username = process.env.COGNITO_TEST_USERNAME ?? 'e2e-user@example.com';
  const password = process.env.COGNITO_TEST_PASSWORD ?? 'Test1234!Password';

  // 1. Start dynalite
  const dynaliteServer = await startDynalite(DYNALITE_PORT);
  await createDynaliteTables(DYNALITE_PORT);

  // 1b. Start s3rver (in-memory S3)
  const s3DataDir = fs.mkdtempSync(path.join(os.tmpdir(), 's3rver-e2e-'));
  const s3rverInstance = await startS3rver(S3RVER_PORT, s3DataDir);

  // Seed the test invite into the Invites table (for auth.spec invite test)
  await seedInvite(DYNALITE_PORT);

  // Seed the revokable code invite for admin.spec revoke test
  const revokableInviteCodeHash = await seedRevokableInvite(DYNALITE_PORT);

  // 2. Start cognito-local
  const cognitoDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognito-local-e2e-'));
  const cognitoProc = spawnCognitoLocal(COGNITO_PORT, cognitoDataDir);
  await waitForCognitoLocal(COGNITO_PORT);

  // 3. Seed user pool + users
  const {
    poolId,
    clientId,
    mainUserSub,
    forgotUserSub,
    adminUserSub,
    pendingUser1Sub,
    pendingUser2Sub,
    libraryUserSub,
    reviewUserSub,
    shareOwnerSub,
    shareRecipientSub,
  } = await seedCognito(COGNITO_PORT, username, password);

  // 3b. Seed UserData profiles for pre-seeded users so requireActiveUser() passes
  await seedUserProfiles(DYNALITE_PORT, [
    { sub: mainUserSub, email: username },
    { sub: forgotUserSub, email: FORGOT_USERNAME },
    { sub: libraryUserSub, email: LIBRARY_USERNAME },
    { sub: reviewUserSub, email: REVIEW_USERNAME },
    { sub: shareOwnerSub, email: SHARE_OWNER_USERNAME },
    { sub: shareRecipientSub, email: SHARE_RECIPIENT_USERNAME },
  ]);

  // 3c. Seed admin profile (role:'admin', status:'active')
  await seedAdminProfile(DYNALITE_PORT, adminUserSub, ADMIN_USERNAME);

  // 3d. Seed access requests (status:'new') for the pending-queue admin tests.
  // The /admin/pending page fetches /api/admin/access-requests?status=new, which
  // queries UserData GSI1 for gsi1pk = 'ACCESSREQ_STATUS#new'. The old harness
  // was seeding user profiles (status:'pending') which the page never shows.
  await seedAccessRequests(DYNALITE_PORT, [
    { id: PENDING_USER1_REQUEST_ID, email: PENDING_USER1_EMAIL, name: PENDING_USER1_EMAIL },
    { id: PENDING_USER2_REQUEST_ID, email: PENDING_USER2_EMAIL, name: PENDING_USER2_EMAIL },
  ]);

  // 3e. Seed the share group (owner + recipient as admin/member)
  await seedShareGroup(DYNALITE_PORT, SHARE_GROUP_ID, shareOwnerSub, shareRecipientSub);

  // 4. Build env for next dev
  const repoRoot = path.resolve(__dirname, '..', '..');
  const appEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: poolId,
    NEXT_PUBLIC_COGNITO_CLIENT_ID: clientId,
    NEXT_PUBLIC_COGNITO_ENDPOINT: `http://127.0.0.1:${COGNITO_PORT}`,
    COGNITO_ISSUER: `http://127.0.0.1:${COGNITO_PORT}/${poolId}`,
    COGNITO_JWKS_URI: `http://127.0.0.1:${COGNITO_PORT}/${poolId}/.well-known/jwks.json`,
    AWS_ENDPOINT_URL_DYNAMODB: `http://127.0.0.1:${DYNALITE_PORT}`,
    // Redirect the redeem route's server-side Cognito admin client to cognito-local
    AWS_ENDPOINT_URL_COGNITO_IDENTITY_PROVIDER: `http://127.0.0.1:${COGNITO_PORT}`,
    SST_RESOURCE_UserData_name: 'UserData',
    SST_RESOURCE_Invites_name: 'Invites',
    SST_RESOURCE_Groups_name: 'Groups',
    SST_RESOURCE_Notes_name: 'Notes',
    SST_RESOURCE_NotesBucket_name: NOTES_BUCKET,
    // Point the S3Client at s3rver. AWS SDK v3 uses path-style automatically
    // when a custom endpoint is set (bucket in path, not hostname).
    AWS_ENDPOINT_URL_S3: `http://127.0.0.1:${S3RVER_PORT}`,
    AWS_REGION: 'us-east-1',
    // s3rver's hardcoded dummy credentials (node_modules/s3rver/lib/models/account.js)
    AWS_ACCESS_KEY_ID: 'S3RVER',
    AWS_SECRET_ACCESS_KEY: 'S3RVER',
    // Cloudflare Turnstile always-pass test keys (see https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
    // The sitekey causes the widget to auto-resolve in the browser; the secret key
    // short-circuits verifyTurnstile() without making a network call to challenges.cloudflare.com.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    // Disable the live Turnstile widget for offline E2E — the widget script can't reach
    // cloudflare.com in CI; the server still short-circuits verifyTurnstile() on the test secret.
    NEXT_PUBLIC_TURNSTILE_DISABLED: '1',
    // Disable per-IP DynamoDB-backed rate limiting for the offline E2E suite — all 37 tests
    // sign in from the same localhost IP, which would trip the 10-logins/60s limit after 10 attempts.
    // This var is NEVER added to the SST environment map, so production and pr-<N> always rate-limit normally.
    RATE_LIMIT_DISABLED: '1',
  };

  // 5. Spawn next dev
  const nextProc = spawnNextDev(appEnv, repoRoot);

  // Forward next dev output (optional: helps debug failures)
  nextProc.stdout?.on('data', (d: Buffer) => process.stdout.write(d));
  nextProc.stderr?.on('data', (d: Buffer) => process.stderr.write(d));

  await waitForNextDev(NEXT_PORT);

  // 6. Persist runtime info for the spec files
  const runtime = {
    poolId,
    clientId,
    username,
    password,
    cognitoEndpoint: `http://127.0.0.1:${COGNITO_PORT}`,
    inviteCode: INVITE_CODE,
    inviteEmail: INVITE_EMAIL,
    forgotUsername: FORGOT_USERNAME,
    forgotInitialPassword: FORGOT_INITIAL_PASSWORD,
    forgotNewPassword: FORGOT_NEW_PASSWORD,
    // Admin user
    adminUsername: ADMIN_USERNAME,
    adminPassword: ADMIN_PASSWORD,
    // Pending users for admin tests
    pendingUser1: {
      email: PENDING_USER1_EMAIL,
      password: PENDING_USER1_PASSWORD,
      sub: pendingUser1Sub,
    },
    pendingUser2: {
      email: PENDING_USER2_EMAIL,
      password: PENDING_USER2_PASSWORD,
      sub: pendingUser2Sub,
    },
    // Revokable invite
    revokableInvite: {
      label: REVOKABLE_INVITE_LABEL,
      codeHash: revokableInviteCodeHash,
    },
    // Primary user sub (used by capture-flow spec to verify DynamoDB entries)
    mainUserSub,
    // Library test user (dedicated to library.spec — starts with zero notes)
    libraryUsername: LIBRARY_USERNAME,
    libraryPassword: LIBRARY_PASSWORD,
    libraryUserSub,
    // Review test user (dedicated to review.e2e — starts with zero cards)
    reviewUsername: REVIEW_USERNAME,
    reviewPassword: REVIEW_PASSWORD,
    reviewUserSub,
    // Share test users (sharing.e2e)
    shareOwnerUsername: SHARE_OWNER_USERNAME,
    shareOwnerPassword: SHARE_OWNER_PASSWORD,
    shareOwnerSub,
    shareRecipientUsername: SHARE_RECIPIENT_USERNAME,
    shareRecipientPassword: SHARE_RECIPIENT_PASSWORD,
    shareRecipientSub,
    shareGroupId: SHARE_GROUP_ID,
    // S3rver info
    s3Endpoint: `http://127.0.0.1:${S3RVER_PORT}`,
    notesBucket: NOTES_BUCKET,
    nextPid: nextProc.pid,
    cognitoPid: cognitoProc.pid,
    dynalitePort: DYNALITE_PORT,
    notesTable: 'Notes',
  };
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify(runtime, null, 2));

  // 7. Return teardown
  return async function globalTeardown() {
    // Kill next dev process group
    if (nextProc.pid) {
      try {
        process.kill(-nextProc.pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
    // Kill cognito-local process group
    if (cognitoProc.pid) {
      try {
        process.kill(-cognitoProc.pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
    // Close s3rver
    try {
      await s3rverInstance.close();
    } catch {
      // already gone
    }
    // Close dynalite
    await new Promise<void>((resolve) => {
      dynaliteServer.close(() => resolve());
    });
    // Clean up runtime file
    try {
      fs.unlinkSync(RUNTIME_FILE);
    } catch {
      // ignore
    }
  };
}
