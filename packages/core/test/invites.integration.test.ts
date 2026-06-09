/**
 * Integration test: Invites access pattern via the real production client.
 *
 * Uses the real `ddb` DocumentClient, `TableNames`, `inviteKeys`, `putInvite`,
 * `getInviteByCode`, and `claimInvite` — no mocks. The dynalite server is
 * started by `dynalite-global.ts` (globalSetup) and the production client is
 * pointed at it via env vars set in `integration-env.ts` (setupFiles).
 */

import { describe, it, expect } from 'vitest';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../src/db/client.js';
import { inviteKeys } from '../src/db/keys.js';
import { putInvite, getInviteByCode, claimInvite } from '../src/db/invites.js';
import { hashInviteCode } from '../src/auth/invite.js';

// ---------------------------------------------------------------------------
// putInvite / getInviteByCode — write/read round-trip
// ---------------------------------------------------------------------------

describe('Invites — putInvite / getInviteByCode round-trip', () => {
  it('reads back the exact item that was written (type=code, maxUses=3)', async () => {
    const code = 'INT-CODE-001';
    const item = await putInvite({
      code,
      type: 'code',
      maxUses: 3,
      label: 'Beta round',
    });

    expect(item.pk).toBe(`INVITE#${hashInviteCode(code)}`);
    expect(item.sk).toBe('INVITE');
    expect(item.gsi1pk).toBe('INVITES');
    expect(item.type).toBe('code');
    expect(item.maxUses).toBe(3);
    expect(item.usedCount).toBe(0);
    expect(item.status).toBe('pending');
    expect(item.label).toBe('Beta round');

    const fetched = await getInviteByCode(code);

    expect(fetched).toBeDefined();
    expect(fetched).toEqual(item);
  });

  it('returns undefined for a non-existent code', async () => {
    const result = await getInviteByCode('NO-SUCH-CODE-XYZ');
    expect(result).toBeUndefined();
  });

  it('getInviteByCode is case-insensitive (normalises like hashInviteCode)', async () => {
    const code = 'CASE-TEST-001';
    await putInvite({ code, type: 'code' });

    // Lower-case should resolve to the same hash.
    const fetched = await getInviteByCode(code.toLowerCase());
    expect(fetched).toBeDefined();
    expect(fetched!.pk).toBe(`INVITE#${hashInviteCode(code)}`);
  });
});

// ---------------------------------------------------------------------------
// claimInvite — multi-use code
// ---------------------------------------------------------------------------

describe('claimInvite — multi-use code (maxUses=3)', () => {
  const CLAIM_CODE = 'CLAIM-MULTI-001';
  const NOW = new Date('2030-01-01T00:00:00.000Z'); // far future — never expires

  it('first claim: usedCount increments 0→1, status stays "pending"', async () => {
    await putInvite({ code: CLAIM_CODE, type: 'code', maxUses: 3 });

    const result = await claimInvite(CLAIM_CODE, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.usedCount).toBe(1);
      expect(result.item.status).toBe('pending');
    }
  });

  it('second claim: usedCount → 2, status still "pending"', async () => {
    const result = await claimInvite(CLAIM_CODE, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.usedCount).toBe(2);
      expect(result.item.status).toBe('pending');
    }
  });

  it('third (final) claim: usedCount → 3 (= maxUses), status flips to "used"', async () => {
    const result = await claimInvite(CLAIM_CODE, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.usedCount).toBe(3);
      expect(result.item.status).toBe('used');
    }
  });

  it('fourth claim after exhaustion: returns { ok: false }', async () => {
    const result = await claimInvite(CLAIM_CODE, NOW);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// claimInvite — email invite (maxUses=1)
// ---------------------------------------------------------------------------

describe('claimInvite — email invite (maxUses=1)', () => {
  const EMAIL_CODE = 'EMAIL-INVITE-001';
  const NOW = new Date('2030-01-01T00:00:00.000Z');

  it('first claim succeeds and flips status to "used"', async () => {
    await putInvite({
      code: EMAIL_CODE,
      type: 'email',
      targetEmail: 'alice@example.com',
      maxUses: 1,
    });

    const result = await claimInvite(EMAIL_CODE, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.usedCount).toBe(1);
      expect(result.item.status).toBe('used');
    }
  });

  it('second claim after single-use exhaustion: returns { ok: false }', async () => {
    const result = await claimInvite(EMAIL_CODE, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unavailable');
    }
  });
});

// ---------------------------------------------------------------------------
// claimInvite — expired invite
// ---------------------------------------------------------------------------

describe('claimInvite — expired invite', () => {
  it('returns { ok: false } for an invite whose expiresAt is in the past', async () => {
    const code = 'EXPIRED-INVITE-001';
    await putInvite({
      code,
      type: 'code',
      maxUses: 5,
      expiresAt: '2020-01-01T00:00:00.000Z', // well in the past
    });

    const now = new Date('2024-06-15T12:00:00.000Z');
    const result = await claimInvite(code, now);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unavailable');
    }
  });
});

