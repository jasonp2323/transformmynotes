import { NextResponse } from 'next/server';
import { listAiConfigVersions } from '@transformmynotes/core';
import { getAdminApiUser } from '@/lib/require-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const versions = await listAiConfigVersions();
    return NextResponse.json({ ok: true, versions });
  } catch (err) {
    console.error('[admin/ai-config/versions] Failed to list AI config versions', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to list AI config versions.' },
      { status: 500 },
    );
  }
}
