import { NextResponse } from 'next/server';
import { listUserProfilesByStatus } from '@transformmynotes/core';
import { getAdminApiUser } from '@/lib/require-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const users = await listUserProfilesByStatus('pending');
    return NextResponse.json({ ok: true, users });
  } catch (err) {
    console.error('[admin/users/pending] Failed to list pending users', err);
    return NextResponse.json({ ok: false, error: 'Failed to list pending users.' }, { status: 500 });
  }
}
