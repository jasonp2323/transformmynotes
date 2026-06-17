/**
 * Core logic for generating an AI study set (M13 + M17).
 *
 * Runs as a STANDALONE Lambda consuming the Notes-table DynamoDB stream — NOT
 * through the Next.js bundler — so it must avoid the `@/` path alias and import
 * only from `@transformmynotes/core` and the AWS SDK.
 *
 * The `deps` parameter lets callers inject every I/O dependency, allowing tests
 * to stub them out. All deps default to the real production implementations when
 * invoked from the Lambda handler.
 */

import {
  getStudySet,
  claimStudySet,
  markStudySetReady,
  markStudySetFailed,
  markStudySetTooLarge,
  getNote,
  generateStudyMaterial,
  storageKeys,
  studySetKeys,
  estimateTokens,
  resolveContextLimit,
  chunkNotes,
  deduplicateCandidates,
  applyProvenance,
  type StudySetItem,
  type StudyMaterialType,
  type StudyLanguage,
  type RawCandidate,
  HARD_CAP_TOKENS,
} from '@transformmynotes/core';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { loadStudyPromptsIntoEnv } from './study-prompts.js';

const MAX_NOTE_MARKDOWN_CHARS = 40000; // ~10k tokens; truncate oversized combined bodies (log a warning)

// ---------------------------------------------------------------------------
// Default dependency implementations
// ---------------------------------------------------------------------------

function requireBucketName(): string {
  const value = process.env.SST_RESOURCE_NotesBucket_name;
  if (!value) {
    throw new Error(
      'Missing required env var SST_RESOURCE_NotesBucket_name: the S3 bucket name is not bound.',
    );
  }
  return value;
}

/**
 * Injectable dependencies for `processStudyGeneration`.
 * Every field has a sensible default that points at real AWS / core services.
 */
export interface ProcessStudyDeps {
  /** Fetch a study set record from the store. Default: `getStudySet`. */
  getStudySet: (sub: string, studySetId: string) => Promise<StudySetItem | undefined>;
  /** Atomically claim a queued study set for processing. Default: `claimStudySet`. */
  claim: (sub: string, studySetId: string) => Promise<boolean>;
  /** Mark a study set ready. Default: `markStudySetReady`. */
  markReady: (input: {
    sub: string;
    studySetId: string;
    bodyS3Key: string;
    promptVersion: string;
    mapReduce?: boolean;
    chunkCount?: number;
    inputNoteCount?: number;
  }) => Promise<void>;
  /** Mark a study set failed with a sanitised message. Default: `markStudySetFailed`. */
  markFailed: (input: { sub: string; studySetId: string; error: string }) => Promise<void>;
  /**
   * Fetch the source note's markdown body.
   * Default: resolves the note, then reads its body from S3 using the
   * `SST_RESOURCE_NotesBucket_name` env var.
   */
  getNoteMarkdown: (sub: string, noteId: string) => Promise<string>;
  /**
   * Generate the study material payload.
   * Default: `generateStudyMaterial` from `@transformmynotes/core`.
   */
  generate: (input: {
    type: StudyMaterialType;
    noteMarkdown: string;
    noteTitle: string;
    language: StudyLanguage;
    phase?: 'map' | 'reduce';
    candidates?: RawCandidate[];
    maxTokensOverride?: number;
  }) => Promise<{ payload: unknown; promptVersion: string }>;
  /**
   * Persist the generated study set body JSON.
   * Default: writes to S3 via PutObjectCommand.
   */
  putBody: (sub: string, studySetId: string, json: string) => Promise<void>;
}

async function defaultGetNoteMarkdown(sub: string, noteId: string): Promise<string> {
  const note = await getNote(sub, noteId);
  if (!note) throw new Error('source note not found');
  const s3 = new S3Client({});
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: requireBucketName(),
      Key: note.bodyS3Key,
    }),
  );
  return response.Body!.transformToString();
}

