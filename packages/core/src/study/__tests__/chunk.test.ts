import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chunkNotes } from '../chunk.js';
import type { NoteBody } from '../chunk.js';

// ─── Token math notes ─────────────────────────────────────────────────────────
//
// estimateTokens uses Math.round(totalChars / 4).
// chunkNotes estimates token count for the combined chunk body, which includes
// per-note markers "<!-- note:<id> -->\n" and "\n\n" separators.
//
// Marker overhead for a note with id "nX" (2 chars):
//   "<!-- note:nX -->\n" = 18 chars → 4-5 tokens
//
// To keep math simple we use a limit of 100 tokens = 400 chars, and craft note
// bodies so that:
//  - Notes n1 and n4 have short bodies (< 50 chars each) → fit together
//  - Notes n2 and n3 have short bodies that fit together but not with n1
//  - Note n5 has a body > 400 chars → exceeds the limit on its own
//
// The chunkNotes implementation re-estimates the combined body (including the
// marker "<!-- note:<id> -->\n" prefix and "\n\n" separator), so we need to be
// careful. Let's use a generous limit so packing is clear and predictable.
//
// Strategy: use limitTokens=50 (≈200 chars budget for combined body).
//  - n1 body: 20 chars of 'a'  → marker "<!-- note:n1 -->\n" (18) + 20 = 38 chars alone
//  - n2 body: 20 chars of 'b'  → 38 chars alone
//  - Together n1+n2: "<!-- note:n1 -->\na...a\n\n<!-- note:n2 -->\nb...b"
//      = 38 + 2 + 38 = 78 chars → Math.round(78/4) = 20 tokens ✓ (fits in 50)
//  - n3 body: 20 chars of 'c'  → 38 chars alone
//  - n1+n2+n3: 38 + 2 + 38 + 2 + 38 = 118 chars → Math.round(118/4) = 30 tokens ✓ (fits in 50)
//  - n4 body: 60 chars of 'd'  → marker (18) + 60 = 78 chars alone → 20 tokens
//  - n1+n2+n3+n4: 38 + 2 + 38 + 2 + 38 + 2 + 78 = 198 chars → Math.round(198/4) = 50 tokens
//    50 <= 50 so fits exactly ✓
//  - n5 body: 300 chars of 'e' → alone: marker(18) + 300 = 318 chars → Math.round(318/4) = 80 tokens > 50 → own chunk + warn
//
// With this layout and limitTokens=50:
//   Chunk 1: n1, n2, n3, n4 all fit (combined 50 tokens)
//   Chunk 2: n5 alone (too big, triggers warn)
//
// Wait — that puts all fitting notes into ONE chunk. We need n2 and n3 to share
// a chunk separately from n1. Let's redesign:
//
// Use limitTokens=30 (≈120 chars budget):
//  - n1 body: 60 chars → alone: "<!-- note:n1 -->\n" + 60 = 78 chars → 20 tokens
//  - n2 body: 20 chars → alone: 38 chars → 10 tokens
//  - n3 body: 20 chars → alone: 38 chars → 10 tokens
//  - n4 body: 60 chars → alone: 78 chars → 20 tokens
//  - n5 body: 200 chars → alone: 218 chars → Math.round(218/4)=55 tokens > 30 → own chunk
//
//  Iteration:
//    Start: currentNotes=[], currentTokens=0
//    n1: noteTokens=20, prospective=[n1] → 78 chars → 20 tokens ≤ 30 → add. currentNotes=[n1], currentTokens=20
//    n2: noteTokens=10, prospective=[n1,n2] → "<!-- note:n1 -->\n{60a}\n\n<!-- note:n2 -->\n{20b}"
//        = 78 + 2 + 38 = 118 chars → Math.round(118/4)=30 tokens ≤ 30 → add. currentNotes=[n1,n2], currentTokens=30
//    n3: noteTokens=10, prospective=[n1,n2,n3] → 118 + 2 + 38 = 158 chars → Math.round(158/4)=40 > 30 → flush, start new.
//        flush → chunk1=[n1,n2]. currentNotes=[n3], currentTokens=10
//    n4: noteTokens=20, prospective=[n3,n4] → 38 + 2 + 78 = 118 chars → 30 tokens ≤ 30 → add. currentNotes=[n3,n4], currentTokens=30
//    n5: noteTokens=55 > 30 → flush chunk2=[n3,n4], emit n5 as own chunk + warn.
//    end: currentNotes=[] → nothing to flush.
//    Result: chunk1=[n1,n2], chunk2=[n3,n4], chunk3=[n5]
//
// That gives us: notes n2+n3 NOT in the same chunk — let me re-read the requirement:
// "design it so notes 2 and 3 share a chunk". Let me adjust:
//
// Use 5 notes where specifically notes 2 and 3 go together.
// Design: n1 alone, n2+n3 together, n4 alone, n5 oversized.
//
// With limitTokens=30:
//  - n1 body: 100 chars → alone: 118/4=30 tokens → fits alone (prospective=30)
//    After adding n1: currentNotes=[n1], currentTokens=30
//  - n2 body: 20 chars → prospective=[n1,n2] → 118+2+38=158 → 40 > 30 → flush chunk1=[n1], start [n2]
//    currentNotes=[n2], currentTokens=10
//  - n3 body: 20 chars → prospective=[n2,n3] → 38+2+38=78 → 20 ≤ 30 → add.
//    currentNotes=[n2,n3], currentTokens=20
//  - n4 body: 60 chars → prospective=[n2,n3,n4] → 78+2+78=158 → 40 > 30 → flush chunk2=[n2,n3], start [n4].
//    currentNotes=[n4], currentTokens=20
//  - n5 body: 200 chars → noteTokens=55 > 30 → flush chunk3=[n4], emit n5 as own chunk + warn.
//  Result: chunk1=[n1], chunk2=[n2,n3], chunk3=[n4], chunk4=[n5]  ✓
//
// Let's verify the exact char counts:
//   n1: id="n1" → marker="<!-- note:n1 -->\n" = 18 chars, body=100 chars → alone=118 chars → 118/4=29.5 → round=30 ✓
//   n2: id="n2" → marker=18 chars, body=20 chars → alone=38 chars → 38/4=9.5 → round=10
//   n3: id="n3" → marker=18 chars, body=20 chars → alone=38 chars → 10
//   n2+n3 combined: "<!-- note:n2 -->\n{20b}\n\n<!-- note:n3 -->\n{20c}" = 38+2+38=78 → 78/4=19.5 → round=20 ✓
//   n4: id="n4" → alone: 18+60=78 → 78/4=19.5 → round=20
//   n5: id="n5" → alone: 18+200=218 → 218/4=54.5 → round=55 > 30 ✓

