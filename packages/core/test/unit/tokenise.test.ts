import { describe, it, expect } from 'vitest';
import { STOP_WORDS, tokenise, diffTokens } from '../../src/search/tokenise';
import type { TokenDiff } from '../../src/search/tokenise';

// ---------------------------------------------------------------------------
// STOP_WORDS
// ---------------------------------------------------------------------------

describe('STOP_WORDS', () => {
  it('is exported as a Set', () => {
    expect(STOP_WORDS).toBeInstanceOf(Set);
  });

  it('contains a known English stop-word ("the")', () => {
    expect(STOP_WORDS.has('the')).toBe(true);
  });

  it('contains a known English stop-word ("and")', () => {
    expect(STOP_WORDS.has('and')).toBe(true);
  });

  it('contains a known Spanish stop-word ("que")', () => {
    expect(STOP_WORDS.has('que')).toBe(true);
  });

  it('contains a known Spanish stop-word ("de")', () => {
    expect(STOP_WORDS.has('de')).toBe(true);
  });

  it('has at least 80 entries (compact ~100-word set)', () => {
    expect(STOP_WORDS.size).toBeGreaterThanOrEqual(80);
  });

  it('all entries are lowercase strings', () => {
    for (const word of STOP_WORDS) {
      expect(word).toBe(word.toLowerCase());
    }
  });
});

// ---------------------------------------------------------------------------
// tokenise
// ---------------------------------------------------------------------------

