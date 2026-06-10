/**
 * Custom TipTap inline Node for OCR low-confidence tokens ([?]).
 *
 * - Parses <span class="tmn-low-confidence"> from HTML
 * - Renders as a styled span with dotted underline in warning colour
 * - Plain-text extraction yields the literal token "[?]"
 */

import { Node } from '@tiptap/core';

export const LowConfidence = Node.create({
  name: 'lowConfidence',

  group: 'inline',

  inline: true,

  atom: true,

  selectable: true,

  parseHTML() {
    return [{ tag: 'span.tmn-low-confidence' }];
  },

  renderHTML() {
    return [
      'span',
      {
        class: 'tmn-low-confidence',
        style: 'border-bottom: 2px dotted var(--warning); color: var(--warning);',
      },
      '[?]',
    ] as const;
  },

  renderText() {
    return '[?]';
  },
});
