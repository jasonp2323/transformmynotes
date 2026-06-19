import { NextResponse } from 'next/server';
import { ulid } from 'ulid';
import {
  batchGetNotes, listNotesByGroup,
  putStudySet, countInFlightStudySets, buildStudySetItem, getSource,
  MATERIAL_TYPES, type StudyMaterialType, type StudyLanguage, type NoteItem,
  resolveAiConfig, estimateTokens, resolveContextLimit, resolveMaxSourceNotes,
  resolveSourceText, getUserProfileBySub, assembleLearnerContext,
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
    sourceRefs: rawSourceRefs,
  } = (body ?? {}) as Record<string, unknown>;

  // ── Resolve source refs (M20) + legacy note ids ──────────────────────────
  // Explicit `sourceRefs` (M20) take precedence and may include document refs.
  // Otherwise fall back to the legacy note-resolution path (notebookId /
  // sourceNoteIds / sourceNoteId / noteId) and synthesize note-only refs below.
  const hasExplicitRefs = Array.isArray(rawSourceRefs) && rawSourceRefs.length > 0;

  let resolvedNoteIds: string[];
  let fromNotebook = false;
  let documentSourceIds: string[] = [];
  let resolvedSourceRefs: { type: 'note' | 'document'; id: string }[] = [];

  if (hasExplicitRefs) {
    // Validate each ref shape, then split into note + document refs.
    const parsed: { type: 'note' | 'document'; id: string }[] = [];
    for (const r of rawSourceRefs as unknown[]) {
      const ref = r as { type?: unknown; id?: unknown };
      if (
        (ref.type !== 'note' && ref.type !== 'document') ||
        typeof ref.id !== 'string' ||
        !ref.id
      ) {
        return NextResponse.json(
          { ok: false, error: 'Invalid sourceRefs.' },
          { status: 400 },
        );
      }
      parsed.push({ type: ref.type, id: ref.id });
    }
    resolvedSourceRefs = parsed;
    resolvedNoteIds = parsed.filter((r) => r.type === 'note').map((r) => r.id);
    documentSourceIds = parsed.filter((r) => r.type === 'document').map((r) => r.id);
  } else if (typeof notebookId === 'string' && notebookId) {
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
      fromNotebook = true;
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

  // Validate note ids: non-empty strings. De-duplicate preserving order.
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
  // At least one source (note or document) is required.
  if (deduped.length === 0 && documentSourceIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid sourceNoteId.' },
      { status: 400 },
    );
  }

  // When not using explicit refs, synthesize note-only sourceRefs from deduped.
  if (!hasExplicitRefs) {
    resolvedSourceRefs = deduped.map((id) => ({ type: 'note' as const, id }));
  }

  // ── Note cap enforcement ────────────────────────────────────────────────
  let truncatedFrom: number | undefined;
  const maxSourceNotesCap = resolveMaxSourceNotes();
  if (deduped.length > maxSourceNotesCap) {
    if (fromNotebook) {
      truncatedFrom = deduped.length;
      // Sort newest-first by ULID (lexicographic descending), then truncate.
      deduped.sort((a, b) => b.localeCompare(a));
      deduped.splice(maxSourceNotesCap);
    } else {
      return NextResponse.json(
        { error: 'too_many_notes', max: maxSourceNotesCap },
        { status: 422 },
      );
    }
  }

  // Validate type.
  if (typeof type !== 'string' || !(MATERIAL_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid type.' },
      { status: 400 },
    );
  }
  const materialType = type as StudyMaterialType;

  // Validate the provided language (if any). Resolution against the profile's
  // preferredLanguage happens later (after the profile fetch) so that the
  // precedence chain is: request param > aiProfile.preferredLanguage > 'auto'.
  let requestedLanguage: StudyLanguage | undefined;
  if (language === undefined) {
    requestedLanguage = undefined;
  } else if (typeof language !== 'string' || !VALID_LANGUAGES.includes(language as StudyLanguage)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid language.' },
      { status: 400 },
    );
  } else {
    requestedLanguage = language as StudyLanguage;
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

    // ── Document source validation (M20) ─────────────────────────────────────
    // Consumer-side document text resolution and generation land in M20.3.
    // Here we validate document sources exist and are ready, collect their
    // titles for the study-set title, then persist sourceRefs.
    const documentTitles: string[] = [];
    for (const docId of documentSourceIds) {
      const src = await getSource(sub, docId);
      if (!src) {
        return NextResponse.json(
          { ok: false, error: 'Source not found.' },
          { status: 404 },
        );
      }
      if (src.status !== 'ready') {
        return NextResponse.json(
          { error: 'source_not_ready' },
          { status: 422 },
        );
      }
      documentTitles.push(src.title);
    }

    // ── dryRun: estimate tokens, return without writing anything ─────────────
    if (dryRun === true) {
      const bodies = await Promise.all(notes.map((n) => readNoteBody(n)));
      // Include extracted text from document sources so the estimate is accurate
      // for mixed note+document requests and the mapReduceNeeded flag is correct.
      for (const id of documentSourceIds) {
        const resolved = await resolveSourceText(sub, { type: 'document', id });
        bodies.push(resolved.text);
      }
      const estimatedTokens = estimateTokens(bodies);
      const estimatedCostUsd = estimatedTokens * 0.000003;
      const mapReduceNeeded = estimatedTokens > resolveContextLimit();
      const inFlight = await countInFlightStudySets(sub);
      const rateLimitRemaining = Math.max(0, MAX_CONCURRENT_STUDY_JOBS - inFlight);
      return NextResponse.json(
        {
          estimatedTokens,
          estimatedCostUsd,
          mapReduceNeeded,
          noteCount: deduped.length,
          rateLimitRemaining,
          ...(truncatedFrom !== undefined ? { truncatedFrom } : {}),
        },
        { status: 200 },
      );
    }

    // ── Non-dryRun: enqueue generation ───────────────────────────────────────

    // Fetch caller profile once and resolve language + learner context snapshots.
    // Null profile (new user with no profile) is handled safely via optional chaining.
    const profile = await getUserProfileBySub(sub);
    const aiProfile = profile?.aiProfile;
    const resolvedLanguage: StudyLanguage = requestedLanguage ?? aiProfile?.preferredLanguage ?? 'auto';
    const learnerContext = assembleLearnerContext(aiProfile);

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

    // Build title from all source provenance labels (note titles first, in
    // deduped order, then document titles): 1 source → "{Type} – {title}";
    // multiple → "{Type} – {title} +N more". At least one source is guaranteed.
    // notes is returned by batchGetNotes in arbitrary order — sort by deduped order
    const noteMap = new Map(notes.map((n) => [n.noteId, n]));
    const sourceTitles = [
      ...deduped.map((id) => noteMap.get(id)!.title),
      ...documentTitles,
    ];
    const title =
      sourceTitles.length === 1
        ? `${TYPE_LABELS[materialType]} – ${sourceTitles[0]}`
        : `${TYPE_LABELS[materialType]} – ${sourceTitles[0]} +${sourceTitles.length - 1} more`;

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
      sourceRefs: resolvedSourceRefs,
      learnerContext,
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