const LIMIT = 30; // tokens

// Bodies crafted for the math above:
const NOTES: NoteBody[] = [
  { noteId: 'n1', body: 'a'.repeat(100) }, // 30 tokens alone → solo chunk
  { noteId: 'n2', body: 'b'.repeat(20)  }, // 10 tokens → fits with n3 (20 total)
  { noteId: 'n3', body: 'c'.repeat(20)  }, // 10 tokens → fits with n2 (20 total)
  { noteId: 'n4', body: 'd'.repeat(60)  }, // 20 tokens alone → solo chunk
  { noteId: 'n5', body: 'e'.repeat(200) }, // 55 tokens → oversized → own chunk + warn
];

describe('chunkNotes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array for empty input', () => {
    expect(chunkNotes([], LIMIT)).toEqual([]);
  });

  it('produces the expected 4 chunks from the 5-note fixture', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chunks = chunkNotes(NOTES, LIMIT);

    // chunk1: n1 alone (fills limit exactly at 30 tokens)
    expect(chunks[0].noteIds).toEqual(['n1']);

    // chunk2: n2 and n3 share a chunk (20 tokens combined)
    expect(chunks[1].noteIds).toEqual(['n2', 'n3']);

    // chunk3: n4 alone
    expect(chunks[2].noteIds).toEqual(['n4']);

    // chunk4: n5 alone (oversized)
    expect(chunks[3].noteIds).toEqual(['n5']);

    expect(chunks).toHaveLength(4);
    warnSpy.mockRestore();
  });

  it('notes n2 and n3 share a chunk', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chunks = chunkNotes(NOTES, LIMIT);
    const n2n3Chunk = chunks.find(
      (c) => c.noteIds.includes('n2') && c.noteIds.includes('n3'),
    );
    expect(n2n3Chunk).toBeDefined();
    warnSpy.mockRestore();
  });

  it('an oversized note gets its own chunk and triggers console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chunks = chunkNotes(NOTES, LIMIT);

    // n5 must be in its own single-note chunk
    const n5Chunk = chunks.find((c) => c.noteIds.includes('n5'));
    expect(n5Chunk).toBeDefined();
    expect(n5Chunk!.noteIds).toEqual(['n5']);

    // console.warn must have been called for n5
    expect(warnSpy).toHaveBeenCalled();
    const call = warnSpy.mock.calls.find((args) =>
      String(args[0]).includes('n5'),
    );
    expect(call).toBeDefined();

    warnSpy.mockRestore();
  });

  it('chunk body contains the note marker and body text', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chunks = chunkNotes(NOTES, LIMIT);
    // chunk1 contains n1's body prefixed with its marker
    expect(chunks[0].body).toContain('<!-- note:n1 -->');
    expect(chunks[0].body).toContain('a'.repeat(100));
    warnSpy.mockRestore();
  });

  it('chunk body for a multi-note chunk contains both markers', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chunks = chunkNotes(NOTES, LIMIT);
    const n2n3 = chunks.find((c) => c.noteIds.includes('n2') && c.noteIds.includes('n3'))!;
    expect(n2n3.body).toContain('<!-- note:n2 -->');
    expect(n2n3.body).toContain('<!-- note:n3 -->');
    warnSpy.mockRestore();
  });

  it('a note with an empty body still occupies a chunk slot', () => {
    const result = chunkNotes([{ noteId: 'empty', body: '' }], LIMIT);
    expect(result).toHaveLength(1);
    expect(result[0].noteIds).toEqual(['empty']);
  });

  it('single note that fits is returned as one chunk', () => {
    const result = chunkNotes([{ noteId: 'solo', body: 'Hello world' }], LIMIT);
    expect(result).toHaveLength(1);
    expect(result[0].noteIds).toEqual(['solo']);
  });
});
