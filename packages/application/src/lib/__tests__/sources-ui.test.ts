import { describe, it, expect } from 'vitest';
import { statusChipMeta, friendlyUploadError, isInFlight } from '../sources-ui';

// ── statusChipMeta ─────────────────────────────────────────────────────────────

describe('statusChipMeta', () => {
  it('uploading → tone neutral, label Uploading, spin true', () => {
    expect(statusChipMeta('uploading')).toEqual({ tone: 'neutral', label: 'Uploading', spin: true });
  });

  it('extracting → tone warning, label Extracting, spin true', () => {
    expect(statusChipMeta('extracting')).toEqual({ tone: 'warning', label: 'Extracting', spin: true });
  });

  it('ready → tone success, label Ready, spin false', () => {
    expect(statusChipMeta('ready')).toEqual({ tone: 'success', label: 'Ready', spin: false });
  });

  it('failed → tone danger, label Failed, spin false', () => {
    expect(statusChipMeta('failed')).toEqual({ tone: 'danger', label: 'Failed', spin: false });
  });
});

// ── friendlyUploadError ───────────────────────────────────────────────────────

describe('friendlyUploadError', () => {
  it('file_too_large', () => {
    expect(friendlyUploadError('file_too_large')).toBe('File too large. Maximum size is 50 MB.');
  });

  it('unsupported_type', () => {
    expect(friendlyUploadError('unsupported_type')).toBe(
      'File type not supported. Use PDF, DOCX, EPUB, TXT, or MD.',
    );
  });

  it('source_limit_reached', () => {
    expect(friendlyUploadError('source_limit_reached')).toBe(
      "You've reached your source limit. Delete a source to add more.",
    );
  });

  it('word_limit_exceeded', () => {
    expect(friendlyUploadError('word_limit_exceeded')).toBe('Document is too long to process.');
  });

  it('unknown key falls back to default message', () => {
    expect(friendlyUploadError('upload_failed')).toBe('Upload failed. Please try again.');
  });

  it('empty string falls back to default message', () => {
    expect(friendlyUploadError('')).toBe('Upload failed. Please try again.');
  });
});

// ── isInFlight ────────────────────────────────────────────────────────────────

describe('isInFlight', () => {
  it('uploading → true', () => {
    expect(isInFlight('uploading')).toBe(true);
  });

  it('extracting → true', () => {
    expect(isInFlight('extracting')).toBe(true);
  });

  it('ready → false', () => {
    expect(isInFlight('ready')).toBe(false);
  });

  it('failed → false', () => {
    expect(isInFlight('failed')).toBe(false);
  });
});
