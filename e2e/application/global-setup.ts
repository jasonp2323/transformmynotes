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
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb';

const DYNALITE_PORT = 4570; // distinct from integration harness port (4569)
const COGNITO_PORT = 9229;
const NEXT_PORT = 3002;
const RUNTIME_FILE = path.join(__dirname, '.e2e-runtime.json');

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
  await client.send(
    new CreateTableCommand({
      TableName: 'UserData',
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
  client.destroy();
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

// ── seed user pool + user ─────────────────────────────────────────────────────

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
      ExplicitAuthFlows: ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
    }),
  );
  const clientId = clientResp.UserPoolClient!.ClientId!;

  await cognitoClient.send(
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

  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: username,
      Password: password,
      Permanent: true,
    }),
  );

  cognitoClient.destroy();
  return { poolId, clientId };
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

  // 2. Start cognito-local
  const cognitoDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cognito-local-e2e-'));
  const cognitoProc = spawnCognitoLocal(COGNITO_PORT, cognitoDataDir);
  await waitForCognitoLocal(COGNITO_PORT);

  // 3. Seed user pool + user
  const { poolId, clientId } = await seedCognito(COGNITO_PORT, username, password);

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
    SST_RESOURCE_UserData_name: 'UserData',
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
