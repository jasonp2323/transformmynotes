import { NextResponse } from 'next/server';
import { ulid } from 'ulid';
import {
  getNote, putStudySet, countInFlightStudySets, buildStudySetItem,
  MATERIAL_TYPES, type StudyMaterialType, type StudyLanguage,
  resolveAiConfig,
} from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';
import { parseMaxConcurrentStudyJobs } from '@/lib/study/guardrails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Fail-loud at import: a non-integer / missing value crashes the route module.
const MAX_CONCURRENT_STUDY_JOBS = parseMaxConcurrentStudyJobs(process.env.MAX_CONCURRENT_STUDY_JOBS);

const TYPE_LABELS: Record<StudyMaterialType, string> = {
  flashcards: 'Flashcards', quiz: 'Quiz', assignment: 'Assignment', summary: 'Summary',
  glossary: 'Glossary', study_guide: 'Study Guide',
};
const VALID_LANGUAGES: StudyLanguage[] = ['auto', 'pt-BR', 'bilingual'];

export async function POST(req: Request) {
  // Auth: verify the Cognito ID token and extract the sub.
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Parse JSON body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid request body.' },
      { status: 400 },
    );
  }

  const { sourceNoteId, type, language } = (body ?? {}) as Record<string, unknown>;

  // Validate sourceNoteId.
  if (typeof sourceNoteId !== 'string' || !sourceNoteId) {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid sourceNoteId.' },
      { status: 400 },
    );
  }

  // Validate type.
  if (typeof type !== 'string' || !(MATERIAL_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid type.' },
      { status: 400 },
    );
  }
  const materialType = type as StudyMaterialType;

  // Resolve language. When omitted, default to 'auto' so output matches the
  // source note's language (generateStudyMaterial maps 'auto' → AUTO_DIRECTIVE).
  let resolvedLanguage: StudyLanguage;
  if (language === undefined) {
    resolvedLanguage = 'auto';
  } else if (typeof language !== 'string' || !VALID_LANGUAGES.includes(language as StudyLanguage)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid language.' },
      { status: 400 },
    );
  } else {
    resolvedLanguage = language as StudyLanguage;
  }

  try {
    // Resolve runtime AI config — fails loudly if modelId / baseSystemPrompt unset.
    const config = await resolveAiConfig();

    // Enforce global kill switch.
    if (!config.generationEnabled) {
      return NextResponse.json(
        { ok: false, error: 'AI generation is currently disabled.' },
        { status: 403 },
      );
    }

    // Enforce per-type toggle.
    if (config.enabledMaterialTypes[materialType] === false) {
      return NextResponse.json(
        { ok: false, error: `${TYPE_LABELS[materialType]} generation is currently disabled.` },
        { status: 403 },
      );
    }

    // Derive model id: per-type override falls back to the default.
    const model = config.modelOverrides[materialType] ?? config.modelId;

    // Look up the source note — a sub mismatch yields undefined → 404.
    const note = await getNote(sub, sourceNoteId);
    if (!note) {
      return NextResponse.json({ ok: false, error: 'Note not found.' }, { status: 404 });
    }

    // Enforce the per-user in-flight generation cap.
    const inFlight = await countInFlightStudySets(sub);
    if (inFlight >= MAX_CONCURRENT_STUDY_JOBS) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Too many in-flight generations. Please wait for one to finish and try again.',
        },
        { status: 429 },
      );
    }

    const studySetId = ulid();
    const now = new Date().toISOString();
    const title = `${TYPE_LABELS[materialType]} – ${note.title}`;

    const item = buildStudySetItem({
      sub,
      studySetId,
      sourceNoteIds: [sourceNoteId],
      type: materialType,
      title,
      status: 'queued',
      language: resolvedLanguage,
      model,
      createdAt: now,
    });
    await putStudySet(item);

    return NextResponse.json({ studySetId }, { status: 202 });
  } catch (err) {
    console.error('[study/generate] Could not enqueue study set', err);
    return NextResponse.json(
      { ok: false, error: 'Could not start generation.' },
      { status: 500 },
    );
  }
}
