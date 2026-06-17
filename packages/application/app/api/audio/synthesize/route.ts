import { NextResponse } from 'next/server';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ddb,
  TableNames,
  audioKeys,
  storageKeys,
  audioHash,
  synthesizeSpeech,
  resolveAiConfig,
} from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Allowed pt-BR Polly voices. NOTE: these are the actual AWS Polly `VoiceId`
 * values — `Vitoria` has NO accent. The M18.md spec wrote `Vitória`, but Polly's
 * VoiceId enum is unaccented; passing the accented form is a hard 400 from AWS.
 */
const ALLOWED_VOICES = ['Camila', 'Vitoria', 'Thiago'] as const;
/** Allowed SSML `<prosody rate>` values the client may request. */
const ALLOWED_RATES = ['slow', 'medium', 'fast'] as const;

/** Max characters per single synthesis request (Polly is charged per character). */
const MAX_TEXT_LENGTH = 1000;
/** Per-user daily character cap (approximate — see daily-cap note below). */
const DAILY_CHAR_CAP = 50_000;
/** Presigned GetObject URL TTL: 15 minutes. */
const PRESIGN_TTL_SECONDS = 900;

function requireBucketName(): string {
  const value = process.env.SST_RESOURCE_NotesBucket_name;
  if (!value) {
    throw new Error(
      'Missing required env var SST_RESOURCE_NotesBucket_name: the S3 bucket name is not bound. ' +
        'Expected it from the SST resource link (production) or the test harness.',
    );
  }
  return value;
}

interface AudioPointerItem {
  charCount?: number;
  createdAt?: string;
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

  const { text, voiceId, ssmlRate } = (body ?? {}) as Record<string, unknown>;

  // Validate text.
  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid text.' },
      { status: 400 },
    );
  }
  const trimmedText = text.trim();
  if (trimmedText.length > MAX_TEXT_LENGTH) {
    // Exact message: M18.3.2 surfaces this as a user-visible toast.
    return NextResponse.json(
      { ok: false, error: 'Text too long to play.' },
      { status: 400 },
    );
  }

  // Validate optional voiceId.
  if (voiceId !== undefined) {
    if (typeof voiceId !== 'string' || !(ALLOWED_VOICES as readonly string[]).includes(voiceId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid voiceId.' },
        { status: 400 },
      );
    }
  }

  // Validate optional ssmlRate.
  if (ssmlRate !== undefined) {
    if (typeof ssmlRate !== 'string' || !(ALLOWED_RATES as readonly string[]).includes(ssmlRate)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid ssmlRate.' },
        { status: 400 },
      );
    }
  }
  const effectiveSsmlRate = ssmlRate as string | undefined;

  try {
    const bucket = requireBucketName();

    // Resolve runtime AI config — fails loudly if Polly voice/engine unset.
    const config = await resolveAiConfig();
    const engine = config.pollyEngine;
    const effectiveVoiceId = (voiceId as string | undefined) ?? config.pollyVoiceId;

    // ── Daily character cap ──────────────────────────────────────────────────
    // Approximation per M18.md: sum charCount over the user's AUDIO# pointer
    // items created today (UTC). Eventually consistent — two concurrent requests
    // can both pass before either pointer is written, exceeding the cap by at
    // most one request. Accepted for M18. The check runs BEFORE any Polly call.
    const todayPrefix = new Date().toISOString().slice(0, 10);
    let usedToday = 0;
    let lastKey: Record<string, unknown> | undefined;
    do {
      const page = await ddb.send(
        new QueryCommand({
          TableName: TableNames.UserData,
          ...audioKeys.userAudioQuery(sub),
          ExclusiveStartKey: lastKey,
        }),
      );
      for (const raw of page.Items ?? []) {
        const item = raw as AudioPointerItem;
        if (typeof item.createdAt === 'string' && item.createdAt.startsWith(todayPrefix)) {
          usedToday += item.charCount ?? 0;
        }
      }
      lastKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);

    if (usedToday + trimmedText.length > DAILY_CHAR_CAP) {
      return NextResponse.json(
        { ok: false, error: 'daily_limit_reached' },
        { status: 429 },
      );
    }

    // ── Cache lookup ─────────────────────────────────────────────────────────
    const hash = audioHash(trimmedText, effectiveVoiceId, engine, effectiveSsmlRate);
    const pointerKey = audioKeys.pointer(sub, hash);
    const s3Key = storageKeys.audioMp3(sub, hash);

    const existing = await ddb.send(
      new GetCommand({ TableName: TableNames.UserData, Key: pointerKey }),
    );
    const cached = Boolean(existing.Item);

    const s3 = new S3Client({});

    if (!cached) {
      // Cache miss: synthesize, store the MP3 in S3, and write the pointer item.
      const { audioBytes } = await synthesizeSpeech(
        trimmedText,
        effectiveVoiceId,
        engine,
        effectiveSsmlRate,
      );

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          ContentType: 'audio/mpeg',
          Body: audioBytes,
        }),
      );

      await ddb.send(
        new PutCommand({
          TableName: TableNames.UserData,
          Item: {
            ...pointerKey,
            hash,
            s3Key,
            voiceId: effectiveVoiceId,
            engine,
            charCount: trimmedText.length,
            ...(effectiveSsmlRate ? { ssmlRate: effectiveSsmlRate } : {}),
            createdAt: new Date().toISOString(),
          },
        }),
      );
    }

    // Presign a GetObject URL for the cached or freshly-written MP3.
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );

    return NextResponse.json({
      ok: true,
      url,
      cached,
      charCount: trimmedText.length,
    });
  } catch (err) {
    console.error('[audio/synthesize] Unexpected error synthesizing audio', err);
    return NextResponse.json(
      { ok: false, error: 'Could not synthesize audio. Please try again.' },
      { status: 500 },
    );
  }
}
