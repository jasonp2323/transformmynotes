'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientQuestion } from '@transformmynotes/core';
import { AppShell } from '@/src/components/shells';
import { Button } from '@/src/components/ui/Button';
import { Icon } from '@/src/components/ui/Icon';
import { QuizScoreReport } from './QuizScoreReport';
import type { ScoreReportQuestion, ScoreReportResult } from './QuizScoreReport';

// --- API contract types ------------------------------------------------------

interface GradedResult {
  questionId: string;
  type: 'mcq' | 'short-answer';
  correct: boolean;
  score: number;
  feedback?: string;
  correctIndex?: number;
  modelAnswer?: string;
  explanation: string;
}

interface AttemptDetailResponse {
  attemptId: string;
  score: number;
  gradedAt: string;
  durationMs?: number;
  questions: ClientQuestion[];
  answers: Record<string, string>;
  results: GradedResult[];
}

// --- Component ---------------------------------------------------------------

export interface AttemptReportScreenProps {
  studySetId: string;
  attemptId: string;
}

type LoadState = 'loading' | 'not-found' | 'error' | 'ready';

export function AttemptReportScreen({ studySetId, attemptId }: AttemptReportScreenProps) {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [data, setData] = useState<AttemptDetailResponse | null>(null);

  useEffect(() => {
    fetch(`/api/study/${studySetId}/attempts/${attemptId}`)
      .then(async (res) => {
        if (res.status === 404) {
          setLoadState('not-found');
          return;
        }
        if (!res.ok) {
          setLoadState('error');
          return;
        }
        const json = (await res.json()) as AttemptDetailResponse;
        setData(json);
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
  }, [studySetId, attemptId]);

  if (loadState === 'loading') {
    return (
      <AppShell active="study" title="Quiz results">
        <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto">
          <div className="flex flex-col items-center gap-4 py-16 text-center text-text-muted">
            <Icon name="loader-circle" size={40} className="animate-spin" />
            <p className="text-sm">Loading results&hellip;</p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (loadState === 'not-found' || loadState === 'error' || !data) {
    return (
      <AppShell active="study" title="Quiz results">
        <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto">
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <Icon name="x" size={40} className="text-danger" />
            <div>
              <p className="font-medium">
                {loadState === 'not-found' ? 'Results not found' : 'Could not load results'}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                {loadState === 'not-found'
                  ? 'This attempt may have been deleted.'
                  : 'Something went wrong. Please try again.'}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => router.push(`/study/${studySetId}`)}
              leftIcon={<Icon name="chevron-left" size={15} />}
            >
              Back to study set
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // Map ClientQuestion[] → ScoreReportQuestion[]
  const mappedQuestions: ScoreReportQuestion[] = data.questions.map((q) =>
    q.type === 'mcq'
      ? { id: q.id, type: 'mcq', stem: q.stem, options: q.options }
      : { id: q.id, type: 'short-answer', prompt: q.prompt },
  );

  const mappedResults: ScoreReportResult[] = data.results;

  return (
    <AppShell active="study" title="Quiz results">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto space-y-6">
        <QuizScoreReport
          score={data.score}
          questions={mappedQuestions}
          results={mappedResults}
          answers={data.answers}
        />

        <div className="flex gap-3 pt-2 flex-wrap">
          <Button
            variant="secondary"
            onClick={() => router.push(`/study/${studySetId}/take`)}
            leftIcon={<Icon name="rotate-ccw" size={15} />}
          >
            Retake quiz
          </Button>
          <Button
            variant="secondary"
            onClick={() => router.push(`/study/${studySetId}`)}
            leftIcon={<Icon name="chevron-left" size={15} />}
          >
            Back to study set
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

AttemptReportScreen.displayName = 'AttemptReportScreen';
