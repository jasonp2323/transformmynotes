import { NextResponse } from 'next/server';
import { listAccessRequestsByStatus } from '@transformmynotes/core';
import type { AccessRequestStatus } from '@transformmynotes/core';
import { getAdminApiUser } from '@/lib/require-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES: AccessRequestStatus[] = ['new', 'approved', 'dismissed'];

export async function GET(req: Request) {
  // Admin auth gate.
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  // Parse optional status filter (defaults to 'new').
  const rawStatus = new URL(req.url).searchParams.get('status') ?? 'new';
  if (!(VALID_STATUSES as string[]).includes(rawStatus)) {
    return NextResponse.json({ ok: false, error: 'Invalid status. Must be new, approved, or dismissed.' }, { status: 400 });
  }
  const status = rawStatus as AccessRequestStatus;

  try {
    const requests = await listAccessRequestsByStatus(status);
    return NextResponse.json({ ok: true, requests });
  } catch (err) {
    console.error('[admin/access-requests] Failed to list access requests', err);
    return NextResponse.json({ ok: false, error: 'Failed to list access requests.' }, { status: 500 });
  }
}
