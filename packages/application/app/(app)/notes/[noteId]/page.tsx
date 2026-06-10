import { redirect, notFound } from 'next/navigation';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getNote, storageKeys } from '@transformmynotes/core';
import { getAuthenticatedSub } from '@/lib/require-api-user';
import { NoteViewScreen } from '@/src/components/note/NoteViewScreen';

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

export async function generateMetadata({ params }: { params: Promise<{ noteId: string }> }) {
  try {
    const { noteId } = await params;
    const sub = await getAuthenticatedSub();
    if (!sub) return { title: 'Note' };
    const note = await getNote(sub, noteId);
    return { title: note?.title ?? 'Note' };
  } catch {
    return { title: 'Note' };
  }
}

export default async function NoteViewPage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  const { noteId } = await params;

  const sub = await getAuthenticatedSub();
  if (!sub) {
    redirect('/login');
  }

  const note = await getNote(sub, noteId);
  if (!note) {
    notFound();
  }

  const bucket = requireBucketName();
  const s3 = new S3Client({});

  // Read markdown body from S3 using the note's stored key
  let markdown: string;
  try {
    const getResponse = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: note.bodyS3Key,
      }),
    );
    markdown = await getResponse.Body!.transformToString();
  } catch (err: unknown) {
    const code = (err as { name?: string; Code?: string }).name ?? (err as { Code?: string }).Code;
    if (code === 'NoSuchKey' || code === 'NotFound') {
      // Fall back to deriving the key if the stored one somehow doesn't exist
      try {
        const fallbackResponse = await s3.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: storageKeys.noteMarkdown(sub, noteId),
          }),
        );
        markdown = await fallbackResponse.Body!.transformToString();
      } catch {
        notFound();
      }
    } else {
      throw err;
    }
  }

  // Presign the original image URL (15 minutes)
  let imageUrl: string | null = null;
  try {
    imageUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: bucket,
        Key: note.originalImageS3Key,
      }),
      { expiresIn: 900 },
    );
  } catch {
    // Image unavailable — render without it
    imageUrl = null;
  }

  return (
    <NoteViewScreen
      noteId={noteId}
      title={note.title}
      initialMarkdown={markdown!}
      tags={note.tags}
      words={note.words}
      langPair={note.langPair}
      ocrConfidence={note.ocrConfidence}
      originalImageUrl={imageUrl}
    />
  );
}
