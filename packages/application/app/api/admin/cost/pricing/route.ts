import { NextResponse } from 'next/server';
import {
  getPriceBookItem,
  putPriceBook,
  validatePriceBookInput,
  DEFAULT_PRICE_BOOK,
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
    const { priceBook, updatedAt, updatedBy, seeded } = await getPriceBookItem();
    return NextResponse.json({
      ok: true,
      priceBook,
      updatedAt: updatedAt ?? null,
      updatedBy: updatedBy ?? null,
      seeded,
      defaults: DEFAULT_PRICE_BOOK,
    });
  } catch (err) {
    console.error('[admin/cost/pricing] GET', err);
    return NextResponse.json({ ok: false, error: 'Failed to load price book.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const admin = await getAdminApiUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const v = validatePriceBookInput(body);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  }

  try {
    await putPriceBook(v.value, admin.sub);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/cost/pricing] PUT', err);
    return NextResponse.json({ ok: false, error: 'Failed to save price book.' }, { status: 500 });
  }
}
