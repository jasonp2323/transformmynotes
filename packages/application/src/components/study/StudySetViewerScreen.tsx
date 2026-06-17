'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  StudySetMeta,
  StudyBodyResponse,
  FlashcardsPayload,
  QuizPayload,
  AssignmentPayload,
  SummaryPayload,
  GlossaryPayload,
  StudyGuidePayload,
} from '@/src/lib/study-ui';
import { STUDY_TYPE_META, formatProvenance } from '@/src/lib/study-ui';
import { AppShell } from '@/src/components/shells';
import { Button } from '@/src/components/ui/Button';
import { Dialog } from '@/src/components/ui/Dialog';
import { Icon } from '@/src/components/ui/Icon';
import { Toast } from '@/src/components/ui/Toast';
import { IconButton } from '@/src/components/ui/IconButton';
import { Checkbox } from '@/src/components/ui/Checkbox';
import { PlayButton } from '@/src/components/tts';
import { scorePercent, formatDuration, formatAttemptDate } from './quiz-taking-logic';

// --- Attempt history types ---------------------------------------------------

interface AttemptSummary {
  attemptId: string;
  score: number;
  gradedAt: string;
  questionCount: number;
  durationMs?: number;
}

// --- Payload renderers -------------------------------------------------------

function FlashcardsView({
  payload,
  noteTitles,
  totalSourceCount,
}: {
  payload: FlashcardsPayload;
  noteTitles: Record<string, string>;
  totalSourceCount: number;
}) {
  return (
    <ol className="space-y-3 list-none">
      {payload.cards.map((card, i) => (
        <li key={i} className="rounded-lg border border-border-default bg-surface-card p-4">
          <div className="flex items-start gap-2 justify-between">
            <p className="font-semibold text-sm">{i + 1}. {card.front}</p>
            <PlayButton text={card.front} size={18} className="shrink-0 text-text-muted" />
          </div>
          <div className="mt-2 flex items-start gap-2 justify-between">
            <p className="text-sm text-text-muted">{card.back}</p>
            <PlayButton text={card.back} size={18} className="shrink-0 text-text-muted" />
          </div>
          {(() => {
            const label = formatProvenance(card.sourceNoteIds, noteTitles, totalSourceCount);
            return label ? <p className="mt-1.5 text-xs font-mono text-text-muted">{label}</p> : null;
          })()}
        </li>
      ))}
    </ol>
  );
}

