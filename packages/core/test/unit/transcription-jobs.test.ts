import { describe, it, expect } from 'vitest';
import {
  buildTranscriptionJobItem,
} from '../../src/db/transcription-jobs';

describe('buildTranscriptionJobItem', () => {
  const BASE_INPUT = {
    sub: 'cognito-sub-test-001',
    jobId: '01JABCDEF0123456789ABCDEFG',
    s3Key: 'images/users/cognito-sub-test-001/01JABCDEF0123456789ABCDEFG.jpg',
  };

  it('defaults status to "pending" when not supplied', () => {
    const item = buildTranscriptionJobItem(BASE_INPUT);
    expect(item.status).toBe('pending');
  });

  it('pk is USER#<sub>', () => {
    const item = buildTranscriptionJobItem(BASE_INPUT);
    expect(item.pk).toBe(`USER#${BASE_INPUT.sub}`);
  });

  it('sk is JOB#<jobId>', () => {
    const item = buildTranscriptionJobItem(BASE_INPUT);
    expect(item.sk).toBe(`JOB#${BASE_INPUT.jobId}`);
  });

  it('defaults createdAt to a valid ISO-8601 string when not supplied', () => {
    const before = new Date().toISOString();
    const item = buildTranscriptionJobItem(BASE_INPUT);
    const after = new Date().toISOString();
    expect(item.createdAt >= before).toBe(true);
    expect(item.createdAt <= after).toBe(true);
  });

  it('defaults updatedAt to createdAt when not supplied', () => {
    const item = buildTranscriptionJobItem(BASE_INPUT);
    expect(item.updatedAt).toBe(item.createdAt);
  });

  it('defaults updatedAt to createdAt even when createdAt is explicitly provided', () => {
    const ts = '2025-03-15T08:00:00.000Z';
    const item = buildTranscriptionJobItem({ ...BASE_INPUT, createdAt: ts });
    expect(item.createdAt).toBe(ts);
    expect(item.updatedAt).toBe(ts);
  });

  it('uses explicit status when provided', () => {
    const item = buildTranscriptionJobItem({ ...BASE_INPUT, status: 'processing' });
    expect(item.status).toBe('processing');
  });

  it('uses explicit createdAt and updatedAt when both provided', () => {
    const createdAt = '2025-01-01T00:00:00.000Z';
    const updatedAt = '2025-01-01T01:00:00.000Z';
    const item = buildTranscriptionJobItem({ ...BASE_INPUT, createdAt, updatedAt });
    expect(item.createdAt).toBe(createdAt);
    expect(item.updatedAt).toBe(updatedAt);
  });

  it('omits errorMsg when not provided', () => {
    const item = buildTranscriptionJobItem(BASE_INPUT);
    expect('errorMsg' in item).toBe(false);
  });

  it('includes errorMsg when provided', () => {
    const item = buildTranscriptionJobItem({ ...BASE_INPUT, errorMsg: 'OCR failed' });
    expect(item.errorMsg).toBe('OCR failed');
  });

  it('populates jobId and s3Key from input', () => {
    const item = buildTranscriptionJobItem(BASE_INPUT);
    expect(item.jobId).toBe(BASE_INPUT.jobId);
    expect(item.s3Key).toBe(BASE_INPUT.s3Key);
  });

  it('builds items with all four TranscriptionJobStatus values', () => {
    const statuses = ['pending', 'processing', 'done', 'error'] as const;
    for (const status of statuses) {
      const item = buildTranscriptionJobItem({ ...BASE_INPUT, status });
      expect(item.status).toBe(status);
    }
  });
});
