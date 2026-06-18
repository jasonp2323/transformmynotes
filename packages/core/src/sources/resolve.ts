import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { storageKeys } from '../db/keys.js';
import { getNote } from '../db/notes.js';
import { getSource } from '../db/sources.js';

export type SourceRef = { type: 'note'; id: string } | { type: 'document'; id: string };

export interface ResolvedSource {
  text: string;
  provenanceLabel: string;
}

/**
 * Resolves the text content and provenance label for a source reference.
 *
 * - `type: 'note'`: reads the note's Markdown body from S3 via `storageKeys.noteMarkdown`.
 *   Throws if the note does not exist.
 * - `type: 'document'`: reads the extracted text from S3 via the source's
 *   `extractedTextS3Key`. Throws if the source does not exist, is not 'ready', or
 *   has no extractedTextS3Key.
 *
 * S3 bucket is read from `SST_RESOURCE_NotesBucket_name` — throws loudly if unset.
 */
export async function resolveSourceText(sub: string, ref: SourceRef): Promise<ResolvedSource> {
  const bucket = process.env.SST_RESOURCE_NotesBucket_name;
  if (!bucket) {
    throw new Error('Missing required env var SST_RESOURCE_NotesBucket_name');
  }

  const s3 = new S3Client({});

  if (ref.type === 'note') {
    const note = await getNote(sub, ref.id);
    if (!note) {
      throw new Error(`resolveSourceText: note not found (sub=${sub}, noteId=${ref.id})`);
    }
    const response = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: storageKeys.noteMarkdown(sub, ref.id) }),
    );
    const text = await response.Body!.transformToString();
    return { text, provenanceLabel: note.title };
  }

  // type === 'document'
  const source = await getSource(sub, ref.id);
  if (!source) {
    throw new Error(`resolveSourceText: source not found (sub=${sub}, sourceId=${ref.id})`);
  }
  if (source.status !== 'ready') {
    throw new Error(
      `resolveSourceText: source is not ready (sub=${sub}, sourceId=${ref.id}, status=${source.status})`,
    );
  }
  if (!source.extractedTextS3Key) {
    throw new Error(
      `resolveSourceText: source has no extractedTextS3Key (sub=${sub}, sourceId=${ref.id})`,
    );
  }
  const response = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: source.extractedTextS3Key }),
  );
  const text = await response.Body!.transformToString();
  return { text, provenanceLabel: source.title };
}
