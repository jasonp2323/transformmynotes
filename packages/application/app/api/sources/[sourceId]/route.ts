import { NextResponse } from 'next/server';
import { getSource, type SourceItem } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toSource(item: SourceItem) {
  const { pk: _pk, sk: _sk, gsi9pk: _gsi9pk, gsi9sk: _gsi9sk, ...source } = item;
  return source;
}

export async function GET(
  _req: Request,
  { params }: { params: { sourceId: string } },
) {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { sourceId } = params;

  try {
    const item = await getSource(sub, sourceId);
    if (!item) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    const source = toSource(item);
    return NextResponse.json({ source });
  } catch (err) {
    console.error('[sources/get]', err);
    return NextResponse.json({ ok: false, error: 'Could not load source.' }, { status: 500 });
  }
}
