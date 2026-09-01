/**
 * Shared helpers for admin cost API routes.
 * Server-only — no React imports.
 */
import {
  parseDateRange,
  listUserProfilesByStatus,
  getGroup,
  type CostRow,
} from '@transformmynotes/core';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Range
// ---------------------------------------------------------------------------

export interface LoadedRange {
  from: string;
  to: string;
  days: string[];
}

/**
 * Parse `from`/`to` query params from a Request.
 * Returns { ok: false, response } on invalid range or { ok: true, range }.
 */
export function parseRangeFromRequest(req: Request):
  | { ok: true; range: LoadedRange }
  | { ok: false; response: ReturnType<typeof NextResponse.json> } {
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const result = parseDateRange({ from, to }, { defaultDays: 30, maxDays: 92 });
  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: result.error }, { status: 400 }),
    };
  }
  return { ok: true, range: result };
}

// ---------------------------------------------------------------------------
// Group map + name resolution
// ---------------------------------------------------------------------------

/** Build a sub → first groupId map from all active+disabled user profiles. */
export async function buildSubToGroup(): Promise<Map<string, string>> {
  const [active, disabled] = await Promise.all([
    listUserProfilesByStatus('active'),
    listUserProfilesByStatus('disabled'),
  ]);
  const map = new Map<string, string>();
  for (const profile of [...active, ...disabled]) {
    if (profile.groupIds && profile.groupIds.length > 0) {
      map.set(profile.sub, profile.groupIds[0]);
    }
  }
  return map;
}

/** Attach a `name` field to each group CostRow. Resolves in parallel. */
export async function resolveGroupNames(
  rows: CostRow[],
): Promise<Array<CostRow & { name: string }>> {
  // Collect distinct group ids (skip the special '(no group)' bucket)
  const groupIds = [...new Set(rows.map((r) => r.key).filter((k) => k !== '(no group)'))];

  // Resolve all group names in parallel
  const groupEntries = await Promise.all(
    groupIds.map(async (id) => {
      const g = await getGroup(id);
      return [id, g?.name ?? id] as const;
    }),
  );
  const nameMap = new Map<string, string>(groupEntries);

  return rows.map((row) => ({
    ...row,
    name: row.key === '(no group)' ? '(no group)' : (nameMap.get(row.key) ?? row.key),
  }));
}
