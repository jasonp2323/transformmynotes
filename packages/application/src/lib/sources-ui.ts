/**
 * sources-ui.ts
 *
 * Client-side presentation helpers for document sources (M20).
 * Pure logic — no React imports.
 */

import type { SourceStatus } from '@transformmynotes/core';

export type { SourceStatus };

// ── Status chip ───────────────────────────────────────────────────────────────

export interface StatusChipMeta {
  tone: 'neutral' | 'warning' | 'success' | 'danger';
  label: string;
  /** When true, the chip should render a spinning loader icon. */
  spin: boolean;
}

/**
 * Returns the Badge tone, label, and spin flag for a given source status.
 */
export function statusChipMeta(status: SourceStatus): StatusChipMeta {
  switch (status) {
    case 'uploading':
      return { tone: 'neutral', label: 'Uploading', spin: true };
    case 'extracting':
      return { tone: 'warning', label: 'Extracting', spin: true };
    case 'ready':
      return { tone: 'success', label: 'Ready', spin: false };
    case 'failed':
      return { tone: 'danger', label: 'Failed', spin: false };
  }
}

// ── Upload error messages ─────────────────────────────────────────────────────

/**
 * Map an API error key (thrown by `uploadSource`) to a human-readable message.
 */
export function friendlyUploadError(key: string): string {
  switch (key) {
    case 'file_too_large':
      return 'File too large. Maximum size is 50 MB.';
    case 'unsupported_type':
      return 'File type not supported. Use PDF, DOCX, EPUB, TXT, or MD.';
    case 'source_limit_reached':
      return "You've reached your source limit. Delete a source to add more.";
    case 'word_limit_exceeded':
      return 'Document is too long to process.';
    default:
      return 'Upload failed. Please try again.';
  }
}

// ── In-flight guard ───────────────────────────────────────────────────────────

/**
 * Returns true for statuses that represent an ongoing operation
 * (used to decide whether to start/continue polling).
 */
export function isInFlight(status: SourceStatus): boolean {
  return status === 'uploading' || status === 'extracting';
}

// ── URL fetch error messages ──────────────────────────────────────────────────

/**
 * Map an HTTP status from POST /api/sources/from-url to user-facing copy.
 */
export function friendlyFromUrlError(status: number): string {
  switch (status) {
    case 400: return 'This URL cannot be fetched (blocked or invalid).';
    case 429: return 'Too many requests — try again later.';
    default:  return 'Something went wrong. Please try again.';
  }
}
