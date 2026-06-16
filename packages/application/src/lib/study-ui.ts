/**
 * Shared client-side types + per-material-type presentation metadata for the
 * M13.3 study-material UI. Imported by both the note-view "Generate study
 * material" entry point and the `/study` list + viewer pages so the type
 * labels, icons, and colours stay consistent across surfaces.
 *
 * The generated payload interfaces mirror the JSON Schemas the generation
 * wrapper forces the model to return (`packages/core/src/study/generate.ts`
 * `TOOL_SCHEMAS`). They are the rendering contract for the generic viewer.
 */
import type {
  StudyMaterialType,
  StudySetStatus,
  StudyLanguage,
} from '@transformmynotes/core';

/**
 * Study-set metadata as returned by the read API routes (`GET /api/study`,
 * `GET /api/study/[studySetId]`). Internal DynamoDB keys (pk/sk/gsi*) and the
 * `bodyS3Key` are stripped server-side and never reach the client.
 */
export interface StudySetMeta {
  studySetId: string;
  sourceNoteIds: string[];
  type: StudyMaterialType;
  title: string;
  status: StudySetStatus;
  language: StudyLanguage;
  model: string;
  promptVersion: string;
  /** Present only when `status === 'failed'`. */
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Generated-payload shapes (the viewer's rendering contract) -------------

export interface FlashcardsPayload {
  cards: Array<{ front: string; back: string }>;
}

export interface QuizPayload {
  questions: Array<{
    stem: string;
    choices: string[];
    answerIndex: number;
    explanation: string;
  }>;
}

export interface AssignmentPayload {
  title: string;
  instructions: string;
  rubric: Array<{ criterion: string; points: number }>;
}

export interface SummaryPayload {
  title: string;
  tldr: string;
  keyPoints: string[];
  terms: Array<{ term: string; definition: string }>;
}

/** Body returned by `GET /api/study/[studySetId]/body`. */
export interface StudyBodyResponse {
  type: StudyMaterialType;
  payload: FlashcardsPayload | QuizPayload | AssignmentPayload | SummaryPayload;
}

// --- Presentation metadata --------------------------------------------------

/** Badge `tone` union (kept in sync with the DS `Badge` component). */
export type StudyTypeTone =
  | 'neutral'
  | 'brand'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'solid';

export interface StudyTypeMeta {
  /** Singular display label, e.g. "Flashcards". */
  label: string;
  /** One-line description shown in the type picker. */
  description: string;
  /** Icon registry key (`@/src/components/ui` `Icon` name). */
  icon: string;
  /** Badge tone used for the type badge. */
  tone: StudyTypeTone;
}

/** Per-material-type presentation metadata, in display order. */
export const STUDY_TYPE_META: Record<StudyMaterialType, StudyTypeMeta> = {
  flashcards: {
    label: 'Flashcards',
    description: 'Question-and-answer cards covering the key facts.',
    icon: 'layers',
    tone: 'brand',
  },
  quiz: {
    label: 'Quiz',
    description: 'Multiple-choice questions to test your recall.',
    icon: 'list-ordered',
    tone: 'accent',
  },
  assignment: {
    label: 'Assignment',
    description: 'A practice task with instructions and a rubric.',
    icon: 'pencil',
    tone: 'warning',
  },
  summary: {
    label: 'Summary',
    description: 'A TL;DR, key points, and a glossary of terms.',
    icon: 'book-open',
    tone: 'success',
  },
};

/** Material types in display order (mirrors core `MATERIAL_TYPES`). */
export const STUDY_TYPE_ORDER: StudyMaterialType[] = [
  'flashcards',
  'quiz',
  'assignment',
  'summary',
];
