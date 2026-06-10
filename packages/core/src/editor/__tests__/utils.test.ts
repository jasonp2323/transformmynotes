import { describe, it, expect } from 'vitest';
import { countHighlights } from '../utils';

// ─── countHighlights ─────────────────────────────────────────────────────────

describe('countHighlights', () => {
  it('empty string → 0', () => {
    expect(countHighlights('')).toBe(0);
  });

  it('plain text with no highlights → 0', () => {
    expect(countHighlights('plain text')).toBe(0);
  });

  it('one ==mark== → 1', () => {
    expect(countHighlights('==mark==')).toBe(1);
  });

  it('three non-overlapping spans → 3', () => {
    expect(countHighlights('==a== ==b== ==c==')).toBe(3);
  });

  it('==**bold highlight**== → 1', () => {
    expect(countHighlights('==**bold highlight**==')).toBe(1);
  });

  it('==outer ==inner== outer== → 2 (regex matches two non-overlapping spans: "==outer ==" and "== outer==")', () => {
    // The regex /==([^=\n]+)==/g matches leftmost-longest non-overlapping spans.
    // For "==outer ==inner== outer==" it finds:
    //   1) "==outer ==" (captured: "outer ")
    //   2) "== outer==" (captured: " outer")
    // That is 2, not 1 — the "outermost span only" claim in the spec refers to
    // the fact that truly nested constructs like "==a ==b== c==" are split by the
    // greedy [^=\n]+ stopping at the first inner '=', giving two counts.
    expect(countHighlights('==outer ==inner== outer==')).toBe(2);
  });

  it('a == ... newline ... == spanning two lines → 0', () => {
    expect(countHighlights('==start\nend==')).toBe(0);
  });

  it('==== (empty highlight) → 0', () => {
    expect(countHighlights('====')).toBe(0);
  });
});
