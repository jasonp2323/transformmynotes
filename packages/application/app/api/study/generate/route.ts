import { NextResponse } from 'next/server';
import { ulid } from 'ulid';
import {
  batchGetNotes, listNotesByGroup,
  putStudySet, countInFlightStudySets, buildStudySetItem,
  MATERIAL_TYPES, type StudyMaterialType, type StudyLanguage, type NoteItem,
  resolveAiConfig, estimateTokens, resolveContextLimit,
} from '@transformmynotes/core';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
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

/**
 * Reads a note's markdown body from S3.
 * Uses SST_RESOURCE_NotesBucket_name (already set via infra/application.ts environment block).
 */
async function readNoteBody(note: NoteItem): Promise<string> {
  const bucket = process.env.SST_RESOURCE_NotesBucket_name;
  if (!bucket) {
    throw new Error('Missing required env var SST_RESOURCE_NotesBucket_name');
  }
  const s3 = new S3Client({});
  const response = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: note.bodyS3Key }),
  );
  return response.Body!.transformToString();
}

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

  const {
    notebookId,
    sourceNoteIds: rawSourceNoteIds,
    sourceNoteId,
    noteId,
    type,
    language,
    dryRun,
  } = (body ?? {}) as Record<string, unknown>;

  // ── Resolve sourceNoteIds ─────────────────────────────────────────────────

  let resolvedNoteIds: string[];

  if (typeof notebookId === 'string' && notebookId) {
    // 1. notebookId: resolve via listNotesByGroup server-side.
    try {
      const notebookNotes = await listNotesByGroup(sub, notebookId);
      if (notebookNotes.length === 0) {
        return NextResponse.json(
          { ok: false, error: 'Notebook has no notes.' },
          { status: 404 },
        );
      }
      resolvedNoteIds = notebookNotes.map((n) => n.noteId);
    } catch (err) {
      console.error('[study/generate] listNotesByGroup failed', err);
      return NextResponse.json(
        { ok: false, error: 'Could not start generation.' },
        { status: 500 },
      );
    }
  } else if (Array.isArray(rawSourceNoteIds)) {
    // 2. sourceNoteIds array
    resolvedNoteIds = rawSourceNoteIds as string[];
  } else if (typeof sourceNoteId === 'string' && sourceNoteId) {
    // 3a. Backward-compat: sourceNoteId (current field name)
    resolvedNoteIds = [sourceNoteId];
  } else if (typeof noteId === 'string' && noteId) {
    // 3b. Backward-compat: noteId (spec's legacy name)
    resolvedNoteIds = [noteId];
  } else {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid sourceNoteId.' },
      { status: 400 },
    );
  }

  // Validate: non-empty array of non-empty strings. De-duplicate preserving order.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const id of resolvedNoteIds) {
    if (typeof id !== 'string' || !id) {
      return NextResponse.json(
        { ok: false, error: 'Missing or invalid sourceNoteId.' },
        { status: 400 },
      );
    }
    if (!seen.has(id)) {
      seen.add(id);
      deduped.push(id);
    }
  }
  if (deduped.length === 0) {
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
    // ── Ownership check ──────────────────────────────────────────────────────
    // batchGetNotes is user-scoped (keys include USER#<sub>), so it only returns
    // notes owned by this sub. A note owned by another user is indistinguishable
    // from a missing note — both are absent from the result. We return 404 for
    // both cases, matching the existing single-note behaviour (getNote also
    // returns undefined for cross-user note ids). Do NOT add a GSI for this.
    const notes = await batchGetNotes(sub, deduped);
    if (notes.length !== deduped.length) {
      return NextResponse.json(
        { ok: false, error: 'One or more notes not found.' },
        { status: 404 },
      );
    }

    // ── dryRun: estimate tokens, return without writing anything ─────────────
    if (dryRun === true) {
      const bodies = await Promise.all(notes.map((n) => readNoteBody(n)));
      const estimatedTokens = estimateTokens(bodies);
      const estimatedCostUsd = estimatedTokens * 0.000003;
      const mapReduceNeeded = estimatedTokens > resolveContextLimit();
      return NextResponse.json(
        {
          estimatedTokens,
          estimatedCostUsd,
          mapReduceNeeded,
          noteCount: deduped.length,
        },
        { status: 200 },
      );
    }

    // ── Non-dryRun: enqueue generation ───────────────────────────────────────

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

    // Build title: 1 note → "{Type} – {title}"; multiple → "{Type} – {title} +N more"
    // notes is returned by batchGetNotes in arbitrary order — sort by deduped order
    const noteMap = new Map(notes.map((n) => [n.noteId, n]));
    const orderedNotes = deduped.map((id) => noteMap.get(id)!);
    const title =
      orderedNotes.length === 1
        ? `${TYPE_LABELS[materialType]} – ${orderedNotes[0].title}`
        : `${TYPE_LABELS[materialType]} – ${orderedNotes[0].title} +${orderedNotes.length - 1} more`;

    const item = buildStudySetItem({
      sub,
      studySetId,
      sourceNoteIds: deduped,
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
