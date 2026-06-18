import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ulid } from 'ulid';
import { z } from 'zod';
import {
  assertUrlSafe,
  safeFetch,
  extractArticle,
  UrlSafetyError,
  buildSourceItem,
  putSource,
  markSourceReady,
  markSourceFailed,
  findSourceByUrlHash,
  hitSourceFetchWindow,
  hitSourceDailyCap,
  storageKeys,
  utcDateString,
  nextMidnightUtcEpochSeconds,
} from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

const bodySchema = z.object({
  url: z.string().trim().min(1).max(2048),
});

export async function POST(req: Request) {
  // 1. Auth: verify the Cognito ID token and extract the sub.
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse JSON body.
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }
  const { url } = parsed.data;

  // 3. SSRF safety check.
  try {
    await assertUrlSafe(url);
  } catch (e) {
    if (e instanceof UrlSafetyError) {
      return NextResponse.json({ ok: false, error: 'blocked_url' }, { status: 400 });
    }
    throw e;
  }

  const now = Date.now();

  // 4. Window rate limit (per-user, 60-second window, threshold 10).
  if (process.env.RATE_LIMIT_DISABLED !== '1') {
    const windowSeconds = 60;
    const windowStart = Math.floor(now / 1000 / windowSeconds) * windowSeconds;
    const { count } = await hitSourceFetchWindow({ sub, windowStart, windowSeconds });
    if (count > 10) {
      const retryAfterSeconds = Math.max(1, windowStart + windowSeconds - Math.floor(now / 1000));
      return NextResponse.json(
        { ok: false, error: 'Rate limit exceeded.' },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSeconds) },
        },
      );
    }
  }

  // 5. Daily cap (per-user, max 50 per UTC day).
  if (process.env.RATE_LIMIT_DISABLED !== '1') {
    const dateUtc = utcDateString(now);
    const ttl = nextMidnightUtcEpochSeconds(now);
    const { count: dayCount } = await hitSourceDailyCap({ sub, dateUtc, ttlEpochSeconds: ttl });
    if (dayCount > 50) {
      const retryAfterSeconds = Math.max(1, ttl - Math.floor(now / 1000));
      return NextResponse.json(
        { ok: false, error: 'Rate limit exceeded.' },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSeconds) },
        },
      );
    }
  }

  // 6. Dedup: check if we've already fetched this URL (for this user).
  const urlHash = createHash('sha256').update(url).digest('hex');
  const existing = await findSourceByUrlHash(sub, urlHash);
  if (existing && existing.status === 'ready') {
    return NextResponse.json({ sourceId: existing.sourceId, status: 'ready', title: existing.title, deduplicated: true });
  }

  // 7. Write interim SOURCE# item (status='extracting').
  const sourceId = ulid();
  const textKey = storageKeys.sourceText(sub, sourceId);
  const fetchedAt = new Date().toISOString();

  await putSource(
    buildSourceItem({
      sub,
      sourceId,
      type: 'web',
      title: 'Fetching…',
      status: 'extracting',
      originalFormat: 'md',
      originalS3Key: textKey,
      extractedTextS3Key: textKey,
      byteSize: 0,
      sourceUrl: url,
      urlHash,
      fetchedAt,
      fetchedBy: sub,
      createdAt: fetchedAt,
    }),
  );

  // 8. Fetch + extract + store.
  try {
    const bucket = requireBucketName();
    const { body } = await safeFetch(url);
    const article = extractArticle(body, url);

    const s3 = new S3Client({});
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: textKey,
        ContentType: 'text/markdown',
        Body: article.markdown,
      }),
    );

    const byteSize = Buffer.byteLength(article.markdown, 'utf-8');

    await markSourceReady({
      sub,
      sourceId,
      extractedTextS3Key: textKey,
      wordCount: article.wordCount,
      title: article.title,
      byteSize,
    });

    return NextResponse.json({ sourceId, status: 'ready', title: article.title });
  } catch (err) {
    await markSourceFailed({ sub, sourceId, error: String(err) }).catch(() => {});

    if (err instanceof UrlSafetyError) {
      return NextResponse.json({ ok: false, error: 'blocked_url' }, { status: 400 });
    }

    console.error('[sources/from-url] Unexpected error fetching/extracting URL', err);
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