describe('tokenise', () => {
  // ── Null / empty input ───────────────────────────────────────────────────

  it('returns [] for an empty string', () => {
    expect(tokenise('')).toEqual([]);
  });

  it('returns [] for null', () => {
    expect(tokenise(null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(tokenise(undefined)).toEqual([]);
  });

  it('returns [] for a whitespace-only string', () => {
    expect(tokenise('   \t\n  ')).toEqual([]);
  });

  // ── Lowercasing ──────────────────────────────────────────────────────────

  it('lowercases all tokens', () => {
    const result = tokenise('Hello World');
    expect(result).toContain('hello');
    expect(result).toContain('world');
    result.forEach((t) => expect(t).toBe(t.toLowerCase()));
  });

  it('lowercases tokens with mixed case', () => {
    const result = tokenise('JavaScript TypeScript');
    expect(result).toContain('javascript');
    expect(result).toContain('typescript');
  });

  // ── Punctuation stripping ────────────────────────────────────────────────

  it('splits on comma+space — "Hello, world!" → ["hello","world"]', () => {
    expect(tokenise('Hello, world!')).toEqual(['hello', 'world']);
  });

  it('strips leading and trailing punctuation', () => {
    expect(tokenise('...notes...')).toEqual(['notes']);
  });

  it('handles multiple consecutive punctuation characters as one separator', () => {
    const result = tokenise('one---two');
    expect(result).toContain('one');
    expect(result).toContain('two');
    expect(result).not.toContain('---');
  });

  it('treats newline and tab as separators', () => {
    const result = tokenise('line1\nline2\ttab3');
    expect(result).toContain('line1');
    expect(result).toContain('line2');
    expect(result).toContain('tab3');
  });

  it('treats forward slash as a separator', () => {
    const result = tokenise('path/to/file');
    expect(result).toContain('path');
    expect(result).toContain('file');
  });

  // ── Stop-word removal ────────────────────────────────────────────────────

  it('removes common English stop-words', () => {
    const result = tokenise('the quick brown fox');
    expect(result).not.toContain('the');
    expect(result).toContain('quick');
    expect(result).toContain('brown');
    expect(result).toContain('fox');
  });

  it('removes common Spanish stop-words', () => {
    const result = tokenise('el zorro rápido de la montaña');
    expect(result).not.toContain('el');
    expect(result).not.toContain('de');
    expect(result).not.toContain('la');
    expect(result).toContain('zorro');
    expect(result).toContain('montaña');
  });

  it('removes "and", "or", "but", "if" from a sentence', () => {
    const result = tokenise('cats and dogs or fish but not birds if any');
    expect(result).not.toContain('and');
    expect(result).not.toContain('or');
    expect(result).not.toContain('but');
    expect(result).not.toContain('if');
    expect(result).not.toContain('not');
    expect(result).not.toContain('any');
    expect(result).toContain('cats');
    expect(result).toContain('dogs');
    expect(result).toContain('fish');
    expect(result).toContain('birds');
  });

  // ── Short-token removal (length < 2) ─────────────────────────────────────

  it('removes single-character tokens', () => {
    const result = tokenise('a b c dog');
    expect(result).not.toContain('b');
    expect(result).not.toContain('c');
    expect(result).toContain('dog');
  });

  it('removes single-digit numbers (length < 2)', () => {
    // Single digit "3" has length 1 → filtered out.
    // This is the defined behaviour: document it explicitly.
    const result = tokenise('chapter 3 section');
    expect(result).not.toContain('3');
    expect(result).toContain('chapter');
    expect(result).toContain('section');
  });

  it('keeps two-digit numbers', () => {
    const result = tokenise('page 42 line 10');
    expect(result).toContain('42');
    expect(result).toContain('10');
  });

  it('keeps tokens with exactly 2 characters', () => {
    // "ok" is not a stop-word and has length 2 → kept
    const result = tokenise('ok go');
    expect(result).toContain('ok');
    expect(result).toContain('go');
  });

  // ── Deduplication ────────────────────────────────────────────────────────

  it('deduplicates repeated content words, preserving first-occurrence order', () => {
    const result = tokenise('apple banana apple cherry banana');
    expect(result).toEqual(['apple', 'banana', 'cherry']);
  });

  it('deduplicates case-insensitively (lowercased before dedup)', () => {
    const result = tokenise('Apple apple APPLE');
    expect(result).toEqual(['apple']);
  });

  // ── Unicode / accented characters ────────────────────────────────────────

  it('preserves an accented Spanish word as a single token — canción', () => {
    const result = tokenise('canción bonita');
    // "canción" should not be split mid-word
    expect(result).toContain('canción');
    // "bonita" should also survive
    expect(result).toContain('bonita');
  });

  it('preserves "mañana" as a single token', () => {
    const result = tokenise('mañana temprano');
    expect(result).toContain('mañana');
    expect(result).toContain('temprano');
  });

  it('preserves accented French-style word "café"', () => {
    const result = tokenise('café au lait');
    expect(result).toContain('café');
  });

  it('does not split "niño" on the ñ character', () => {
    const result = tokenise('el niño juega');
    // "el" is a stop-word; "niño" and "juega" must survive
    expect(result).toContain('niño');
    expect(result).toContain('juega');
  });

  // ── Mixed content sentences ──────────────────────────────────────────────

  it('processes a typical English note sentence correctly', () => {
    const text = 'The mitochondria is the powerhouse of the cell';
    const result = tokenise(text);
    // "the", "is", "of" are stop-words
    expect(result).not.toContain('the');
    expect(result).not.toContain('is');
    expect(result).not.toContain('of');
    expect(result).toContain('mitochondria');
    expect(result).toContain('powerhouse');
    expect(result).toContain('cell');
  });

  it('processes a mixed English/Spanish sentence', () => {
    const text = 'El proceso de fotosíntesis is important para las plantas';
    const result = tokenise(text);
    // stop-words: el, de, is, para, las
    expect(result).not.toContain('el');
    expect(result).not.toContain('de');
    expect(result).not.toContain('is');
    expect(result).not.toContain('para');
    expect(result).not.toContain('las');
    expect(result).toContain('proceso');
    expect(result).toContain('fotosíntesis');
    expect(result).toContain('important');
    expect(result).toContain('plantas');
  });

  it('handles a sentence that is entirely stop-words → []', () => {
    expect(tokenise('the and or but if')).toEqual([]);
  });

  it('returns tokens in the order they first appear', () => {
    const result = tokenise('zebra apple mango zebra apple');
    expect(result).toEqual(['zebra', 'apple', 'mango']);
  });

  it('handles a very long repeated string without error', () => {
    const repeated = ('hello world ').repeat(500);
    const result = tokenise(repeated);
    expect(result).toEqual(['hello', 'world']);
  });
});

// ---------------------------------------------------------------------------
// diffTokens
// ---------------------------------------------------------------------------

describe('diffTokens', () => {
  // ── Type safety ──────────────────────────────────────────────────────────

  it('returns an object with toAdd and toRemove arrays', () => {
    const diff: TokenDiff = diffTokens([], []);
    expect(Array.isArray(diff.toAdd)).toBe(true);
    expect(Array.isArray(diff.toRemove)).toBe(true);
  });

  // ── Identical sets ────────────────────────────────────────────────────────

  it('returns both empty arrays when old and new are identical', () => {
    expect(diffTokens(['apple', 'banana'], ['apple', 'banana'])).toEqual({
      toAdd: [],
      toRemove: [],
    });
  });

  it('returns both empty arrays for two empty inputs', () => {
    expect(diffTokens([], [])).toEqual({ toAdd: [], toRemove: [] });
  });

  // ── Pure additions ────────────────────────────────────────────────────────

  it('detects newly added tokens (empty old set)', () => {
    const diff = diffTokens([], ['apple', 'banana']);
    expect(diff.toAdd).toEqual(['apple', 'banana']);
    expect(diff.toRemove).toEqual([]);
  });

  it('detects added tokens when old set is non-empty', () => {
    const diff = diffTokens(['apple'], ['apple', 'banana', 'cherry']);
    expect(diff.toAdd).toEqual(['banana', 'cherry']);
    expect(diff.toRemove).toEqual([]);
  });

  // ── Pure removals ─────────────────────────────────────────────────────────

  it('detects removed tokens (empty new set)', () => {
    const diff = diffTokens(['apple', 'banana'], []);
    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemove).toEqual(['apple', 'banana']);
  });

  it('detects removed tokens when new set is non-empty', () => {
    const diff = diffTokens(['apple', 'banana', 'cherry'], ['apple']);
    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemove).toEqual(['banana', 'cherry']);
  });

  // ── Mixed add + remove ────────────────────────────────────────────────────

  it('handles a mixed add-and-remove scenario', () => {
    const diff = diffTokens(['apple', 'banana'], ['banana', 'cherry']);
    expect(diff.toAdd).toEqual(['cherry']);
    expect(diff.toRemove).toEqual(['apple']);
  });

  it('handles a complete replacement', () => {
    const diff = diffTokens(['alpha', 'beta'], ['gamma', 'delta']);
    expect(diff.toAdd).toEqual(['gamma', 'delta']);
    expect(diff.toRemove).toEqual(['alpha', 'beta']);
  });

  // ── Duplicate handling ────────────────────────────────────────────────────

  it('de-duplicates oldTokens before computing the diff', () => {
    // "apple" appears twice in old — should only appear once in toRemove
    const diff = diffTokens(['apple', 'apple', 'banana'], ['banana']);
    expect(diff.toRemove).toEqual(['apple']);
  });

  it('de-duplicates newTokens before computing the diff', () => {
    // "cherry" appears twice in new — should only appear once in toAdd
    const diff = diffTokens(['apple'], ['apple', 'cherry', 'cherry']);
    expect(diff.toAdd).toEqual(['cherry']);
  });

  it('de-duplicates both sides simultaneously', () => {
    const diff = diffTokens(
      ['a', 'b', 'a', 'c'],
      ['b', 'b', 'd'],
    );
    // old unique: [a, b, c]; new unique: [b, d]
    expect(diff.toAdd).toEqual(['d']);
    expect(diff.toRemove).toEqual(['a', 'c']);
  });

  // ── Order preservation ────────────────────────────────────────────────────

  it('preserves first-occurrence order in toAdd', () => {
    const diff = diffTokens([], ['zeta', 'alpha', 'mu']);
    expect(diff.toAdd).toEqual(['zeta', 'alpha', 'mu']);
  });

  it('preserves first-occurrence order in toRemove', () => {
    const diff = diffTokens(['zeta', 'alpha', 'mu'], []);
    expect(diff.toRemove).toEqual(['zeta', 'alpha', 'mu']);
  });

  it('preserves first-occurrence order from the original array after dedup', () => {
    // After dedup: old = [zeta, alpha]; new = [alpha, beta]
    const diff = diffTokens(['zeta', 'alpha', 'zeta'], ['alpha', 'beta', 'alpha']);
    // toRemove follows first-occurrence in old → zeta came first
    expect(diff.toRemove).toEqual(['zeta']);
    // toAdd follows first-occurrence in new → beta came second in new unique
    expect(diff.toAdd).toEqual(['beta']);
  });
});
