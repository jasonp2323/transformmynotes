import { NextResponse } from 'next/server';

import { getAuthenticatedSub } from '@/lib/require-api-user';
import {
  listRecentNotes,
  listNoteIdsByToken,
  batchGetNotes,
  tokenise,
  type NoteItem,
} from '@transformmynotes/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

function toNoteMetadata(n: NoteItem) {
  return {
    noteId: n.noteId,
    title: n.title,
    tags: n.tags,
    status: n.status,
    words: n.words,
    highlights: n.highlights,
    langPair: n.langPair,
    ocrConfidence: n.ocrConfidence,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    ...(n.groupId !== undefined ? { groupId: n.groupId } : {}),
  };
}

// ---------------------------------------------------------------------------
// GET /api/notes
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const sub = await getAuthenticatedSub();
  if (!sub) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';

  try {
    // ------------------------------------------------------------------
    // No-query path — return the 20 most-recent notes
    // ------------------------------------------------------------------
    if (q === '') {
      const notes = await listRecentNotes(sub);
      return NextResponse.json({ notes: notes.map(toNoteMetadata) });
    }

    // ------------------------------------------------------------------
    // Search path
    // ------------------------------------------------------------------
    const rawTerms = q.split(/\s+/);
    const searchTokens = rawTerms.flatMap((rawTerm) => tokenise(rawTerm));
    const uniqueTerms = [...new Set(searchTokens)];

    if (uniqueTerms.length === 0) {
      return NextResponse.json({ notes: [] });
    }

    // Union of all note ids across every token
    const ids = new Set<string>();
    for (const term of uniqueTerms) {
      const items = await listNoteIdsByToken(sub, term);
      for (const item of items) {
        ids.add(item.noteId);
      }
    }

    if (ids.size === 0) {
      return NextResponse.json({ notes: [] });
    }

    const found = await batchGetNotes(sub, [...ids]);

    // Sort by updatedAt descending (ISO strings compare lexicographically)
    const sorted = [...found].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

    // Title-prefix boost: notes whose title starts with any search term come first
    const boosted: NoteItem[] = [];
    const rest: NoteItem[] = [];
    for (const note of sorted) {
      const lower = note.title.toLowerCase();
      if (uniqueTerms.some((t) => lower.startsWith(t))) {
        boosted.push(note);
      } else {
        rest.push(note);
      }
    }
    const ranked = [...boosted, ...rest].slice(0, 20);

    return NextResponse.json({ notes: ranked.map(toNoteMetadata) });
  } catch (err) {
    console.error('[notes/get]', err);
    return NextResponse.json({ ok: false, error: 'Could not list notes.' }, { status: 500 });
  }
}
