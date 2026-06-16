'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientQuestion } from '@transformmynotes/core';
import { AppShell } from '@/src/components/shells';
import { Button } from '@/src/components/ui/Button';
import { Textarea } from '@/src/components/ui/Textarea';
import { Dialog } from '@/src/components/ui/Dialog';
import { Icon } from '@/src/components/ui/Icon';
import { Toast } from '@/src/components/ui/Toast';
import {
  buildAttemptBody,
  isAnswered,
  allAnswered as allAnsweredFn,
  scorePercent,
} from './quiz-taking-logic';

// --- API contract (M15.2.1) --------------------------------------------------

/** One graded question result, as returned by POST /api/study/[id]/attempt. */
interface GradedResult {
  questionId: string;
  type: 'mcq' | 'short-answer';
  correct: boolean;
  score: number;
  feedback?: string;
  /** MCQ only — index of the correct option (revealed post-submission). */
  correctIndex?: number;
  /** short-answer only — the model answer (revealed post-submission). */
  modelAnswer?: string;
  explanation: string;
}

interface AttemptResponse {
  attemptId: string;
  score: number;
  results: GradedResult[];
}

interface QuestionsResponse {
  studySetId: string;
  type: string;
  questions: ClientQuestion[];
}

type Phase = 'loading' | 'error' | 'taking' | 'report';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60;

// --- Component ---------------------------------------------------------------

