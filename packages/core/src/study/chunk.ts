/**
 * Note-chunking utilities for multi-note AI generation (M17).
 *
 * Splits a list of note bodies into chunks that each fit within a token budget.
 * Notes are the atomic unit — a note is never split mid-body.
 */

import { estimateTokens } from './tokenBudget.js';

/** A note body with its id. */
export interface NoteBody {
  noteId: string;
  body: string;
}

/**
 * A chunk of one or more note bodies that fits within the token limit.
 * `body` contains all notes' bodies concatenated with provenance markers.
 * `noteIds` lists the note ids in order.
 */
export interface NoteChunk {
  noteIds: string[];
  body: string;
}

/**
 * Builds the body string for a chunk from its component notes.
 *
 * Each note is prefixed with `<!-- note:<noteId> -->` so provenance is
 * preserved in the combined text. Notes are separated by `\n\n`.
 */
function buildChunkBody(notes: NoteBody[]): string {
  return notes
    .map((n) => `<!-- note:${n.noteId} -->\n${n.body}`)
    .join('\n\n');
}

/**
 * Splits a list of note bodies into chunks that each fit within `limitTokens`
 * (estimated via ~4 chars/token). Notes are the atomic unit — a note is
 * appended whole to the current chunk if it fits, otherwise a new chunk starts.
 *
 * A note whose own body alone exceeds `limitTokens` gets its own single-note
 * chunk (it is NOT split), and a `console.warn` is logged for it.
 *
 * Empty input → empty array. A note with an empty body still occupies a chunk slot.
 *
 * @param notes - Ordered list of note bodies to chunk.
 * @param limitTokens - Maximum estimated tokens per chunk.
 * @returns Array of chunks in input order.
 */
export function chunkNotes(notes: NoteBody[], limitTokens: number): NoteChunk[] {
  if (notes.length === 0) return [];

  const result: NoteChunk[] = [];

  // Current in-flight chunk (accumulates notes until the limit is hit)
  let currentNotes: NoteBody[] = [];
  // Running token estimate for the current chunk's combined body
  let currentTokens = 0;

  /**
   * Flush the current in-flight chunk into `result` (if non-empty).
   */
  function flushCurrent(): void {
    if (currentNotes.length === 0) return;
    result.push({
      noteIds: currentNotes.map((n) => n.noteId),
      body: buildChunkBody(currentNotes),
    });
    currentNotes = [];
    currentTokens = 0;
  }

  for (const note of notes) {
    const noteTokens = estimateTokens([note.body]);

    if (noteTokens > limitTokens) {
      // Note alone exceeds limit: flush the current chunk, then emit this note
      // in its own chunk with a warning.
      flushCurrent();
      console.warn(
        `[chunkNotes] note ${note.noteId} body (${noteTokens} tokens) exceeds limit ${limitTokens}; placed in its own chunk`,
      );
      result.push({
        noteIds: [note.noteId],
        body: buildChunkBody([note]),
      });
      continue;
    }

    // Check if adding this note to the current chunk would exceed the limit.
    // Re-estimate the combined body rather than summing individual estimates, so
    // the separator text is included in the token count.
    const prospectiveNotes = [...currentNotes, note];
    const prospectiveTokens = estimateTokens([buildChunkBody(prospectiveNotes)]);

    if (currentNotes.length > 0 && prospectiveTokens > limitTokens) {
      // Adding this note would overflow the current chunk: flush and start fresh.
      flushCurrent();
    }

    currentNotes.push(note);
    currentTokens = estimateTokens([buildChunkBody(currentNotes)]);
  }

  // Flush any remaining notes.
  flushCurrent();

  return result;
}
