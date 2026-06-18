/**
 * Unit tests for packages/core/src/sources/guardrails.ts (M20.1.2).
 *
 * All functions under test are pure or read only from process.env — no I/O,
 * no AWS, no DynamoDB. No mocks needed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveMaxSourceFileBytes,
  resolveMaxSourcesPerUser,
  MAX_EXTRACTION_WORDS,
  ALLOWED_MIME_TYPES,
  MIME_TO_FORMAT,
  checkMimeType,
  checkFileSize,
  checkSourceCount,
  checkWordCount,
} from '../guardrails.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FILE_BYTES_ENV = 'SST_RESOURCE_MAX_SOURCE_FILE_BYTES_value';
const SOURCES_PER_USER_ENV = 'SST_RESOURCE_MAX_SOURCES_PER_USER_value';

/** Save + restore a process.env key around a test. */
function withEnv(key: string, value: string | undefined, fn: () => void): void {
  const original = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

// ---------------------------------------------------------------------------
// resolveMaxSourceFileBytes
// ---------------------------------------------------------------------------

describe('resolveMaxSourceFileBytes', () => {
  let savedBytes: string | undefined;
  let savedPerUser: string | undefined;

  beforeEach(() => {
    savedBytes = process.env[FILE_BYTES_ENV];
    savedPerUser = process.env[SOURCES_PER_USER_ENV];
  });

  afterEach(() => {
    if (savedBytes === undefined) {
      delete process.env[FILE_BYTES_ENV];
    } else {
      process.env[FILE_BYTES_ENV] = savedBytes;
    }
    if (savedPerUser === undefined) {
      delete process.env[SOURCES_PER_USER_ENV];
    } else {
      process.env[SOURCES_PER_USER_ENV] = savedPerUser;
    }
  });

  it('returns the parsed integer when the env var is set to a valid positive integer', () => {
    process.env[FILE_BYTES_ENV] = '52428800';
    expect(resolveMaxSourceFileBytes()).toBe(52428800);
  });

  it('throws when the env var is unset', () => {
    delete process.env[FILE_BYTES_ENV];
    expect(() => resolveMaxSourceFileBytes()).toThrow(/SST_RESOURCE_MAX_SOURCE_FILE_BYTES_value/);
  });

  it('throws when the env var is an empty string', () => {
    process.env[FILE_BYTES_ENV] = '';
    expect(() => resolveMaxSourceFileBytes()).toThrow(/SST_RESOURCE_MAX_SOURCE_FILE_BYTES_value/);
  });

  it('throws when the env var is a non-numeric string', () => {
    process.env[FILE_BYTES_ENV] = 'abc';
    expect(() => resolveMaxSourceFileBytes()).toThrow(/Invalid SST_RESOURCE_MAX_SOURCE_FILE_BYTES_value/);
  });

  it('throws when the env var is zero', () => {
    process.env[FILE_BYTES_ENV] = '0';
    expect(() => resolveMaxSourceFileBytes()).toThrow(/Invalid SST_RESOURCE_MAX_SOURCE_FILE_BYTES_value/);
  });

  it('throws when the env var is a negative integer', () => {
    process.env[FILE_BYTES_ENV] = '-1';
    expect(() => resolveMaxSourceFileBytes()).toThrow(/Invalid SST_RESOURCE_MAX_SOURCE_FILE_BYTES_value/);
  });
});

// ---------------------------------------------------------------------------
// resolveMaxSourcesPerUser
// ---------------------------------------------------------------------------

describe('resolveMaxSourcesPerUser', () => {
  let savedPerUser: string | undefined;

  beforeEach(() => {
    savedPerUser = process.env[SOURCES_PER_USER_ENV];
  });

  afterEach(() => {
    if (savedPerUser === undefined) {
      delete process.env[SOURCES_PER_USER_ENV];
    } else {
      process.env[SOURCES_PER_USER_ENV] = savedPerUser;
    }
  });

  it('returns the parsed integer when the env var is set to a valid positive integer', () => {
    process.env[SOURCES_PER_USER_ENV] = '100';
    expect(resolveMaxSourcesPerUser()).toBe(100);
  });

  it('throws when the env var is unset', () => {
    delete process.env[SOURCES_PER_USER_ENV];
    expect(() => resolveMaxSourcesPerUser()).toThrow(/SST_RESOURCE_MAX_SOURCES_PER_USER_value/);
  });

  it('throws when the env var is an empty string', () => {
    process.env[SOURCES_PER_USER_ENV] = '';
    expect(() => resolveMaxSourcesPerUser()).toThrow(/SST_RESOURCE_MAX_SOURCES_PER_USER_value/);
  });

  it('throws when the env var is a non-numeric string', () => {
    process.env[SOURCES_PER_USER_ENV] = 'abc';
    expect(() => resolveMaxSourcesPerUser()).toThrow(/Invalid SST_RESOURCE_MAX_SOURCES_PER_USER_value/);
  });

  it('throws when the env var is zero', () => {
    process.env[SOURCES_PER_USER_ENV] = '0';
    expect(() => resolveMaxSourcesPerUser()).toThrow(/Invalid SST_RESOURCE_MAX_SOURCES_PER_USER_value/);
  });

  it('throws when the env var is a negative integer', () => {
    process.env[SOURCES_PER_USER_ENV] = '-1';
    expect(() => resolveMaxSourcesPerUser()).toThrow(/Invalid SST_RESOURCE_MAX_SOURCES_PER_USER_value/);
  });
});

// ---------------------------------------------------------------------------
// checkFileSize
// ---------------------------------------------------------------------------

describe('checkFileSize', () => {
  const MAX = 50 * 1024 * 1024; // 50 MB

  it('returns ok: false with status 422 and error file_too_large when size exceeds cap', () => {
    const byteSize = 51 * 1024 * 1024; // 51 MB
    const result = checkFileSize(byteSize, MAX);
    expect(result).toEqual({ ok: false, status: 422, error: 'file_too_large' });
  });

  it('returns ok: true when size equals the cap exactly', () => {
    const result = checkFileSize(MAX, MAX);
    expect(result).toEqual({ ok: true });
  });

  it('returns ok: true when size is under the cap', () => {
    const result = checkFileSize(MAX - 1, MAX);
    expect(result).toEqual({ ok: true });
  });

  it('returns ok: true for a 0-byte file (edge case)', () => {
    const result = checkFileSize(0, MAX);
    expect(result).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// checkMimeType
// ---------------------------------------------------------------------------

describe('checkMimeType', () => {
  it('returns ok: false with status 400 and error unsupported_type for image/jpeg', () => {
    const result = checkMimeType('image/jpeg');
    expect(result).toEqual({ ok: false, status: 400, error: 'unsupported_type' });
  });

  it('returns ok: false for an unknown MIME type', () => {
    const result = checkMimeType('application/octet-stream');
    expect(result).toEqual({ ok: false, status: 400, error: 'unsupported_type' });
  });

  it('strips MIME parameters before matching (e.g. text/plain; charset=utf-8)', () => {
    const result = checkMimeType('text/plain; charset=utf-8');
    expect(result).toEqual({ ok: true, format: 'txt' });
  });

  // Verify every allowed MIME type maps to the correct SourceFormat
  const cases: Array<[string, string]> = [
    ['application/pdf', 'pdf'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
    ['application/epub+zip', 'epub'],
    ['text/plain', 'txt'],
    ['text/markdown', 'md'],
  ];

  for (const [mime, expectedFormat] of cases) {
    it(`maps ${mime} → format "${expectedFormat}"`, () => {
      const result = checkMimeType(mime);
      expect(result).toEqual({ ok: true, format: expectedFormat });
    });
  }

  it('covers all entries in ALLOWED_MIME_TYPES (completeness check)', () => {
    // Every constant in ALLOWED_MIME_TYPES must return ok:true
    for (const mime of ALLOWED_MIME_TYPES) {
      const result = checkMimeType(mime);
      expect(result.ok).toBe(true);
    }
  });

  it('covers all keys in MIME_TO_FORMAT (completeness check)', () => {
    for (const [mime, format] of Object.entries(MIME_TO_FORMAT)) {
      const result = checkMimeType(mime);
      expect(result).toEqual({ ok: true, format });
    }
  });
});

// ---------------------------------------------------------------------------
// checkSourceCount
// ---------------------------------------------------------------------------

describe('checkSourceCount', () => {
  const MAX = 100;

  it('returns ok: false with status 422 and error source_limit_reached when count equals max', () => {
    const result = checkSourceCount(MAX, MAX);
    expect(result).toEqual({ ok: false, status: 422, error: 'source_limit_reached' });
  });

  it('returns ok: false when count exceeds max', () => {
    const result = checkSourceCount(MAX + 1, MAX);
    expect(result).toEqual({ ok: false, status: 422, error: 'source_limit_reached' });
  });

  it('returns ok: true when count is one below max', () => {
    const result = checkSourceCount(MAX - 1, MAX);
    expect(result).toEqual({ ok: true });
  });

  it('returns ok: true when count is 0', () => {
    const result = checkSourceCount(0, MAX);
    expect(result).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// checkWordCount
// ---------------------------------------------------------------------------

describe('checkWordCount', () => {
  it('returns ok: false with error word_limit_exceeded when word count exceeds MAX_EXTRACTION_WORDS', () => {
    const result = checkWordCount(MAX_EXTRACTION_WORDS + 1);
    expect(result).toEqual({ ok: false, error: 'word_limit_exceeded' });
  });

  it('returns ok: true when word count equals MAX_EXTRACTION_WORDS exactly', () => {
    const result = checkWordCount(MAX_EXTRACTION_WORDS);
    expect(result).toEqual({ ok: true });
  });

  it('returns ok: true when word count is under MAX_EXTRACTION_WORDS', () => {
    const result = checkWordCount(MAX_EXTRACTION_WORDS - 1);
    expect(result).toEqual({ ok: true });
  });

  it('returns ok: true for 0 words', () => {
    const result = checkWordCount(0);
    expect(result).toEqual({ ok: true });
  });

  it('MAX_EXTRACTION_WORDS constant is 300_000', () => {
    expect(MAX_EXTRACTION_WORDS).toBe(300_000);
  });
});
