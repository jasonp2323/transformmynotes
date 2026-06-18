import { NextResponse } from 'next/server';
import { listSourcesByUser } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request) {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sources = await listSourcesByUser(sub, 20);
    return NextResponse.json({ sources });
  } catch (err) {
    console.error('[sources/list]', err);
    return NextResponse.json({ ok: false, error: 'Could not list sources.' }, { status: 500 });
  }
}
