/**
 * Parses the MAX_CONCURRENT_STUDY_JOBS env var (per-user in-flight study-set cap).
 * Fail-loud: throws when unset/empty or not a positive integer — a required
 * config value must never silently default (repo convention). Called at route
 * module-import time so a misconfigured stage fails immediately, not per request.
 */
export function parseMaxConcurrentStudyJobs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    throw new Error('Missing required env var MAX_CONCURRENT_STUDY_JOBS');
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`MAX_CONCURRENT_STUDY_JOBS must be a positive integer, got "${raw}"`);
  }
  return n;
}
