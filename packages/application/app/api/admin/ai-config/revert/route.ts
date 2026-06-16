import { NextResponse } from 'next/server';
import { revertAiConfig, bustAiConfigCache } from '@transformmynotes/core';
import { getAdminApiUser } from '@/lib/require-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!(Number.isInteger(body?.version) && body.version > 0)) {
    return NextResponse.json(
      { ok: false, error: 'version must be a positive integer.' },
      { status: 400 },
    );
  }

  try {
    const { version } = await revertAiConfig(body.version, admin.sub);
    bustAiConfigCache();
    return NextResponse.json({ ok: true, version });
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === 'AiConfigVersionNotFoundError') {
      return NextResponse.json({ ok: false, error: 'Version not found.' }, { status: 404 });
    }
    if (name === 'AiConfigRevertInvalidError') {
      return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
    }
    if (name === 'AiConfigVersionConflictError') {
      return NextResponse.json(
        { ok: false, error: 'Another save is in progress — please retry.' },
        { status: 409 },
      );
    }
    console.error('[admin/ai-config/revert] Failed to revert AI config', err);
    return NextResponse.json({ ok: false, error: 'Failed to revert AI config.' }, { status: 500 });
  }
}
