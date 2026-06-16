import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { ulid } from 'ulid';
import {
  getStudySet,
  gradeMcq,
  judgeShortAnswer,
  buildAttemptItem,
  putAttempt,
  type GeneratedQuiz,
  type QuizQuestion,
  type AttemptResult,
} from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

// Answer key is revealed ONLY in this route's response (post-submission), per the M15 anti-cheat boundary.
// Latency note: short-answer judging fans out to N parallel Bedrock calls (Promise.all), so a quiz with
// several short-answer questions typically takes 2–3s to grade.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface GradedResult {
  questionId: string;
  type: 'mcq' | 'short-answer';
  correct: boolean;
  score: number;
  feedback?: string; // short-answer only
  correctIndex?: number; // mcq revealed
  modelAnswer?: string; // short-answer revealed
  explanation: string; // revealed for both
}

function requireBucketName(): string {
  const value = process.env.SST_RESOURCE_NotesBucket_name;
  if (!value) {
    throw new Error(
      'Missing required env var SST_RESOURCE_NotesBucket_name: the S3 bucket name is not bound. ' +
        'Expected it from the SST resource link (production) or the test harness.',
    );
  }
  return value;
}

export async function POST(
  req: Request,
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

  let body: { answers?: unknown; durationMs?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }
  const answers = body.answers;
  if (answers === null || typeof answers !== 'object' || Array.isArray(answers)) {
    return NextResponse.json({ ok: false, error: 'Invalid answers.' }, { status: 400 });
  }
  const answerMap = answers as Record<string, string>;
  const durationMs = typeof body.durationMs === 'number' ? body.durationMs : undefined;

  try {
    const bucket = requireBucketName();

    const item = await getStudySet(sub, studySetId);
    if (!item) {
      return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
    }

    if (item.type !== 'quiz') {
      return NextResponse.json({ ok: false, error: 'Not a quiz.' }, { status: 400 });
    }

    if (item.status !== 'ready' || !item.bodyS3Key) {
      return NextResponse.json({ ok: false, error: 'Body not ready.' }, { status: 404 });
    }

    const s3 = new S3Client({});
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: item.bodyS3Key }));
    const text = await (res.Body as { transformToString(): Promise<string> }).transformToString();
    const quiz = JSON.parse(text) as GeneratedQuiz;

    const missing = quiz.questions.some((q) => !(q.id in answerMap));
    if (missing) {
      return NextResponse.json(
        { ok: false, error: 'Missing answers for some questions.' },
        { status: 400 },
      );
    }

    const results: Record<string, AttemptResult> = {};
    const revealed: GradedResult[] = [];

    // Kick off all short-answer judgements in parallel.
    const saJudgements = quiz.questions
      .filter((q): q is Extract<QuizQuestion, { type: 'short-answer' }> => q.type === 'short-answer')
      .map(async (q) => ({ id: q.id, verdict: await judgeShortAnswer(q, answerMap[q.id] ?? '') }));
    const saResults = await Promise.all(saJudgements);
    const saById = new Map(saResults.map((r) => [r.id, r.verdict]));

    for (const q of quiz.questions) {
      if (q.type === 'mcq') {
        const r = gradeMcq(q, answerMap[q.id]);
        results[q.id] = r;
        revealed.push({
          questionId: q.id,
          type: 'mcq',
          correct: r.correct,
          score: r.score,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        });
      } else {
        const v = saById.get(q.id)!;
        const r: AttemptResult = { correct: v.correct, score: v.score, feedback: v.feedback };
        results[q.id] = r;
        revealed.push({
          questionId: q.id,
          type: 'short-answer',
          correct: v.correct,
          score: v.score,
          feedback: v.feedback,
          modelAnswer: q.modelAnswer,
          explanation: q.explanation,
        });
      }
    }

    const n = quiz.questions.length;
    const score = n > 0 ? quiz.questions.reduce((sum, q) => sum + results[q.id].score, 0) / n : 0;

    const attemptId = ulid();
    const attemptItem = buildAttemptItem({
      sub,
      quizId: studySetId,
      attemptId,
      answers: answerMap,
      results,
      score,
      gradedAt: new Date().toISOString(),
      durationMs,
    });
    await putAttempt(attemptItem);

    return NextResponse.json({ attemptId, score, results: revealed });
  } catch (err) {
    console.error('[study/attempt]', err);
    return NextResponse.json({ ok: false, error: 'Could not grade attempt.' }, { status: 500 });
  }
}
