import { NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getStudySet, deleteStudySet, batchGetNotes, type StudySetItem } from '@transformmynotes/core';
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

function toStudySetMeta(s: StudySetItem) {
  return {
    studySetId: s.studySetId,
    sourceNoteIds: s.sourceNoteIds,
    type: s.type,
    title: s.title,
    status: s.status,
    language: s.language,
    model: s.model,
    promptVersion: s.promptVersion,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    ...(s.error ? { error: s.error } : {}),
    ...(s.completed !== undefined ? { completed: s.completed } : {}),
  };
}

export async function GET(
  _req: Request,
  { params }: { params: { studySetId: string } },
) {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { studySetId } = params;
  if (!studySetId) {
    return NextResponse.json({ ok: false, error: 'Missing studySetId.' }, { status: 400 });
  }

  try {
    const item = await getStudySet(sub, studySetId);
    if (!item) {
      return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
    }
    let noteTitles: Record<string, string> = {};
    if (item.sourceNoteIds.length > 0) {
      const notes = await batchGetNotes(sub, item.sourceNoteIds);
      for (const note of notes) {
        noteTitles[note.noteId] = note.title;
      }
    }
    return NextResponse.json({ ...toStudySetMeta(item), noteTitles });
  } catch (err) {
    console.error('[study/get]', err);
    return NextResponse.json({ ok: false, error: 'Could not fetch study set.' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { studySetId: string } },
) {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { studySetId } = params;
  if (!studySetId) {
    return NextResponse.json({ ok: false, error: 'Missing studySetId.' }, { status: 400 });
  }

  try {
    const bucket = requireBucketName();

    const item = await getStudySet(sub, studySetId);
    if (!item) {
      return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
    }

    // Delete DynamoDB record first (source of truth).
    await deleteStudySet(sub, studySetId);

    // Best-effort: delete S3 body if present.
    if (item.bodyS3Key) {
      try {
        const s3 = new S3Client({});
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.bodyS3Key }));
      } catch (s3Err) {
        console.error('[study/delete] Could not delete body from S3', s3Err);
      }
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('[study/delete]', err);
    return NextResponse.json({ ok: false, error: 'Could not delete study set.' }, { status: 500 });
  }
}
