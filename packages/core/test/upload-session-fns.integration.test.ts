/**
 * Integration test: UploadSession access functions (putUploadSession / getUploadSession)
 * via the real production client against dynalite.
 *
 * Upload session items live in the `UserData` table under the user's own partition
 * (PK = `USER#<sub>`, SK = `UPLOAD#<uploadToken>`). No GSI — fetched by PK+SK only.
 */

import { describe, it, expect } from 'vitest';
import {
  buildUploadSessionItem,
  putUploadSession,
  getUploadSession,
} from '../src/db/uploads.js';

describe('UploadSession — putUploadSession / getUploadSession round-trip', () => {
  it('reads back the exact item that was written', async () => {
    const sub = 'upload-test-sub-a1b2c3';
    const uploadToken = '01UPLOAD001234567890ABCDEF';
    const now = '2024-07-01T10:00:00.000Z';

    const item = buildUploadSessionItem({
      sub,
      uploadToken,
      uploadId: 's3-mpu-id-xyz',
      s3Key: `images/users/${sub}/job-abc.jpg`,
      jobId: 'job-abc',
      createdAt: now,
      updatedAt: now,
    });

    await putUploadSession(item);

    const fetched = await getUploadSession(sub, uploadToken);
    expect(fetched).not.toBeNull();
    expect(fetched).toEqual(item);
    expect(fetched!.pk).toBe(`USER#${sub}`);
    expect(fetched!.sk).toBe(`UPLOAD#${uploadToken}`);
    expect(fetched!.uploadId).toBe('s3-mpu-id-xyz');
    expect(fetched!.s3Key).toBe(`images/users/${sub}/job-abc.jpg`);
    expect(fetched!.jobId).toBe('job-abc');
  });

  it('returns null for a session that does not exist', async () => {
    const result = await getUploadSession('missing-sub', 'missing-token');
    expect(result).toBeNull();
  });

  it('upload sessions for different users do not collide (same token, different subs)', async () => {
    const subA = 'upload-sub-user-alpha';
    const subB = 'upload-sub-user-beta';
    const uploadToken = '01UPLOAD-SHARED-TOKEN-00001';
    const now = '2024-07-02T12:00:00.000Z';

    const itemA = buildUploadSessionItem({
      sub: subA,
      uploadToken,
      uploadId: 'mpu-id-alpha',
      s3Key: `images/users/${subA}/job-1.jpg`,
      jobId: 'job-1',
      createdAt: now,
    });
    const itemB = buildUploadSessionItem({
      sub: subB,
      uploadToken,
      uploadId: 'mpu-id-beta',
      s3Key: `images/users/${subB}/job-2.jpg`,
      jobId: 'job-2',
      createdAt: now,
    });

    await putUploadSession(itemA);
    await putUploadSession(itemB);

    const fetchedA = await getUploadSession(subA, uploadToken);
    const fetchedB = await getUploadSession(subB, uploadToken);

    expect(fetchedA!.uploadId).toBe('mpu-id-alpha');
    expect(fetchedB!.uploadId).toBe('mpu-id-beta');
    expect(fetchedA!.pk).toBe(`USER#${subA}`);
    expect(fetchedB!.pk).toBe(`USER#${subB}`);
  });
});