export function QuizTakingScreen({ studySetId }: { studySetId: string }) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('loading');
  const [questions, setQuestions] = useState<ClientQuestion[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Wizard state.
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Submission state.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Latch: once a submit succeeds or is in-flight, never allow another. */
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [report, setReport] = useState<AttemptResponse | null>(null);

  // Timing — set when questions first render, used for durationMs.
  const startedAtRef = useRef<number | null>(null);

  // --- Polling for the generated quiz body ---------------------------------
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    async function load() {
      try {
        const res = await fetch(`/api/study/${studySetId}/questions`);

        if (res.status === 404) {
          // Body not yet ready (generation is async) — keep polling up to the cap.
          attempts += 1;
          if (attempts >= MAX_POLL_ATTEMPTS) {
            if (!cancelled) {
              setErrorMsg('Your quiz is taking longer than expected to generate. Please try again later.');
              setPhase('error');
            }
            return;
          }
          timer = setTimeout(load, POLL_INTERVAL_MS);
          return;
        }

        if (!res.ok) {
          throw new Error('Failed to load quiz.');
        }

        const data = (await res.json()) as QuestionsResponse;
        if (cancelled) return;

        if (!Array.isArray(data.questions) || data.questions.length === 0) {
          setErrorMsg('This quiz has no questions.');
          setPhase('error');
          return;
        }

        setQuestions(data.questions);
        startedAtRef.current = Date.now();
        setPhase('taking');
      } catch {
        if (!cancelled) {
          setErrorMsg('Something went wrong loading your quiz.');
          setPhase('error');
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [studySetId]);

  // --- Answer helpers ------------------------------------------------------
  const setAnswer = useCallback((id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  const total = questions.length;
  const q = questions[current];
  const currentAnswered = q ? isAnswered(answers, q.id) : false;
  const allAnswered = allAnsweredFn(questions, answers);
  const isLast = current === total - 1;

  // --- Submit --------------------------------------------------------------
  async function handleSubmit() {
    // Guard: never resubmit once in-flight or already done.
    if (submitting || submitted) return;
    setSubmitted(true);
    setSubmitting(true);
    setSubmitError(null);
    setConfirmOpen(false);

    try {
      const durationMs =
        startedAtRef.current != null ? Date.now() - startedAtRef.current : undefined;

      const res = await fetch(`/api/study/${studySetId}/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildAttemptBody(answers, durationMs)),
      });

      if (!res.ok) {
        throw new Error('Submission failed.');
      }

      const data = (await res.json()) as AttemptResponse;
      setReport(data);
      setPhase('report');
    } catch {
      // Re-enable submission so the user can retry.
      setSubmitError('Could not submit your answers. Please try again.');
      setSubmitted(false);
    } finally {
      setSubmitting(false);
    }
  }

  // --- Render: loading / generating ----------------------------------------
  if (phase === 'loading') {
    return (
      <AppShell active="study" title="Quiz">
        <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto">
          <div className="flex flex-col items-center gap-4 py-16 text-center text-text-muted">
            <Icon name="loader-circle" size={40} className="animate-spin" />
            <p className="text-sm">Generating your quiz&hellip;</p>
          </div>
        </div>
      </AppShell>
    );
  }

  // --- Render: error -------------------------------------------------------
  if (phase === 'error') {
    return (
      <AppShell active="study" title="Quiz">
        <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto">
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <Icon name="x" size={40} className="text-danger" />
            <div>
              <p className="font-medium">Couldn&rsquo;t start the quiz</p>
              {errorMsg && <p className="mt-1 text-sm text-text-muted">{errorMsg}</p>}
            </div>
            <Button variant="secondary" onClick={() => router.push(`/study/${studySetId}`)}>
              Back to study set
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // --- Render: report ------------------------------------------------------
  if (phase === 'report' && report) {
    const pct = scorePercent(report.score);
    const byId = new Map(report.results.map((r) => [r.questionId, r]));

    return (
      <AppShell active="study" title="Quiz results">
        <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto space-y-6">
          {/* Overall score */}
          <div className="rounded-lg border border-border-default bg-surface-card p-6 text-center">
            <p className="text-xs uppercase tracking-wide font-medium text-text-muted mb-1">
              Your score
            </p>
            <p className="text-4xl font-semibold tabular-nums">{pct}%</p>
          </div>

          {/* Per-question results */}
          <ol className="space-y-4 list-none">
            {questions.map((question, i) => {
              const r = byId.get(question.id);
              const stem = question.type === 'mcq' ? question.stem : question.prompt;
              return (
                <li
                  key={question.id}
                  className="rounded-lg border border-border-default bg-surface-card p-4"
                >
                  <div className="flex items-start gap-2">
                    {r ? (
                      r.correct ? (
                        <Icon
                          name="check-circle-2"
                          size={18}
                          className="mt-0.5 shrink-0 text-success"
                        />
                      ) : (
                        <Icon name="x" size={18} className="mt-0.5 shrink-0 text-danger" />
                      )
                    ) : null}
                    <p className="font-semibold text-sm">
                      {i + 1}. {stem}
                    </p>
                  </div>

                  {r && (
                    <div className="mt-3 space-y-2 pl-6">
                      {question.type === 'mcq' &&
                        r.correctIndex != null &&
                        question.options[r.correctIndex] != null && (
                          <p className="text-sm">
                            <span className="text-text-muted">Correct answer: </span>
                            <span className="font-medium text-success">
                              {question.options[r.correctIndex]}
                            </span>
                          </p>
                        )}

                      {question.type === 'short-answer' && r.modelAnswer && (
                        <p className="text-sm">
                          <span className="text-text-muted">Model answer: </span>
                          <span className="font-medium">{r.modelAnswer}</span>
                        </p>
                      )}

                      {r.feedback && (
                        <p className="text-sm text-text-muted">{r.feedback}</p>
                      )}

                      {r.explanation && (
                        <p className="text-xs text-text-muted italic">{r.explanation}</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="flex gap-3 pt-2 flex-wrap">
            <Button variant="primary" onClick={() => router.push(`/study/${studySetId}`)}>
              Back to study set
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // --- Render: taking (wizard) ---------------------------------------------
  const progress = total > 0 ? ((current + 1) / total) * 100 : 0;

  return (
    <>
      <AppShell active="study" title="Quiz">
        <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto">
          {/* Progress */}
          <div className="mb-6">
            <p className="text-xs text-text-muted font-medium uppercase tracking-wide mb-2">
              Question {current + 1} of {total}
            </p>
            <div className="h-1.5 w-full rounded-full bg-surface-sunken overflow-hidden">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Question */}
          {q && (
            <div className="space-y-4">
              {q.type === 'mcq' ? (
                <>
                  <p className="font-semibold text-base">{q.stem}</p>
                  <ul className="space-y-2 list-none">
                    {q.options.map((opt, oi) => {
                      const selected = answers[q.id] === String(oi);
                      return (
                        <li key={oi}>
                          <button
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setAnswer(q.id, String(oi))}
                            className={[
                              'w-full text-left rounded-lg border px-4 py-3 text-sm transition-colors',
                              selected
                                ? 'border-brand bg-surface-brand-soft text-text-strong font-medium'
                                : 'border-border-default bg-surface-card text-text-muted hover:border-brand',
                            ].join(' ')}
                          >
                            <span className="mr-2 font-medium">
                              {String.fromCharCode(65 + oi)}.
                            </span>
                            {opt}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <>
                  <p className="font-semibold text-base">{q.prompt}</p>
                  <Textarea
                    rows={3}
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    placeholder="Type your answer…"
                  />
                </>
              )}

              {/* Nav row */}
              <div className="flex gap-3 pt-2 flex-wrap justify-between">
                {current > 0 ? (
                  <Button
                    variant="secondary"
                    onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                    leftIcon={<Icon name="chevron-left" size={15} />}
                  >
                    Back
                  </Button>
                ) : (
                  <span />
                )}

                {isLast ? (
                  <Button
                    variant="primary"
                    disabled={!allAnswered || submitting || submitted}
                    onClick={() => setConfirmOpen(true)}
                  >
                    Submit quiz
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    disabled={!currentAnswered}
                    onClick={() => setCurrent((c) => Math.min(total - 1, c + 1))}
                  >
                    Next
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </AppShell>

      {/* Grading overlay — shown while the attempt POST is in flight. */}
      {submitting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/60 text-white">
          <Icon name="loader-circle" size={40} className="animate-spin" />
          <p className="text-sm">Grading your answers&hellip;</p>
        </div>
      )}

      {/* Confirm dialog — rendered OUTSIDE AppShell to avoid the double-mount
          caveat (AppShell renders children twice; a dialog inside would call
          showModal() twice and stack two top-layer modals). */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Submit your answers?"
        description="You can't change them after submission."
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={submitting}
              disabled={submitting || submitted}
            >
              Submit
            </Button>
          </div>
        }
      />

      {/* Submit error toast — also outside AppShell for the same reason. */}
      {submitError && (
        <Toast tone="danger" title="Error" onClose={() => setSubmitError(null)}>
          {submitError}
        </Toast>
      )}
    </>
  );
}

QuizTakingScreen.displayName = 'QuizTakingScreen';
