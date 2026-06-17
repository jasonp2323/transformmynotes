/**
 * Parses a comma-separated `ids` query param into a de-duplicated,
 * order-preserving array of non-empty trimmed strings.
 *
 * Examples:
 *   "a,b,,a,c" → ["a","b","c"]
 *   null        → []
 *   ""          → []
 */
export function parseStudySetIds(param: string | null | undefined): string[] {
  if (!param) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of param.split(',')) {
    const id = raw.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}
