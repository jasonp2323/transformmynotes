import { describe, it, expect } from 'vitest';
import { computeTagDelta } from '../notes';

// ─── computeTagDelta ──────────────────────────────────────────────────────────

describe('computeTagDelta', () => {
  it('no change → both arrays empty', () => {
    expect(computeTagDelta(['a', 'b'], ['a', 'b'])).toEqual({ added: [], removed: [] });
  });

  it('pure add (new tags, nothing removed)', () => {
    expect(computeTagDelta(['a'], ['a', 'b', 'c'])).toEqual({ added: ['b', 'c'], removed: [] });
  });

  it('pure remove (old tags dropped, nothing added)', () => {
    expect(computeTagDelta(['a', 'b', 'c'], ['a'])).toEqual({ added: [], removed: ['b', 'c'] });
  });

  it('mixed add + remove', () => {
    const delta = computeTagDelta(['verbs', 'grammar'], ['grammar', 'phrases']);
    expect(delta.added).toEqual(['phrases']);
    expect(delta.removed).toEqual(['verbs']);
  });

  it('duplicates in inputs are de-duped before comparison', () => {
    // oldTags has duplicate "a", newTags has duplicate "b"
    const delta = computeTagDelta(['a', 'a'], ['b', 'b']);
    expect(delta.added).toEqual(['b']);
    expect(delta.removed).toEqual(['a']);
  });

  it('empty old → everything in new is added', () => {
    expect(computeTagDelta([], ['x', 'y'])).toEqual({ added: ['x', 'y'], removed: [] });
  });

  it('empty new → everything in old is removed', () => {
    expect(computeTagDelta(['x', 'y'], [])).toEqual({ added: [], removed: ['x', 'y'] });
  });

  it('both empty → both arrays empty', () => {
    expect(computeTagDelta([], [])).toEqual({ added: [], removed: [] });
  });
});