async function defaultPutBody(sub: string, studySetId: string, json: string): Promise<void> {
  const s3 = new S3Client({});
  await s3.send(
    new PutObjectCommand({
      Bucket: requireBucketName(),
      Key: storageKeys.studySetBody(sub, studySetId),
      Body: json,
      ContentType: 'application/json',
    }),
  );
}

const DEFAULT_DEPS: ProcessStudyDeps = {
  getStudySet: getStudySet,
  claim: claimStudySet,
  markReady: markStudySetReady,
  markFailed: markStudySetFailed,
  getNoteMarkdown: defaultGetNoteMarkdown,
  generate: generateStudyMaterial,
  putBody: defaultPutBody,
};

// ---------------------------------------------------------------------------
// Core processor
// ---------------------------------------------------------------------------

/**
 * Processes a queued study set end-to-end:
 *   1. Fetches the study set — returns 'not_found' if absent.
 *   2. Idempotency guard — if status is not 'queued', returns 'skipped'.
 *   3. Atomically claims the set — returns 'skipped' if another worker won.
 *   4. Fetches ALL source note bodies; estimates total tokens.
 *      - too_large (> HARD_CAP_TOKENS): marks 'too_large', returns 'too_large'.
 *      - direct (≤ resolveContextLimit()): single-pass generation.
 *      - map-reduce (DIRECT < est ≤ HARD_CAP): chunked map→reduce generation.
 *   5. Persists the body to S3 and marks the set ready.
 *
 * On generation failure:
 *   - Logs the real error server-side.
 *   - Stores a SANITISED error summary (error class only, no raw message).
 *   - Returns 'failed'.
 *
 * @param sub         The authenticated Cognito sub (owner of the study set).
 * @param studySetId  The ULID study set identifier.
 * @param deps        Injected I/O dependencies (defaults to real implementations).
 */
