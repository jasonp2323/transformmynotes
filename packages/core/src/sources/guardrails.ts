import type { SourceFormat } from '../db/sources.js';

// ---------------------------------------------------------------------------
// Config resolvers (fail loud — no default fallback)
// ---------------------------------------------------------------------------

/**
 * Reads `SST_RESOURCE_MAX_SOURCE_FILE_BYTES_value` and returns the parsed
 * positive integer value.
 *
 * Throws if the env var is unset, empty, not a valid integer, zero, or
 * negative — per CLAUDE.md "fail loud on missing required config".
 */
export function resolveMaxSourceFileBytes(): number {
  const raw = process.env.SST_RESOURCE_MAX_SOURCE_FILE_BYTES_value;
  if (!raw || raw.trim() === '') {
    throw new Error(
      'Missing required env var SST_RESOURCE_MAX_SOURCE_FILE_BYTES_value. ' +
        'Seed MAX_SOURCE_FILE_BYTES in both SST Console environments.',
    );
  }
  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid SST_RESOURCE_MAX_SOURCE_FILE_BYTES_value: "${raw}". ` +
        'Must be a positive integer (e.g. 52428800 for 50 MB).',
    );
  }
  return parsed;
}

/**
 * Reads `SST_RESOURCE_MAX_SOURCES_PER_USER_value` and returns the parsed
 * positive integer value.
 *
 * Throws if the env var is unset, empty, not a valid integer, zero, or
 * negative — per CLAUDE.md "fail loud on missing required config".
 */
export function resolveMaxSourcesPerUser(): number {
  const raw = process.env.SST_RESOURCE_MAX_SOURCES_PER_USER_value;
  if (!raw || raw.trim() === '') {
    throw new Error(
      'Missing required env var SST_RESOURCE_MAX_SOURCES_PER_USER_value. ' +
        'Seed MAX_SOURCES_PER_USER in both SST Console environments.',
    );
  }
  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid SST_RESOURCE_MAX_SOURCES_PER_USER_value: "${raw}". ` +
        'Must be a positive integer (e.g. 100).',
    );
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Code constants
// ---------------------------------------------------------------------------

/**
 * Hard word cap checked after text extraction.
 * Documents exceeding this cap are rejected by the extraction job
 * (sets status 'failed', error 'Document exceeds word limit').
 * This is a code constant, NOT a secret — it is not expected to vary per
 * environment and does not need to be seeded in the SST Console.
 */
export const MAX_EXTRACTION_WORDS = 300_000;

// ---------------------------------------------------------------------------
// MIME allowlist
// ---------------------------------------------------------------------------

/** All MIME types accepted for document upload. */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/epub+zip',
  'text/plain',
  'text/markdown',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Maps each allowed MIME type to its internal `SourceFormat`. */
export const MIME_TO_FORMAT: Record<AllowedMimeType, SourceFormat> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/epub+zip': 'epub',
  'text/plain': 'txt',
  'text/markdown': 'md',
};

// ---------------------------------------------------------------------------
// Pure guard functions
// ---------------------------------------------------------------------------

/**
 * Checks whether a Content-Type header value is in the MIME allowlist.
 *
 * Strips any parameters (e.g. `; charset=utf-8`) before matching.
 *
 * @returns `{ ok: true, format }` on success, or
 *          `{ ok: false, status: 400, error: 'unsupported_type' }` when the
 *          MIME type is not in the allowlist.
 */
export function checkMimeType(
  contentType: string,
): { ok: true; format: SourceFormat } | { ok: false; status: 400; error: 'unsupported_type' } {
  // Strip parameters like `; charset=utf-8`
  const mime = contentType.split(';')[0].trim() as AllowedMimeType;
  if (!ALLOWED_MIME_TYPES.includes(mime as AllowedMimeType)) {
    return { ok: false, status: 400, error: 'unsupported_type' };
  }
  return { ok: true, format: MIME_TO_FORMAT[mime as AllowedMimeType] };
}

/**
 * Checks whether a file's byte size is within the allowed maximum.
 *
 * @param byteSize  - Size of the file in bytes.
 * @param max       - Maximum allowed size in bytes (from `resolveMaxSourceFileBytes()`).
 * @returns `{ ok: true }` when within the cap, or
 *          `{ ok: false, status: 422, error: 'file_too_large' }` when exceeded.
 */
export function checkFileSize(
  byteSize: number,
  max: number,
): { ok: true } | { ok: false; status: 422; error: 'file_too_large' } {
  if (byteSize > max) {
    return { ok: false, status: 422, error: 'file_too_large' };
  }
  return { ok: true };
}

/**
 * Checks whether the user's current source count is below the per-user cap.
 *
 * @param currentCount - Number of sources the user already has (from `countSourcesByUser()`).
 * @param max          - Maximum allowed sources per user (from `resolveMaxSourcesPerUser()`).
 * @returns `{ ok: true }` when under the cap, or
 *          `{ ok: false, status: 422, error: 'source_limit_reached' }` when at or above.
 */
export function checkSourceCount(
  currentCount: number,
  max: number,
): { ok: true } | { ok: false; status: 422; error: 'source_limit_reached' } {
  if (currentCount >= max) {
    return { ok: false, status: 422, error: 'source_limit_reached' };
  }
  return { ok: true };
}

/**
 * Checks whether an extracted document's word count is within `MAX_EXTRACTION_WORDS`.
 *
 * Used by the extraction job after text extraction is complete. When this
 * returns `{ ok: false }`, the job sets the source status to `'failed'` with
 * `error: 'Document exceeds word limit'`.
 *
 * @param wordCount - Number of words in the extracted text.
 * @returns `{ ok: true }` when within the cap, or
 *          `{ ok: false, error: 'word_limit_exceeded' }` when exceeded.
 */
export function checkWordCount(
  wordCount: number,
): { ok: true } | { ok: false; error: 'word_limit_exceeded' } {
  if (wordCount > MAX_EXTRACTION_WORDS) {
    return { ok: false, error: 'word_limit_exceeded' };
  }
  return { ok: true };
}
