'use client';

import React from 'react';
import { Icon } from '@/src/components/ui/Icon';
import { scorePercent, letterBand } from './quiz-taking-logic';

// --- Exported interfaces -----------------------------------------------------

export interface ScoreReportQuestion {
  id: string;
  type: 'mcq' | 'short-answer';
  /** MCQ question text */
  stem?: string;
  /** Short-answer question text */
  prompt?: string;
  /** MCQ answer choices */
  options?: string[];
}

export interface ScoreReportResult {
  questionId: string;
  type: 'mcq' | 'short-answer';
  correct: boolean;
  score: number;
  feedback?: string;
  /** MCQ only — 0-based index of the correct choice. */
  correctIndex?: number;
  /** Short-answer only — the model's reference answer. */
  modelAnswer?: string;
  explanation: string;
}

export interface QuizScoreReportProps {
  /** Raw 0–1 score from the attempt response. */
  score: number;
  questions: ScoreReportQuestion[];
  results: ScoreReportResult[];
  /** Map of questionId → user answer (MCQ: stringified index; SA: raw text). */
  answers: Record<string, string>;
}

// --- Component ---------------------------------------------------------------

export function QuizScoreReport({ score, questions, results, answers }: QuizScoreReportProps): React.JSX.Element {
  const pct = scorePercent(score);
  const band = letterBand(pct);

  const toneTextClass: Record<typeof band.tone, string> = {
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  };

  const resultById = new Map(results.map((r) => [r.questionId, r]));

  return (
    <div className="space-y-6">
      {/* Score header card */}
      <div className="rounded-lg border border-border-default bg-surface-card p-6 text-center">
        <p className="text-xs uppercase tracking-wide font-medium text-text-muted mb-1">
          Your score
        </p>
        <p className="text-4xl font-semibold tabular-nums">{pct}%</p>
        <p className={['text-2xl font-bold mt-1', toneTextClass[band.tone]].join(' ')}>
          {band.letter}
        </p>
      </div>

      {/* Per-question breakdown */}
      <ol className="space-y-4 list-none">
        {questions.map((question, i) => {
          const r = resultById.get(question.id);
          const stem = question.type === 'mcq' ? question.stem : question.prompt;

          return (
            <li
              key={question.id}
              className="rounded-lg border border-border-default bg-surface-card p-4"
            >
              {/* Question header */}
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
                  {/* MCQ: render all options with correct/chosen highlighting */}
                  {question.type === 'mcq' && Array.isArray(question.options) && (
                    <ul className="space-y-1 list-none">
                      {question.options.map((opt, idx) => {
                        const isChosen = answers[question.id] === String(idx);
                        const isCorrect = r.correctIndex != null && idx === r.correctIndex;

                        let optionClass = 'text-sm rounded px-2 py-1 ';
                        if (isCorrect && isChosen) {
                          // User chose the correct answer
                          optionClass += 'border border-success bg-surface-card text-success font-medium';
                        } else if (isChosen && !isCorrect) {
                          // User chose a wrong answer
                          optionClass += 'border border-danger bg-surface-card text-danger font-medium';
                        } else if (isCorrect && !isChosen) {
                          // Reveal the correct answer that wasn't chosen
                          optionClass += 'border border-success bg-surface-card text-success';
                        } else {
                          optionClass += 'text-text-muted';
                        }

                        return (
                          <li key={idx} className={optionClass}>
                            <span className="mr-1.5 font-medium">
                              {String.fromCharCode(65 + idx)}.
                            </span>
                            {opt}
                            {isCorrect && !isChosen && (
                              <span className="ml-2 text-xs font-medium text-success">
                                ✓ Correct
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* Short-answer: user's answer + feedback + model answer */}
                  {question.type === 'short-answer' && (
                    <div className="space-y-1.5">
                      {answers[question.id] && (
                        <p className="text-sm">
                          <span className="text-text-muted">Your answer: </span>
                          <span className="italic">{answers[question.id]}</span>
                        </p>
                      )}
                      {r.feedback && (
                        <p className="text-sm text-text-muted italic">{r.feedback}</p>
                      )}
                      {r.modelAnswer && (
                        <p className="text-sm">
                          <span className="text-text-muted">Model answer: </span>
                          <span className="font-medium">{r.modelAnswer}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Explanation (all question types) */}
                  {r.explanation && (
                    <p className="text-xs text-text-muted italic">{r.explanation}</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

QuizScoreReport.displayName = 'QuizScoreReport';