export async function processStudyGeneration(
  sub: string,
  studySetId: string,
  deps: Partial<ProcessStudyDeps> = {},
): Promise<{ outcome: 'ready' | 'failed' | 'skipped' | 'not_found' | 'too_large' }> {
  const { getStudySet: _getStudySet, claim, markReady, markFailed, getNoteMarkdown, generate, putBody } = {
    ...DEFAULT_DEPS,
    ...deps,
  };

  const studySet = await _getStudySet(sub, studySetId);
  if (!studySet) {
    return { outcome: 'not_found' };
  }

  if (studySet.status !== 'queued') {
    return { outcome: 'skipped' };
  }

  const claimed = await claim(sub, studySetId);
  if (!claimed) {
    return { outcome: 'skipped' };
  }

  try {
    // Fetch all source note bodies in parallel.
    const noteBodies = await Promise.all(
      studySet.sourceNoteIds.map(async (noteId) => ({
        noteId,
        body: await getNoteMarkdown(sub, noteId),
      })),
    );

    const est = estimateTokens(noteBodies.map((n) => n.body));
    const directLimit = resolveContextLimit();
    const bodyS3Key = storageKeys.studySetBody(sub, studySetId);

    // ── Branch: too large ────────────────────────────────────────────────────
    if (est > HARD_CAP_TOKENS) {
      await markStudySetTooLarge({ sub, studySetId });
      return { outcome: 'too_large' };
    }

    // ── Branch: direct single-pass ───────────────────────────────────────────
    if (est <= directLimit) {
      // Stitch all note bodies together with separators for clear provenance.
      let combined = noteBodies
        .map((n) => `\n---\n${n.noteId}\n---\n${n.body}`)
        .join('');

      if (combined.length > MAX_NOTE_MARKDOWN_CHARS) {
        console.warn(
          '[study-generation] combined note markdown exceeds ' + MAX_NOTE_MARKDOWN_CHARS + ' chars; truncating',
          { sub, studySetId, length: combined.length },
        );
        combined = combined.slice(0, MAX_NOTE_MARKDOWN_CHARS);
      }

      const result = await generate({
        type: studySet.type,
        noteMarkdown: combined,
        noteTitle: studySet.title,
        language: studySet.language,
      });
      const withProvenance = applyProvenance(studySet.type, result.payload, studySet.sourceNoteIds);
      await putBody(sub, studySetId, JSON.stringify(withProvenance));
      await markReady({
        sub,
        studySetId,
        bodyS3Key,
        promptVersion: result.promptVersion,
        inputNoteCount: studySet.sourceNoteIds.length,
      });
      return { outcome: 'ready' };
    }

    // ── Branch: map-reduce ───────────────────────────────────────────────────
    const chunks = chunkNotes(noteBodies, directLimit);

    // MAP phase: process each chunk sequentially to respect Bedrock throttling.
    const rawCandidates: RawCandidate[] = [];
    for (const chunk of chunks) {
      const r = await generate({
        type: studySet.type,
        noteMarkdown: chunk.body,
        noteTitle: studySet.title,
        language: studySet.language,
        phase: 'map',
        maxTokensOverride: 2048,
      });

      // Guard: map payload must be an array; skip if not.
      const items = Array.isArray(r.payload) ? r.payload : [];
      for (const item of items as Array<{ text?: string; detail?: string }>) {
        if (typeof item.text === 'string') {
          rawCandidates.push({
            text: item.text,
            detail: item.detail,
            sourceNoteIds: chunk.noteIds,
          });
        }
      }
    }

    // Deduplicate across chunks.
    const deduped = deduplicateCandidates(rawCandidates, (c) => c.text);

    // REDUCE phase: synthesise into the final payload.
    const reduced = await generate({
      type: studySet.type,
      noteMarkdown: '',
      noteTitle: studySet.title,
      language: studySet.language,
      phase: 'reduce',
      candidates: deduped,
    });

    const reducedWithProvenance = applyProvenance(studySet.type, reduced.payload, studySet.sourceNoteIds);
    await putBody(sub, studySetId, JSON.stringify(reducedWithProvenance));
    await markReady({
      sub,
      studySetId,
      bodyS3Key,
      promptVersion: reduced.promptVersion,
      mapReduce: true,
      chunkCount: chunks.length,
      inputNoteCount: studySet.sourceNoteIds.length,
    });
    return { outcome: 'ready' };
  } catch (err) {
    // Log the REAL error server-side (CloudWatch), but never expose it.
    console.error('[study-generation] generation failed', err);

    const sanitised =
      err instanceof Error && err.name && err.name !== 'Error'
        ? `${err.name}: generation failed`
        : 'generation failed';

    try {
      await markFailed({ sub, studySetId, error: sanitised });
    } catch (statusErr) {
      console.error('[study-generation] failed to mark study set failed', statusErr);
    }

    return { outcome: 'failed' };
  }
}

// ---------------------------------------------------------------------------
// Lambda handler — DynamoDB stream consumer
// ---------------------------------------------------------------------------

interface StudyStreamRecord {
  eventName?: string;
  dynamodb?: { Keys?: { pk?: { S?: string }; sk?: { S?: string } } };
}

export async function handler(event: { Records?: StudyStreamRecord[] }): Promise<void> {
  loadStudyPromptsIntoEnv();
  for (const record of event.Records ?? []) {
    if (record.eventName !== 'INSERT') continue;
    const pk = record.dynamodb?.Keys?.pk?.S;
    const sk = record.dynamodb?.Keys?.sk?.S;
    if (!pk || !sk || !sk.startsWith('STUDYSET#')) continue;
    const sub = pk.replace(/^USER#/, '');
    const { studySetId } = studySetKeys.parseStudySetSk(sk);
    try {
      await processStudyGeneration(sub, studySetId);
    } catch (err) {
      console.error('[study-generation] handler record failed', err);
    }
  }
}
