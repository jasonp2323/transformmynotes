/**
 * Editor utility functions.
 */

/**
 * Counts non-overlapping `==...==` highlight spans in a single pass.
 * - Single-line only: a `==` ... `==` that spans a line break is NOT counted.
 * - `====` (empty highlight) is NOT counted (requires at least one inner char).
 * - Nested `==...==` counts the outermost span only.
 */
export function countHighlights(markdown: string): number {
  const matches = markdown.match(/==([^=\n]+)==/g);
  return matches ? matches.length : 0;
}
