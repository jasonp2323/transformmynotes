import { describe, it, expect } from 'vitest';
import { uploadKeys, buildUploadSessionItem } from '../../src/index.js';

describe('uploadKeys', () => {
  it('produces the correct pk and sk shape', () => {
    const keys = uploadKeys.uploadSession('user-123', 'tok-abc');
    expect(keys.pk).toBe('USER#user-123');
    expect(keys.sk).toBe('UPLOAD#tok-abc');
  });

  it('different subs produce different pks', () => {
    const a = uploadKeys.uploadSession('sub-a', 'tok-1');
    const b = uploadKeys.uploadSession('sub-b', 'tok-1');
    expect(a.pk).not.toBe(b.pk);
    expect(a.sk).toBe(b.sk);
  });

  it('different tokens produce different sks', () => {
    const a = uploadKeys.uploadSession('sub-x', 'tok-1');
    const b = uploadKeys.uploadSession('sub-x', 'tok-2');
    expect(a.pk).toBe(b.pk);
    expect(a.sk).not.toBe(b.sk);
  });
});

describe('buildUploadSessionItem', () => {
  it('populates all fields correctly', () => {
    const now = '2024-07-01T10:00:00.000Z';
    const item = buildUploadSessionItem({
      sub: 'sub-abc',
      uploadToken: 'tok-xyz',
      uploadId: 'mpu-id-123',
      s3Key: 'images/users/sub-abc/job-1.jpg',
      jobId: 'job-1',
      createdAt: now,
      updatedAt: now,
    });

    expect(item.pk).toBe('USER#sub-abc');
    expect(item.sk).toBe('UPLOAD#tok-xyz');
    expect(item.uploadToken).toBe('tok-xyz');
    expect(item.uploadId).toBe('mpu-id-123');
    expect(item.s3Key).toBe('images/users/sub-abc/job-1.jpg');
    expect(item.jobId).toBe('job-1');
    expect(item.createdAt).toBe(now);
    expect(item.updatedAt).toBe(now);
  });

  it('defaults updatedAt to createdAt when omitted', () => {
    const item = buildUploadSessionItem({
      sub: 'sub-abc',
      uploadToken: 'tok-xyz',
      uploadId: 'mpu-id-123',
      s3Key: 'images/users/sub-abc/job-1.jpg',
      jobId: 'job-1',
      createdAt: '2024-07-01T10:00:00.000Z',
    });
    expect(item.updatedAt).toBe(item.createdAt);
  });

  it('defaults both timestamps to current time when omitted', () => {
    const before = Date.now();
    const item = buildUploadSessionItem({
      sub: 'sub-abc',
      uploadToken: 'tok-xyz',
      uploadId: 'mpu-id-123',
      s3Key: 'images/users/sub-abc/job-1.jpg',
      jobId: 'job-1',
    });
    const after = Date.now();
    const ts = new Date(item.createdAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
    expect(item.updatedAt).toBe(item.createdAt);
  });
});