// ---------------------------------------------------------------------------
// GSI1 — listByStatus / listAll
// ---------------------------------------------------------------------------

describe('Invites — GSI1 status index', () => {
  const PENDING_CODE_A = 'GSI-PENDING-A';
  const PENDING_CODE_B = 'GSI-PENDING-B';
  const USED_CODE = 'GSI-USED-001';

  it('pending invites appear in listByStatus("pending") query', async () => {
    await putInvite({ code: PENDING_CODE_A, type: 'code', maxUses: 10 });
    await putInvite({ code: PENDING_CODE_B, type: 'code', maxUses: 10 });

    // Write + immediately exhaust one invite so it transitions to 'used'.
    await putInvite({ code: USED_CODE, type: 'email', maxUses: 1 });
    const claimResult = await claimInvite(USED_CODE, new Date('2030-01-01T00:00:00.000Z'));
    expect(claimResult.ok).toBe(true);

    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.Invites,
        ...inviteKeys.listByStatus('pending'),
      }),
    );

    expect(Items).toBeDefined();

    const pendingPks = Items!.map((i) => i.pk as string);

    // Our two pending invites must appear.
    expect(pendingPks).toContain(`INVITE#${hashInviteCode(PENDING_CODE_A)}`);
    expect(pendingPks).toContain(`INVITE#${hashInviteCode(PENDING_CODE_B)}`);

    // The used invite must NOT appear in the pending query.
    expect(pendingPks).not.toContain(`INVITE#${hashInviteCode(USED_CODE)}`);
  });

  it('used invite appears in listByStatus("used") query but not "pending"', async () => {
    const { Items: usedItems } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.Invites,
        ...inviteKeys.listByStatus('used'),
      }),
    );

    const usedPks = (usedItems ?? []).map((i) => i.pk as string);
    expect(usedPks).toContain(`INVITE#${hashInviteCode(USED_CODE)}`);
  });

  it('listAll() returns items across all statuses', async () => {
    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: TableNames.Invites,
        ...inviteKeys.listAll(),
      }),
    );

    expect(Items).toBeDefined();

    const pks = Items!.map((i) => i.pk as string);
    expect(pks).toContain(`INVITE#${hashInviteCode(PENDING_CODE_A)}`);
    expect(pks).toContain(`INVITE#${hashInviteCode(USED_CODE)}`);
  });
});

// ---------------------------------------------------------------------------
// claimInvite — concurrent double-redemption guard
// ---------------------------------------------------------------------------

describe('claimInvite — concurrent redemption guard', () => {
  const NOW = new Date('2030-01-01T00:00:00.000Z'); // far future — never expires

  it('single-use code (maxUses=1): exactly one of two concurrent claims succeeds', async () => {
    const code = 'CONCURRENT-SINGLE-001';
    await putInvite({ code, type: 'email', targetEmail: 'race@example.com', maxUses: 1 });

    const results = await Promise.all([claimInvite(code, NOW), claimInvite(code, NOW)]);
    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    // The failure must be reported as 'unavailable'.
    failures.forEach((f) => {
      if (!f.ok) expect(f.reason).toBe('unavailable');
    });

    // Final persisted state: usedCount capped at 1, status flipped to 'used'.
    const finalItem = await getInviteByCode(code);
    expect(finalItem).toBeDefined();
    expect(finalItem!.usedCount).toBe(1);
    expect(finalItem!.status).toBe('used');
  });

  it('capped code (maxUses=3): exactly three of five concurrent claims succeed', async () => {
    const code = 'CONCURRENT-CAPPED-001';
    await putInvite({ code, type: 'code', maxUses: 3 });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => claimInvite(code, NOW)),
    );
    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);

    expect(successes).toHaveLength(3);
    expect(failures).toHaveLength(2);

    const finalItem = await getInviteByCode(code);
    expect(finalItem).toBeDefined();
    // Never over-redeemed past the cap.
    expect(finalItem!.usedCount).toBe(3);
    expect(finalItem!.status).toBe('used');
  });
});
