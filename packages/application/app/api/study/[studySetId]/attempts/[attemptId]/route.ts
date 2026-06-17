import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  getStudySet,
  getAttempt,
  toClientQuestions,
  type GeneratedQuiz,
  type QuizQuestion,
} from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';
import type { GradedResult } from '../../attempt/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST-SUBMIT REVEAL: This route intentionally exposes the answer key (correctIndex, modelAnswer,
// explanation) because the user has already submitted and been graded. This is NOT the anti-cheat
// boundary — that boundary is GET /questions and the UI pre-submission path.

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

export async function GET(
  _req: Request,
  { params }: { params: { studySetId: string; attemptId: string } },
) {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { studySetId, attemptId } = params;
  if (!studySetId || !attemptId) {
    return NextResponse.json({ ok: false, error: 'Missing studySetId or attemptId.' }, { status: 400 });
  }

  try {
    const bucket = requireBucketName();

    const attempt = await getAttempt(sub, studySetId, attemptId);
    if (!attempt) {
      return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
    }

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

    // Build revealed results — answer key is intentionally exposed here (post-submit reveal).
    const results: GradedResult[] = quiz.questions.map((q: QuizQuestion): GradedResult => {
      const r = attempt.results[q.id] ?? { correct: false, score: 0 };
      if (q.type === 'mcq') {
        return {
          questionId: q.id,
          type: 'mcq',
          correct: r.correct,
          score: r.score,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        };
      }
      return {
        questionId: q.id,
        type: 'short-answer',
        correct: r.correct,
        score: r.score,
        feedback: r.feedback,
        modelAnswer: q.modelAnswer,
        explanation: q.explanation,
      };
    });

    return NextResponse.json({
      attemptId: attempt.attemptId,
      score: attempt.score,
      gradedAt: attempt.gradedAt,
      durationMs: attempt.durationMs,
      questions: toClientQuestions(quiz),
      answers: attempt.answers,
      results,
    });
  } catch (err) {
    console.error('[study/attempt-report]', err);
    return NextResponse.json({ ok: false, error: 'Could not load attempt.' }, { status: 500 });
  }
}
