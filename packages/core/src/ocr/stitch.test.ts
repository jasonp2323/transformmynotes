import { describe, it, expect } from 'vitest';
import { stitchPages } from './stitch';

// ─── stitchPages ─────────────────────────────────────────────────────────────

describe('stitchPages', () => {
  it('joins 3 non-empty pages with \\n\\n---\\n\\n separator and sums word counts', () => {
    const result = stitchPages([
      { markdown: '# Page 1', wordCount: 2 },
      { markdown: '## Page 2\n\nSome text', wordCount: 4 },
      { markdown: '- item one\n- item two', wordCount: 4 },
    ]);
    expect(result.markdown).toBe('# Page 1\n\n---\n\n## Page 2\n\nSome text\n\n---\n\n- item one\n- item two');
    expect(result.wordCount).toBe(10);
    expect(result.pageCount).toBe(3);
  });

  it('skips empty page (empty string) in body but still counts it in pageCount', () => {
    const result = stitchPages([
      { markdown: '# Page 1', wordCount: 2 },
      { markdown: '', wordCount: 0 },
      { markdown: '# Page 3', wordCount: 2 },
    ]);
    expect(result.markdown).toBe('# Page 1\n\n---\n\n# Page 3');
    expect(result.pageCount).toBe(3);
    expect(result.wordCount).toBe(4);
  });

  it('skips whitespace-only page (spaces) in body but still counts it in pageCount', () => {
    const result = stitchPages([
      { markdown: '# Page 1', wordCount: 2 },
      { markdown: '   ', wordCount: 0 },
      { markdown: '# Page 3', wordCount: 2 },
    ]);
    expect(result.markdown).toBe('# Page 1\n\n---\n\n# Page 3');
    expect(result.pageCount).toBe(3);
    expect(result.wordCount).toBe(4);
  });

  it('single non-empty page — identity: body equals page markdown, no separator, pageCount 1', () => {
    const md = '# Only Page\n\nSome content here.';
    const result = stitchPages([{ markdown: md, wordCount: 5 }]);
    expect(result.markdown).toBe(md);
    expect(result.markdown).not.toContain('---');
    expect(result.wordCount).toBe(5);
    expect(result.pageCount).toBe(1);
  });

  it('zero pages → { markdown: \'\', wordCount: 0, pageCount: 0 }', () => {
    expect(stitchPages([])).toEqual({ markdown: '', wordCount: 0, pageCount: 0 });
  });

  it('all pages empty — body is empty string, pageCount equals N, wordCount is sum', () => {
    const result = stitchPages([
      { markdown: '', wordCount: 0 },
      { markdown: '', wordCount: 0 },
      { markdown: '', wordCount: 0 },
    ]);
    expect(result.markdown).toBe('');
    expect(result.pageCount).toBe(3);
    expect(result.wordCount).toBe(0);
  });

  it('all pages empty with non-zero wordCounts — wordCount is still summed', () => {
    const result = stitchPages([
      { markdown: '', wordCount: 1 },
      { markdown: '  ', wordCount: 2 },
    ]);
    expect(result.markdown).toBe('');
    expect(result.pageCount).toBe(2);
    expect(result.wordCount).toBe(3);
  });
});