function QuizView({
  payload,
  noteTitles,
  totalSourceCount,
}: {
  payload: QuizPayload;
  noteTitles: Record<string, string>;
  totalSourceCount: number;
}) {
  const [revealed, setRevealed] = useState<boolean[]>(
    () => payload.questions.map(() => false)
  );

  function toggle(i: number) {
    setRevealed((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  return (
    <ol className="space-y-4 list-none">
      {payload.questions.map((q, i) => (
        <li key={i} className="rounded-lg border border-border-default bg-surface-card p-4">
          <p className="font-semibold text-sm">{i + 1}. {q.stem}</p>
          <ul className="mt-2 space-y-1">
            {q.choices.map((choice, ci) => (
              <li
                key={ci}
                className={[
                  'text-sm rounded px-2 py-1',
                  revealed[i] && ci === q.answerIndex
                    ? 'bg-surface-brand-soft text-text-strong font-medium'
                    : 'text-text-muted',
                ].join(' ')}
              >
                {String.fromCharCode(65 + ci)}. {choice}
              </li>
            ))}
          </ul>
          {revealed[i] && q.explanation && (
            <p className="mt-2 text-xs text-text-muted italic">{q.explanation}</p>
          )}
          <button
            type="button"
            onClick={() => toggle(i)}
            className="mt-2 text-xs text-brand underline"
          >
            {revealed[i] ? 'Hide answer' : 'Reveal answer'}
          </button>
          {(() => {
            const label = formatProvenance(q.sourceNoteIds, noteTitles, totalSourceCount);
            return label ? <p className="mt-2 text-xs font-mono text-text-muted">{label}</p> : null;
          })()}
        </li>
      ))}
    </ol>
  );
}

function AssignmentView({
  payload,
  noteTitles,
  totalSourceCount,
}: {
  payload: AssignmentPayload;
  noteTitles: Record<string, string>;
  totalSourceCount: number;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">{payload.title}</h2>
      {(() => {
        const label = formatProvenance(payload.sourceNoteIds, noteTitles, totalSourceCount, 'Sources');
        return label ? <p className="text-xs font-mono text-text-muted">{label}</p> : null;
      })()}
      <p className="text-sm text-text-muted whitespace-pre-wrap">{payload.instructions}</p>
      {payload.rubric.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Rubric</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-border-default rounded-lg">
              <thead className="bg-surface-sunken">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Criterion</th>
                  <th className="px-3 py-2 text-right font-medium w-16">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {payload.rubric.map((row, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{row.criterion}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryView({
  payload,
  noteTitles,
  totalSourceCount,
}: {
  payload: SummaryPayload;
  noteTitles: Record<string, string>;
  totalSourceCount: number;
}) {
  return (
    <div className="space-y-4">
      {payload.title && <h2 className="text-base font-semibold">{payload.title}</h2>}
      {(() => {
        const label = formatProvenance(payload.sourceNoteIds, noteTitles, totalSourceCount, 'Sources');
        return label ? <p className="text-xs font-mono text-text-muted">{label}</p> : null;
      })()}
      <div className="rounded-lg border border-border-default bg-surface-card p-4">
        <p className="text-xs uppercase tracking-wide font-medium text-text-muted mb-1">TL;DR</p>
        <p className="text-sm">{payload.tldr}</p>
      </div>
      {payload.keyPoints.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Key Points</h3>
          <ul className="space-y-1.5">
            {payload.keyPoints.map((point, i) => (
              <li key={i} className="flex gap-2 text-sm text-text-muted">
                <Icon name="check" size={14} className="mt-0.5 shrink-0 text-success" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {payload.terms.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Terms</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-border-default rounded-lg">
              <thead className="bg-surface-sunken">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Term</th>
                  <th className="px-3 py-2 text-left font-medium">Definition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {payload.terms.map((row, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{row.term}</td>
                    <td className="px-3 py-2 text-text-muted">{row.definition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function GlossaryView({
  payload,
  noteTitles,
  totalSourceCount,
}: {
  payload: GlossaryPayload;
  noteTitles: Record<string, string>;
  totalSourceCount: number;
}) {
  return (
    <>
      {(() => {
        const label = formatProvenance(payload.sourceNoteIds, noteTitles, totalSourceCount, 'Sources');
        return label ? <p className="mb-2 text-xs font-mono text-text-muted">{label}</p> : null;
      })()}
      <dl className="glossary-list">
        {payload.terms.map((entry, i) => (
          <div key={i} className="glossary-entry">
            <dt className="glossary-term"><span className="inline-flex items-center gap-2">{entry.term}<PlayButton text={entry.term} size={18} className="shrink-0 text-text-muted" /></span></dt>
            <dd className="glossary-def">{entry.definition}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function StudyGuideView({
  payload,
  noteTitles,
  totalSourceCount,
}: {
  payload: StudyGuidePayload;
  noteTitles: Record<string, string>;
  totalSourceCount: number;
}) {
  return (
    <div className="space-y-4">
      {payload.title && <h2 className="text-base font-semibold">{payload.title}</h2>}
      {payload.sections.map((section, i) => (
        <div key={i} className="rounded-lg border border-border-default bg-surface-card p-4">
          <h3 className="text-sm font-medium mb-2">{section.heading}</h3>
          {(() => {
            const label = formatProvenance(section.sourceNoteIds, noteTitles, totalSourceCount, 'Sources');
            return label ? <p className="mb-2 text-xs font-mono text-text-muted">{label}</p> : null;
          })()}
          {section.keyPoints.length > 0 && (
            <ul className="space-y-1.5 mb-2">
              {section.keyPoints.map((point, pi) => (
                <li key={pi} className="flex gap-2 text-sm text-text-muted">
                  <Icon name="check" size={14} className="mt-0.5 shrink-0 text-success" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}
          {section.body && (
            <p className="text-sm text-text-muted whitespace-pre-wrap">{section.body}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Future-entry-point stub label per type ----------------------------------
function stubLabel(type: StudySetMeta['type']): string {
  switch (type) {
    case 'flashcards': return 'Open in deck';
    case 'quiz': return 'Start quiz';
    default: return 'Open';
  }
}

// --- Main viewer -------------------------------------------------------------

export interface StudySetViewerScreenProps {
  studySetId: string;
}

export function StudySetViewerScreen({ studySetId }: StudySetViewerScreenProps) {
  const router = useRouter();
  const [meta, setMeta] = useState<StudySetMeta | null>(null);
  const [body, setBody] = useState<StudyBodyResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingBody, setLoadingBody] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  // Attempt history (quiz only)
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);

  // Fetch metadata
  useEffect(() => {
    fetch(`/api/study/${studySetId}`)
      .then(async (res) => {
        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error('Failed to load study set');
        setMeta((await res.json()) as StudySetMeta);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingMeta(false));
  }, [studySetId]);

  // Fetch body when meta is ready
  useEffect(() => {
    if (!meta || meta.status !== 'ready') return;
    setLoadingBody(true);
    fetch(`/api/study/${studySetId}/body`)
      .then(async (res) => {
        if (!res.ok) return;
        setBody((await res.json()) as StudyBodyResponse);
      })
      .catch(() => undefined)
      .finally(() => setLoadingBody(false));
  }, [meta, studySetId]);

  // Fetch attempt history when meta is available and type is quiz
  useEffect(() => {
    if (!meta || meta.type !== 'quiz' || meta.status !== 'ready') return;
    setLoadingAttempts(true);
    fetch(`/api/study/${studySetId}/attempts`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { attempts: AttemptSummary[] };
        setAttempts(data.attempts ?? []);
      })
      .catch(() => undefined)
      .finally(() => setLoadingAttempts(false));
  }, [meta, studySetId]);

  // Sync assignment completion state from loaded meta
  useEffect(() => {
    if (meta?.type === 'assignment') {
      setCompleted(meta.completed === true);
    }
  }, [meta]);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/study/${studySetId}`, { method: 'DELETE' });
      if (res.status === 204 || res.ok) {
        router.push('/study');
      } else {
        setDeleteError('Failed to delete study set. Please try again.');
      }
    } catch {
      setDeleteError('Failed to delete study set. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleComplete(next: boolean) {
    setCompleted(next);
    setCompleteError(null);
    try {
      const res = await fetch(`/api/study/${studySetId}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: next }),
      });
      if (!res.ok) {
        setCompleted(!next);
        setCompleteError('Failed to update completion. Please try again.');
      }
    } catch {
      setCompleted(!next);
      setCompleteError('Failed to update completion. Please try again.');
    }
  }

  if (loadingMeta) {
    return (
      <AppShell active="study" title="Study">
        <div className="flex justify-center py-12">
          <Icon name="loader-circle" size={32} className="animate-spin text-text-muted" />
        </div>
      </AppShell>
    );
  }

  if (notFound || !meta) {
    return (
      <AppShell active="study" title="Study">
        <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto">
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <Icon name="inbox" size={48} className="opacity-40 text-text-muted" />
            <div>
              <p className="font-medium">Study set not found</p>
              <p className="mt-1 text-sm text-text-muted">It may have been deleted.</p>
            </div>
            <Button variant="secondary" onClick={() => router.push('/study')}>
              Back to Study
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const typeMeta = STUDY_TYPE_META[meta.type];

  return (
    <>
      <AppShell active="study" title={meta.title}>
        <div className="study-set-viewer px-4 py-6 sm:px-6 lg:px-8 max-w-2xl mx-auto">
          {/* Header row */}
          <div className="flex items-center gap-3 mb-6 print-hidden">
            <IconButton
              label="Back to study list"
              onClick={() => router.push('/study')}
              size="sm"
              variant="plain"
            >
              <Icon name="chevron-left" size={18} />
            </IconButton>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-muted font-medium uppercase tracking-wide">{typeMeta.label}</p>
              <h1 className="text-base font-semibold truncate">{meta.title}</h1>
            </div>
          </div>

          {/* Non-ready states */}
          {(meta.status === 'queued' || meta.status === 'running') && (
            <div className="flex flex-col items-center gap-4 py-16 text-center text-text-muted">
              <Icon name="loader-circle" size={40} className="animate-spin" />
              <p className="text-sm">Generating your study set&hellip;</p>
            </div>
          )}

          {meta.status === 'failed' && (
            <div className="rounded-lg border border-danger bg-surface-sunken px-4 py-4 text-sm text-danger">
              <p className="font-medium">Generation failed</p>
              {meta.error && <p className="mt-1">{meta.error}</p>}
            </div>
          )}

          {/* Body content */}
          {meta.status === 'ready' && (
            <div className="space-y-6">
              {loadingBody && (
                <div className="flex justify-center py-8">
                  <Icon name="loader-circle" size={28} className="animate-spin text-text-muted" />
                </div>
              )}

              {!loadingBody && body && (
                <>
                  {(() => {
                    const noteTitles = meta.noteTitles ?? {};
                    const totalSourceCount = meta.sourceNoteIds.length;
                    return (
                      <>
                        {body.type === 'flashcards' && (
                          <FlashcardsView payload={body.payload as FlashcardsPayload} noteTitles={noteTitles} totalSourceCount={totalSourceCount} />
                        )}
                        {body.type === 'quiz' && (
                          <QuizView payload={body.payload as QuizPayload} noteTitles={noteTitles} totalSourceCount={totalSourceCount} />
                        )}
                        {body.type === 'assignment' && (
                          <AssignmentView payload={body.payload as AssignmentPayload} noteTitles={noteTitles} totalSourceCount={totalSourceCount} />
                        )}
                        {body.type === 'summary' && (
                          <SummaryView payload={body.payload as SummaryPayload} noteTitles={noteTitles} totalSourceCount={totalSourceCount} />
                        )}
                        {body.type === 'glossary' && (
                          <GlossaryView payload={body.payload as GlossaryPayload} noteTitles={noteTitles} totalSourceCount={totalSourceCount} />
                        )}
                        {body.type === 'study_guide' && (
                          <StudyGuideView payload={body.payload as StudyGuidePayload} noteTitles={noteTitles} totalSourceCount={totalSourceCount} />
                        )}
                      </>
                    );
                  })()}
                </>
              )}

              {meta.type === 'assignment' && (
                <div className="print-hidden">
                  <Checkbox
                    checked={completed}
                    onChange={(e) => void handleComplete(e.target.checked)}
                    label="Mark complete"
                  />
                </div>
              )}

              {/* Attempt history — quiz only */}
              {meta.type === 'quiz' && (
                <div className="rounded-lg border border-border-default bg-surface-card p-4 print-hidden">
                  <h2 className="text-sm font-semibold mb-3">Attempt history</h2>
                  {loadingAttempts && (
                    <div className="flex justify-center py-4">
                      <Icon name="loader-circle" size={22} className="animate-spin text-text-muted" />
                    </div>
                  )}
                  {!loadingAttempts && attempts.length === 0 && (
                    <p className="text-sm text-text-muted">
                      No attempts yet — take the quiz to see your results here.
                    </p>
                  )}
                  {!loadingAttempts && attempts.length > 0 && (
                    <ul className="space-y-2 list-none">
                      {attempts.slice(0, 10).map((attempt) => {
                        const duration = formatDuration(attempt.durationMs);
                        return (
                          <li
                            key={attempt.attemptId}
                            className="flex items-center justify-between gap-3 rounded border border-border-default bg-surface-sunken px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium tabular-nums">
                                {scorePercent(attempt.score)}%
                              </p>
                              <p className="text-xs text-text-muted truncate">
                                {formatAttemptDate(attempt.gradedAt)}
                                {duration ? ` · ${duration}` : ''}
                              </p>
                            </div>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                router.push(
                                  `/study/${studySetId}/attempt/${attempt.attemptId}`,
                                )
                              }
                            >
                              View results
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {/* Action row */}
              <div className="flex gap-3 pt-2 flex-wrap print-hidden">
                {meta.type === 'quiz' ? (
                  <Button
                    variant="secondary"
                    onClick={() => router.push(`/study/${studySetId}/take`)}
                    leftIcon={<Icon name="sparkles" size={15} />}
                  >
                    {stubLabel(meta.type)}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    disabled
                    title="Coming soon"
                    aria-label={`${stubLabel(meta.type)} — coming soon`}
                    leftIcon={<Icon name="sparkles" size={15} />}
                  >
                    {stubLabel(meta.type)}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => window.print()}
                  aria-label="Print study material"
                  leftIcon={<Icon name="printer" size={15} />}
                >
                  Print
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setDeleteOpen(true)}
                  leftIcon={<Icon name="trash-2" size={15} />}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}

          {/* Also show delete button for failed sets */}
          {meta.status === 'failed' && (
            <div className="mt-4">
              <Button
                variant="danger"
                onClick={() => setDeleteOpen(true)}
                leftIcon={<Icon name="trash-2" size={15} />}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      </AppShell>

      {/* Delete confirmation dialog — outside AppShell to avoid double-mounting
          (AppShell renders children twice: once in mobile shell, once in desktop shell).
          A dialog inside AppShell would call showModal() twice, stacking two modal
          dialogs in the browser top-layer and blocking all pointer events on the buttons. */}
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete study set?"
        description="This cannot be undone."
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={deleting}
              disabled={deleting}
            >
              Delete
            </Button>
          </div>
        }
      />

      {/* Delete error toast — also outside AppShell for the same reason */}
      {deleteError && (
        <Toast
          tone="danger"
          title="Error"
          onClose={() => setDeleteError(null)}
        >
          {deleteError}
        </Toast>
      )}

      {/* Complete error toast — also outside AppShell for the same reason */}
      {completeError && (
        <Toast
          tone="danger"
          title="Error"
          onClose={() => setCompleteError(null)}
        >
          {completeError}
        </Toast>
      )}
    </>
  );
}

StudySetViewerScreen.displayName = 'StudySetViewerScreen';
