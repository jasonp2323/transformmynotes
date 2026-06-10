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
 *  3. next dev -p 3002 (child process) with env pointing at both
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import dynalite from 'dynalite';
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
import { buildInviteItem, hashInviteCode, buildUserProfileItem } from '@transformmynotes/core';

const DYNALITE_PORT = 4570; // distinct from integration harness port (4569)
const COGNITO_PORT = 9229;
const NEXT_PORT = 3002;
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

// Pending users (for admin pending-queue tests)
const PENDING_USER1_EMAIL = 'e2e-pending1@example.com';
const PENDING_USER1_PASSWORD = 'Pending1234!Password';

const PENDING_USER2_EMAIL = 'e2e-pending2@example.com';
const PENDING_USER2_PASSWORD = 'Pending5678!Password';

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

  cognitoClient.destroy();
  return {
    poolId,
    clientId,
    mainUserSub,
    forgotUserSub,
    adminUserSub,
    pendingUser1Sub,
    pendingUser2Sub,
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
  } = await seedCognito(COGNITO_PORT, username, password);

  // 3b. Seed UserData profiles for pre-seeded users so requireActiveUser() passes
  await seedUserProfiles(DYNALITE_PORT, [
    { sub: mainUserSub, email: username },
    { sub: forgotUserSub, email: FORGOT_USERNAME },
  ]);

  // 3c. Seed admin profile (role:'admin', status:'active')
  await seedAdminProfile(DYNALITE_PORT, adminUserSub, ADMIN_USERNAME);

  // 3d. Seed pending user profiles (status:'pending', role:'member')
  // pendingUser1 has groupIds=['e2e-group'] → shows 'Invited' badge
  // pendingUser2 has groupIds=[]            → shows 'No invite code' badge
  await seedPendingUserProfiles(DYNALITE_PORT, [
    { sub: pendingUser1Sub, email: PENDING_USER1_EMAIL, groupIds: ['e2e-group'] },
    { sub: pendingUser2Sub, email: PENDING_USER2_EMAIL, groupIds: [] },
  ]);

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
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'test',
    AWS_SECRET_ACCESS_KEY: 'test',
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
    nextPid: nextProc.pid,
    cognitoPid: cognitoProc.pid,
    dynalitePort: DYNALITE_PORT,
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
