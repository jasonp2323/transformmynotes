import { NextResponse } from 'next/server';
import { getUserProfileBySub, updateAiProfile } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';
import { aiProfileUpdateSchema } from '@/src/lib/ai-profile-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const profile = await getUserProfileBySub(sub);
  if (!profile) {
    return NextResponse.json({ ok: false, error: 'Profile not found.' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    aiProfile: profile.aiProfile ?? { preferredLanguage: 'auto' },
  });
}

export async function PUT(req: Request) {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = aiProfileUpdateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const result = await updateAiProfile(sub, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: 'Profile not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, aiProfile: result.profile!.aiProfile });
}
