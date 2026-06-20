// Pure, DOM-free helpers for the multi-page capture tray.
// Exported for unit testing.

export interface TrayPage {
  jobId: string;
  thumbnailUrl: string;
}

/**
 * Returns a new array with the element at `from` moved to `to`.
 * Out-of-range `to` is clamped to [0, arr.length - 1].
 * Returns a shallow copy unchanged when indices are equal, the same, or `from` is out of range.
 */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (arr.length === 0) return [...arr];
  if (from < 0 || from >= arr.length) return [...arr];
  const clampedTo = Math.max(0, Math.min(arr.length - 1, to));
  if (from === clampedTo) return [...arr];
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(clampedTo, 0, item);
  return next;
}

/**
 * Returns a new array without the element at `index`.
 * Out-of-range index returns a shallow copy unchanged.
 */
export function removeAt<T>(arr: T[], index: number): T[] {
  if (index < 0 || index >= arr.length) return [...arr];
  return [...arr.slice(0, index), ...arr.slice(index + 1)];
}

/**
 * Builds the review URL for a multi-page batch.
 * `/capture/review?jobId=<primary>&pageJobIds=<id1,id2,...>`
 * Each id is URI-encoded; page ids are joined with a literal comma.
 */
export function buildBatchReviewUrl(primaryJobId: string, pageJobIds: string[]): string {
  const primary = encodeURIComponent(primaryJobId);
  const pages = pageJobIds.map(encodeURIComponent).join(',');
  return `/capture/review?jobId=${primary}&pageJobIds=${pages}`;
}

/**
 * Parse the `pageJobIds` review query param (comma-separated, URI-encoded ids).
 * Returns the decoded ids in order, dropping empties, capped at 20.
 */
export function parsePageJobIds(param: string | undefined | null): string[] {
  if (!param) return [];
  return param
    .split(',')
    .map((id) => decodeURIComponent(id).trim())
    .filter((id) => id.length > 0)
    .slice(0, 20);
}
