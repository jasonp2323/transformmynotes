import { NextResponse } from 'next/server';
import { listAttemptsForUserQuiz } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface AttemptSummary {
  attemptId: string;
  score: number;
  gradedAt: string;
  questionCount: number;
  durationMs?: number;
}

export async function GET(
  _req: Request,
  { params }: { params: { studySetId: string } },
) {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { studySetId } = params;
  if (!studySetId) {
    return NextResponse.json({ ok: false, error: 'Missing studySetId.' }, { status: 400 });
  }

  try {
    const items = await listAttemptsForUserQuiz(sub, studySetId);

    // Sort by gradedAt DESC (newest first) — listAttemptsForUserQuiz returns base-table order (roughly ascending by ULID), not sorted by recency.
    const sorted = [...items].sort((a, b) => b.gradedAt.localeCompare(a.gradedAt));
    const top10 = sorted.slice(0, 10);

    const attempts: AttemptSummary[] = top10.map((item) => {
      const summary: AttemptSummary = {
        attemptId: item.attemptId,
        score: item.score,
        gradedAt: item.gradedAt,
        questionCount: Object.keys(item.results).length,
      };
      if (item.durationMs !== undefined) {
        summary.durationMs = item.durationMs;
      }
      return summary;
    });

    return NextResponse.json({ attempts });
  } catch (err) {
    console.error('[study/attempts]', err);
    return NextResponse.json({ ok: false, error: 'Could not load attempts.' }, { status: 500 });
  }
}
