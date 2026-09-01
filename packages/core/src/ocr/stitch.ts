/**
 * Stitch per-page Markdown into a single document.
 *
 * Pure function — no AWS, no I/O.
 */

export interface StitchedPage {
  markdown: string;
  wordCount: number;
}

export interface StitchResult {
  markdown: string;
  wordCount: number;
  pageCount: number;
}

/** Join per-page Markdown with a horizontal-rule separator; sum word counts. */
export function stitchPages(pages: StitchedPage[]): StitchResult {
  if (pages.length === 0) {
    return { markdown: '', wordCount: 0, pageCount: 0 };
  }

  const pageCount = pages.length;
  const wordCount = pages.reduce((sum, p) => sum + p.wordCount, 0);

  const nonEmpty = pages.filter((p) => p.markdown.trim() !== '');
  const markdown = nonEmpty.map((p) => p.markdown).join('\n\n---\n\n');

  return { markdown, wordCount, pageCount };
}
