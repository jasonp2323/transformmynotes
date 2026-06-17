import { NextResponse } from 'next/server';
import {
  getCurrentAiConfig,
  saveAiConfig,
  validateAiConfigInput,
  bustAiConfigCache,
  buildSecretDefaults,
  AI_MODEL_ALLOWLIST,
  AI_PARAM_BOUNDS,
} from '@transformmynotes/core';
import { getAdminApiUser } from '@/lib/require-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const config = await getCurrentAiConfig();

    // Build defaults from env + bundled DEFAULT_* prompt constants (no
    // filesystem access required), and strip audit fields before sending.
    const { version: _v, updatedBy: _u, updatedAt: _a, ...defaults } = buildSecretDefaults();

    return NextResponse.json({
      ok: true,
      config,
      defaults,
      allowlist: AI_MODEL_ALLOWLIST,
      paramBounds: AI_PARAM_BOUNDS,
    });
  } catch (err) {
    console.error('[admin/ai-config] Failed to load AI config', err);
    return NextResponse.json({ ok: false, error: 'Failed to load AI config.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const v = validateAiConfigInput(body);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  }

  try {
    const { version } = await saveAiConfig(v.value, admin.sub);
    bustAiConfigCache();
    return NextResponse.json({ ok: true, version });
  } catch (err) {
    if ((err as Error)?.name === 'AiConfigVersionConflictError') {
      return NextResponse.json(
        { ok: false, error: 'Another save is in progress — please retry.' },
        { status: 409 },
      );
    }
    console.error('[admin/ai-config] Failed to save AI config', err);
    return NextResponse.json({ ok: false, error: 'Failed to save AI config.' }, { status: 500 });
  }
}
