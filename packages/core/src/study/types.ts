/**
 * Shared types for the M13 AI study-material generation feature.
 *
 * These are the canonical type contracts consumed by both the data layer
 * (`db/study.ts`) and the generation layer (`study/generate.ts`,
 * `study/config.ts`). They live in their own module so neither layer has to
 * import from the other, and so there is a single source of truth for the
 * study-material type union.
 */

/** The four kinds of study material the generation engine can produce. */
export type StudyMaterialType = 'flashcards' | 'quiz' | 'assignment' | 'summary';

/** All material types, in display order. Iterate this rather than re-listing. */
export const MATERIAL_TYPES: readonly StudyMaterialType[] = [
  'flashcards',
  'quiz',
  'assignment',
  'summary',
] as const;

/**
 * Lifecycle status of a STUDYSET item.
 *   queued  → written by POST /api/study/generate, awaiting the consumer
 *   running → consumer claimed it (atomic guard) and is calling Bedrock
 *   ready   → generation succeeded; `bodyS3Key` points at the JSON payload
 *   failed  → generation failed; `error` carries the reason
 */
export type StudySetStatus = 'queued' | 'running' | 'ready' | 'failed';

/**
 * Resolved output-language mode for a generation request.
 *   'pt-BR'     → all generated content in Brazilian Portuguese (default)
 *   'bilingual' → pt-BR ↔ en artifacts for language-learning notes
 */
export type StudyLanguage = 'pt-BR' | 'bilingual';
